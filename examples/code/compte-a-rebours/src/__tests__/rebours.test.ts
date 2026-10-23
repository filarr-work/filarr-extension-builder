import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { texteCompte } from '../affichage';
import { TEXTES, depuis } from '../i18n';
import {
  BLOC_MAX_OCTETS,
  chronologique,
  dateCanonique,
  demainNeufHeures,
  depuisChampLocal,
  ecart,
  ecrireBloc,
  ecrireRebours,
  formatCompte,
  lireBloc,
  lireRebours,
  prochain,
  versChampLocal,
} from '../rebours';

const exemple = (nom: string) => new Uint8Array(readFileSync(new URL(`../../exemples/${nom}`, import.meta.url)));
const json = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

describe('format .rebours', () => {
  it.each(['annee.rebours', 'lancement.rebours'])('relit et réécrit %s à l’octet près', (nom) => {
    const o = exemple(nom);
    const lu = lireRebours(o);
    if (!lu.ok) throw new Error('illisible');
    expect(lu.repare).toBe(false);
    expect(Buffer.from(ecrireRebours(lu.evenements))).toEqual(Buffer.from(o));
  });

  it('0 octet = liste neuve ; les formats étrangers et futurs sont refusés', () => {
    expect(lireRebours(new Uint8Array(0))).toEqual({ ok: true, evenements: [], repare: false });
    expect(lireRebours(json({ format: 'x' }))).toEqual({ ok: false, raison: 'format' });
    expect(lireRebours(json({ format: 'filarr-rebours', version: 2, evenements: [] }))).toEqual({ ok: false, raison: { version: 2 } });
  });

  it('écarte les dates invalides, rend les autres canoniques', () => {
    const lu = lireRebours(
      json({
        format: 'filarr-rebours',
        version: 1,
        evenements: [
          { id: 'a', titre: 'ok', date: '2027-01-01T10:00:00+01:00', note: '' },
          { id: 'b', titre: 'jamais', date: 'demain', note: '' },
          { id: 'a', titre: 42, date: '2027-02-01T00:00:00Z' },
        ],
      })
    );
    if (!lu.ok) throw new Error('illisible');
    expect(lu.repare).toBe(true);
    expect(lu.evenements.map((e) => e.date)).toEqual(['2027-01-01T09:00:00.000Z', '2027-02-01T00:00:00.000Z']);
    expect(lu.evenements[1].id).not.toBe('a');
    expect(lu.evenements[1].titre).toBe('');
    expect(dateCanonique('x'.repeat(50))).toBeNull();
  });

  it('trie dans l’ordre du temps et trouve le prochain', () => {
    const lu = lireRebours(exemple('annee.rebours'));
    if (!lu.ok) throw new Error('illisible');
    const melange = [...lu.evenements].reverse();
    expect(chronologique(melange).map((e) => e.id)).toEqual(lu.evenements.map((e) => e.id));
    expect(prochain(lu.evenements, Date.parse('2026-10-23T12:00:00Z'))?.titre).toBe('Départ en vacances');
    expect(prochain(lu.evenements, Date.parse('2030-01-01T00:00:00Z'))).toBeNull();
  });
});

describe('données du bloc', () => {
  it('0 octet = bloc neuf ; illisible = neuf aussi, mais signalé', () => {
    expect(lireBloc(new Uint8Array(0))).toEqual({ donnees: { titre: '', date: null }, lisible: true });
    expect(lireBloc(new TextEncoder().encode('{oups'))).toEqual({ donnees: { titre: '', date: null }, lisible: false });
    expect(lireBloc(json({ v: 2 })).lisible).toBe(false);
  });

  it('fait l’aller-retour, et reste petit', () => {
    const o = exemple('bloc-anniversaire.json');
    const lu = lireBloc(o);
    expect(lu.donnees).toEqual({ titre: 'Anniversaire de Léa', date: '2027-03-02T18:00:00.000Z' });
    expect(Buffer.from(ecrireBloc(lu.donnees))).toEqual(Buffer.from(o));
    expect(ecrireBloc({ titre: 'x'.repeat(10_000), date: null }).byteLength).toBeLessThan(BLOC_MAX_OCTETS);
  });
});

describe('compte à rebours', () => {
  it('découpe un écart en jours, heures, minutes, secondes', () => {
    const e = ecart(0, ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000 + 999);
    expect(e).toMatchObject({ passe: false, jours: 2, heures: 3, minutes: 4, secondes: 5 });
    expect(formatCompte(e, 'fr')).toBe('2 j 03 h 04 min 05 s');
    expect(formatCompte(ecart(0, 61_000), 'en')).toBe('00 h 01 min 01 s');
    expect(ecart(10_000, 0).passe).toBe(true);
  });

  it('dit « dans … », « c’est maintenant » ou « il y a … »', () => {
    const t = TEXTES.fr;
    expect(texteCompte('2026-01-01T00:01:00.000Z', Date.parse('2026-01-01T00:00:00Z'), t, 'fr')).toBe('dans 00 h 01 min 00 s');
    expect(texteCompte('2026-01-01T00:00:00.000Z', Date.parse('2026-01-01T00:00:00.400Z'), t, 'fr')).toBe("c'est maintenant");
    expect(texteCompte('2026-01-01T00:00:00.000Z', Date.parse('2026-01-04T00:00:00Z'), t, 'fr')).toBe('il y a 3 jours');
    expect(depuis(90 * 60_000, 'en')).toBe('1 hour ago');
    expect(texteCompte(null, 0, t, 'fr')).toBe('');
  });

  it('passe de l’heure locale du champ à l’instant UTC, et retour', () => {
    const iso = depuisChampLocal('2027-03-02T19:00');
    expect(iso).not.toBeNull();
    expect(versChampLocal(iso)).toBe('2027-03-02T19:00');
    expect(new Date(iso!).getHours()).toBe(19);
    expect(depuisChampLocal('19 h')).toBeNull();
    expect(versChampLocal(null)).toBe('');
  });

  it('propose demain à 9 h, heure locale', () => {
    const d = new Date(demainNeufHeures(new Date(2026, 9, 23, 22, 15).getTime()));
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([24, 9, 0]);
  });
});
