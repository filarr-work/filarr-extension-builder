import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ecrireDepots, lireDepots, nomDepot, nouvelleVersion, type Releve } from '../depots';
import { DOMAINE, EN_TETES, echecDeStatut, lireDepot, lireVersion, releverDepot, urlDepot, urlVersion } from '../github';
import { TEXTES, messageEchec } from '../i18n';

const exemple = (nom: string) => new Uint8Array(readFileSync(new URL(`../../exemples/${nom}`, import.meta.url)));
const enc = (s: string) => new TextEncoder().encode(s);
const manifeste = JSON.parse(readFileSync(new URL('../../filarr.extension.json', import.meta.url), 'utf8')).manifest;

describe('format .github', () => {
  it.each(['veille.github', 'nouveau.github'])('relit et réécrit %s à l’octet près', (nom) => {
    const o = exemple(nom);
    const lu = lireDepots(o);
    if (!lu.ok) throw new Error('illisible');
    expect(lu.repare).toBe(false);
    expect(Buffer.from(ecrireDepots(lu.depots))).toEqual(Buffer.from(o));
  });

  it('écarte doublons et noms impossibles', () => {
    const lu = lireDepots(enc(JSON.stringify({ format: 'filarr-depots', version: 1, depots: [{ nom: 'a/b' }, { nom: 'A/B' }, { nom: '../etc' }, { nom: 'x/y', releve: { etoiles: -1 } }] })));
    if (!lu.ok) throw new Error('illisible');
    expect(lu.depots).toEqual([{ nom: 'a/b', releve: null }, { nom: 'x/y', releve: null }]);
    expect(lu.repare).toBe(true);
  });

  it('reconnaît un nom de dépôt sous toutes ses formes courantes', () => {
    expect(nomDepot('yjs/yjs')).toBe('yjs/yjs');
    expect(nomDepot(' https://github.com/evanw/esbuild.git ')).toBe('evanw/esbuild');
    expect(nomDepot('@jsdom/jsdom/')).toBe('jsdom/jsdom');
    for (const mauvais of ['yjs', 'a/b/c', '../x', 'a/..', '-a/b', 'a b/c', 'https://gitlab.com/a/b']) expect(nomDepot(mauvais)).toBeNull();
  });

  it('signale une nouvelle version, pas un premier relevé', () => {
    const r = (version: string | null): Releve => ({ etoiles: 1, issues: 0, version, publiee: null, le: '2026-10-23T00:00:00.000Z' });
    expect(nouvelleVersion(null, r('v2'))).toBe(false);
    expect(nouvelleVersion(r('v1'), r('v2'))).toBe(true);
    expect(nouvelleVersion(r('v1'), r('v1'))).toBe(false);
    expect(nouvelleVersion(r('v1'), r(null))).toBe(false);
  });
});

describe('api.github.com', () => {
  it('le manifeste déclare ce domaine seul, et le secret sur authorization', () => {
    expect(manifeste.capabilities.network.domains).toEqual([DOMAINE]);
    expect(manifeste.capabilities.network.secrets).toEqual([expect.objectContaining({ id: 'jeton_github', header: 'authorization' })]);
  });

  it('construit des adresses sûres', () => {
    expect(urlDepot('yjs/yjs')).toBe('https://api.github.com/repos/yjs/yjs');
    expect(urlVersion('a/b.c')).toBe('https://api.github.com/repos/a/b.c/releases/latest');
  });

  it('lit les réponses réelles, et le 404 d’une version comme « aucune »', () => {
    expect(lireDepot(200, exemple('reponses/yjs-depot.json'))).toEqual({ ok: true, etoiles: 19012, issues: 143 });
    expect(lireVersion(200, exemple('reponses/yjs-version.json'))).toEqual({ ok: true, version: 'v13.6.27', publiee: '2026-09-29T15:04:10.000Z' });
    expect(lireVersion(404, enc('{"message":"Not Found"}'))).toEqual({ ok: true, version: null, publiee: null });
    expect(lireDepot(200, enc('[]'))).toEqual({ ok: false, echec: { type: 'forme' } });
  });

  it('range les statuts d’erreur de GitHub', () => {
    expect(echecDeStatut(401, enc(''))).toEqual({ type: 'jeton' });
    expect(echecDeStatut(403, enc('{"message":"API rate limit exceeded for 1.2.3.4."}'))).toEqual({ type: 'limite' });
    expect(echecDeStatut(403, enc('{"message":"Resource not accessible"}'))).toEqual({ type: 'statut', statut: 403 });
    expect(echecDeStatut(429, enc(''))).toEqual({ type: 'limite' });
    expect(echecDeStatut(404, enc(''))).toEqual({ type: 'introuvable' });
  });
});

describe('le relevé, par host.network', () => {
  /** Un faux relais qui note les requêtes et répond selon l'adresse. */
  function relais(reponses: Record<string, [number, Uint8Array] | string>) {
    const vues: FilarrNetworkRequest[] = [];
    const host = {
      network: {
        async request(req: FilarrNetworkRequest) {
          vues.push(req);
          const r = reponses[req.url];
          if (typeof r === 'string') throw new Error(r);
          return { status: r[0], contentType: 'application/json', body: r[1] };
        },
      },
    } as unknown as FilarrHost;
    return { host, vues };
  }

  it('deux requêtes, l’une après l’autre, sans jamais l’en-tête du secret', async () => {
    const { host, vues } = relais({
      [urlDepot('yjs/yjs')]: [200, exemple('reponses/yjs-depot.json')],
      [urlVersion('yjs/yjs')]: [200, exemple('reponses/yjs-version.json')],
    });
    const r = await releverDepot(host, 'yjs/yjs', () => new Date('2026-10-23T08:00:00Z'));
    expect(r).toEqual({ ok: true, releve: { etoiles: 19012, issues: 143, version: 'v13.6.27', publiee: '2026-09-29T15:04:10.000Z', le: '2026-10-23T08:00:00.000Z' } });
    expect(vues.map((v) => v.url)).toEqual([urlDepot('yjs/yjs'), urlVersion('yjs/yjs')]);
    for (const v of vues) {
      expect(v.method).toBe('GET');
      expect(v.body).toBeUndefined();
      expect(v.headers).toEqual(EN_TETES);
      expect(Object.keys(v.headers ?? {})).not.toContain('authorization');
    }
  });

  it('s’arrête au premier échec, et le dit', async () => {
    const t = TEXTES.fr;
    const refus = relais({ [urlDepot('a/b')]: 'net_refused' });
    const r1 = await releverDepot(refus.host, 'a/b');
    expect(r1.ok === false && messageEchec(r1.echec, t)).toBe(t.echecs.reseau.net_refused);
    expect(refus.vues).toHaveLength(1);
    const web = await releverDepot(relais({ [urlDepot('a/b')]: 'unavailable' }).host, 'a/b');
    expect(web.ok === false && messageEchec(web.echec, t)).toBe(t.echecs.reseau.unavailable);
    const jeton = await releverDepot(relais({ [urlDepot('a/b')]: [401, enc('{}')] }).host, 'a/b');
    expect(jeton.ok === false && messageEchec(jeton.echec, t)).toBe(t.echecs.jeton);
    const sans = await releverDepot({} as FilarrHost, 'a/b');
    expect(sans).toEqual({ ok: false, echec: { type: 'sans_reseau' } });
    expect(messageEchec({ type: 'reseau', code: 'net_weird' }, t)).toBe(t.echecs.autre('net_weird'));
  });
});
