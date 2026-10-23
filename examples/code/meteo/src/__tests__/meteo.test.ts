import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { demanderMeteo } from '../client';
import { TEXTES, messageEchec } from '../i18n';
import { ecrireMeteo, lireMeteo, lireReglage, reglagePour } from '../meteo';
import { DOMAINE, cielDe, lireReponse, urlPrevision } from '../openmeteo';
import { chercherVilles, villeExacte } from '../villes';

const exemple = (nom: string) => new Uint8Array(readFileSync(new URL(`../../exemples/${nom}`, import.meta.url)));
const enc = (s: string) => new TextEncoder().encode(s);

describe('format .meteo', () => {
  it.each(['mes-villes.meteo', 'chalet.meteo'])('relit et réécrit %s à l’octet près', (nom) => {
    const o = exemple(nom);
    const lu = lireMeteo(o);
    if (!lu.ok) throw new Error('illisible');
    expect(lu.repare).toBe(false);
    expect(Buffer.from(ecrireMeteo(lu.lieux))).toEqual(Buffer.from(o));
  });

  it('écarte les coordonnées impossibles', () => {
    const lu = lireMeteo(enc(JSON.stringify({ format: 'filarr-meteo', version: 1, villes: [{ id: 'a', nom: 'Nulle part', lat: 120, lon: 0 }, { id: 'b', nom: 'Lyon', lat: 45.7, lon: 4.8 }] })));
    expect(lu.ok && lu.lieux.map((l) => l.nom)).toEqual(['Lyon']);
    expect(lu.ok && lu.repare).toBe(true);
    expect(lireMeteo(new Uint8Array(0))).toEqual({ ok: true, lieux: [], repare: false });
  });
});

describe('répertoire et réglage du widget', () => {
  it('cherche sans accents ni casse, les débuts de nom d’abord', () => {
    expect(chercherVilles('mont').map((v) => v.nom)).toEqual(['Montpellier', 'Montréal', 'Clermont-Ferrand', 'Chamonix-Mont-Blanc']);
    expect(chercherVilles('geneve')[0].nom).toBe('Genève');
    expect(chercherVilles('  ')).toEqual([]);
    expect(villeExacte('LYON')?.lat).toBe(45.764);
  });

  it('lit une ville, des coordonnées, ou un nom avec coordonnées', () => {
    expect(lireReglage(enc('Lyon'))).toEqual({ ok: true, nom: 'Lyon', lat: 45.764, lon: 4.8357 });
    expect(lireReglage(enc(' 45,76 ; 4,84 '))).toMatchObject({ ok: true, lat: 45.76, lon: 4.84 });
    expect(lireReglage(enc('Chez moi | 46.2 | 6.1'))).toEqual({ ok: true, nom: 'Chez moi', lat: 46.2, lon: 6.1 });
    expect(lireReglage(new Uint8Array(0))).toEqual({ ok: false, raison: 'vide' });
    expect(lireReglage(enc('Atlantide'))).toEqual({ ok: false, raison: 'inconnu' });
    expect(lireReglage(enc('95, 10'))).toEqual({ ok: false, raison: 'inconnu' });
  });

  it('propose le réglage le plus court qui se relit au même lieu', () => {
    expect(reglagePour({ id: 'x', nom: 'Brest', lat: 48.3904, lon: -4.4861 })).toBe('Brest');
    const r = reglagePour({ id: 'x', nom: 'Chalet | du Tour', lat: 46.0012, lon: 6.9481 });
    expect(r).toBe('Chalet   du Tour | 46.0012 | 6.9481');
    expect(lireReglage(enc(r))).toMatchObject({ ok: true, lat: 46.0012, lon: 6.9481 });
  });
});

describe('Open-Meteo', () => {
  it('une adresse stable, sur le seul domaine déclaré', () => {
    const url = urlPrevision(45.76401234, 4.8357);
    expect(new URL(url).hostname).toBe(DOMAINE);
    expect(url).toBe(urlPrevision(45.764, 4.83570001));
    expect(url).toContain('latitude=45.7640&longitude=4.8357');
    const config = JSON.parse(readFileSync(new URL('../../filarr.extension.json', import.meta.url), 'utf8'));
    expect(config.manifest.capabilities.network.domains).toEqual([DOMAINE]);
  });

  it('lit une vraie réponse, et se méfie du reste', () => {
    const r = lireReponse(200, exemple('reponses/prevision-lyon.json'));
    expect(r).toEqual({ ok: true, meteo: { temperature: 16.3, humidite: 62, vent: 11.2, code: 3, heure: '2026-10-23T14:45' } });
    expect(lireReponse(404, enc('{}'))).toEqual({ ok: false, raison: 'statut', statut: 404 });
    expect(lireReponse(200, enc('<html>'))).toEqual({ ok: false, raison: 'forme' });
    expect(lireReponse(200, enc('{"current":{"temperature_2m":"chaud","weather_code":1}}'))).toEqual({ ok: false, raison: 'forme' });
  });

  it('range les codes OMM', () => {
    expect([0, 2, 3, 45, 53, 63, 81, 75, 96, 42].map(cielDe)).toEqual(['clair', 'voile', 'couvert', 'brouillard', 'bruine', 'pluie', 'averses', 'neige', 'orage', 'inconnu']);
  });
});

describe('les refus du réseau', () => {
  const hote = (request: FilarrNetwork['request'] | null) => ({ network: request ? { request } : undefined }) as unknown as FilarrHost;
  const t = TEXTES.fr;

  it('sans capacité accordée : le dire, sans rien tenter', async () => {
    const r = await demanderMeteo(hote(null), 45, 4);
    expect(r).toEqual({ ok: false, type: 'sans_reseau' });
  });

  it('chaque code a son message', async () => {
    for (const [code, attendu] of [
      ['net_refused', t.erreurs.net_refused],
      ['unavailable', t.erreurs.unavailable],
      ['net_unreachable', t.erreurs.net_unreachable],
      ['busy', t.erreurs.busy],
      ['rate_limited', t.erreurs.limite],
      ['net_too_large', t.erreurs.autre('net_too_large')],
    ] as const) {
      const r = await demanderMeteo(hote(() => Promise.reject(new Error(code))), 45, 4);
      if (r.ok) throw new Error('attendu un échec');
      expect(messageEchec(r, t)).toBe(attendu);
    }
  });

  it('un 503 est une réponse, pas un rejet', async () => {
    const r = await demanderMeteo(hote(async () => ({ status: 503, contentType: 'text/plain', body: enc('panne') })), 45, 4);
    expect(r).toEqual({ ok: false, type: 'statut', statut: 503 });
  });

  it('n’envoie ni corps ni en-tête, en GET', async () => {
    const vues: FilarrNetworkRequest[] = [];
    await demanderMeteo(hote(async (req) => (vues.push(req), { status: 200, contentType: 'application/json', body: exemple('reponses/prevision-lyon.json') })), 45, 4);
    expect(vues).toEqual([{ method: 'GET', url: urlPrevision(45, 4) }]);
  });
});
