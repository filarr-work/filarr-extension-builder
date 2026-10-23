import { describe, expect, it } from 'vitest';
import { creerMemoire } from '../memoire';
import {
  CLE_PREFERENCES,
  REPLIEES_MAX,
  basculerRepli,
  ecrirePreferences,
  lirePreferences,
  preferencesParDefaut,
  zoomer,
} from '../preferences';

describe('préférences d’affichage', () => {
  it('rend les défauts quand le stockage est vide, abîmé ou d’une autre version', () => {
    expect(lirePreferences(null)).toEqual(preferencesParDefaut());
    expect(lirePreferences(new TextEncoder().encode('{'))).toEqual(preferencesParDefaut());
    expect(lirePreferences(new TextEncoder().encode('{"v":9,"zoom":2}'))).toEqual(preferencesParDefaut());
  });

  it('fait l’aller-retour, et ne garde que des identifiants', () => {
    const p = basculerRepli({ zoom: 1.25, repliees: [] }, 'n-abc');
    const relu = lirePreferences(ecrirePreferences(p));
    expect(relu).toEqual({ zoom: 1.25, repliees: ['n-abc'] });
    const sale = lirePreferences(new TextEncoder().encode('{"v":1,"zoom":7,"repliees":["ok","<b>",3]}'));
    expect(sale).toEqual({ zoom: 1, repliees: ['ok'] });
  });

  it('borne le zoom et la liste des notes repliées', () => {
    let p = preferencesParDefaut();
    for (let i = 0; i < 10; i++) p = zoomer(p, 1);
    expect(p.zoom).toBe(1.5);
    for (let i = 0; i < 10; i++) p = zoomer(p, -1);
    expect(p.zoom).toBe(0.5);
    for (let i = 0; i < REPLIEES_MAX + 10; i++) p = basculerRepli(p, `n-${i}`);
    expect(p.repliees).toHaveLength(REPLIEES_MAX);
    expect(p.repliees[0]).toBe('n-10');
    expect(basculerRepli(p, 'n-10').repliees).not.toContain('n-10');
  });
});

describe('mémoire sur host.storage', () => {
  /** Un faux stockage dont on tient les promesses en main. */
  function faux() {
    const ecritures: string[] = [];
    const enAttente: (() => void)[] = [];
    const storage: FilarrStorage = {
      get: async () => ecrirePreferences({ zoom: 0.75, repliees: ['n-1'] }),
      set: (cle, octets) => {
        expect(cle).toBe(CLE_PREFERENCES);
        ecritures.push(new TextDecoder().decode(octets as Uint8Array));
        return new Promise<void>((r) => enAttente.push(r));
      },
      delete: async () => undefined,
      keys: async () => [],
    };
    return { storage, ecritures, enAttente };
  }

  it('charge, puis n’a qu’une écriture en vol et emporte la dernière valeur', async () => {
    const f = faux();
    const m = creerMemoire(f.storage, () => undefined);
    expect(await m.charger()).toEqual({ zoom: 0.75, repliees: ['n-1'] });
    m.changer({ zoom: 1, repliees: [] });
    m.changer({ zoom: 1.25, repliees: [] });
    m.changer({ zoom: 1.5, repliees: [] });
    expect(f.ecritures).toHaveLength(1);
    f.enAttente.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    expect(f.ecritures).toHaveLength(2);
    expect(JSON.parse(f.ecritures[1]).zoom).toBe(1.5);
  });

  it('sans la capacité, tout marche en mémoire', async () => {
    const m = creerMemoire(undefined, () => undefined);
    expect(await m.charger()).toEqual(preferencesParDefaut());
    m.changer({ zoom: 0.5, repliees: [] });
    expect(m.valeur.zoom).toBe(0.5);
  });

  it('rapporte un refus du stockage par son code', async () => {
    const codes: (string | null)[] = [];
    const storage: FilarrStorage = {
      get: () => Promise.reject(new Error('storage_locked')),
      set: () => Promise.reject(new Error('quota_exceeded')),
      delete: async () => undefined,
      keys: async () => [],
    };
    const m = creerMemoire(storage, (c) => codes.push(c));
    await m.charger();
    m.changer({ zoom: 1, repliees: [] });
    await new Promise((r) => setTimeout(r, 0));
    expect(codes).toEqual(['storage_locked', 'quota_exceeded']);
  });
});
