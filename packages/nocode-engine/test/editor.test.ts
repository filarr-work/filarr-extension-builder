// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionHost, HostTheme } from '@filarr/extension-api';
import { createPlugin } from '../src/index';
import { mountEditor } from '../src/ui/editor';
import type { NocodeConfig } from '../src/types';
import { coursesConfig, dec, enc, inventaireConfig, recetteConfig } from './fixtures';

interface Harness {
  host: ExtensionHost<'editor'>;
  saves: Uint8Array[];
  dirty: boolean[];
  pushTheme(scheme: 'light' | 'dark'): void;
  saveBytes: ReturnType<typeof vi.fn>;
}

function harness(bytes: Uint8Array, opts: { readOnly?: boolean; locale?: string; reject?: string } = {}): Harness {
  const container = document.createElement('div');
  document.body.append(container);
  const saves: Uint8Array[] = [];
  const dirty: boolean[] = [];
  let themeCb: ((t: HostTheme) => void) | null = null;
  const saveBytes = vi.fn(async (b: Uint8Array) => {
    saves.push(b as Uint8Array);
    if (opts.reject) throw new Error(opts.reject);
  });
  const host = {
    mode: 'editor',
    container,
    fileName: 'tarte.recette',
    readOnly: opts.readOnly ?? false,
    initialBytes: bytes,
    locale: opts.locale ?? 'fr',
    theme: { scheme: 'light', tokens: {} },
    onThemeChange(cb: (t: HostTheme) => void) {
      themeCb = cb;
      return () => {
        themeCb = null;
      };
    },
    saveBytes,
    onDirty: (d: boolean) => dirty.push(d),
  } as unknown as ExtensionHost<'editor'>;
  return { host, saves, dirty, saveBytes, pushTheme: (s) => themeCb?.({ scheme: s, tokens: {} }) };
}

const hostile = JSON.stringify({
  titre: '<img src=x onerror="globalThis.__pwned=1">',
  portions: 4,
  ingredients: [{ pris: false, nom: '<script>globalThis.__pwned=2</script>' }],
  etapes: ['<b>gras</b>'],
  notes: '<iframe src="https://evil.example"></iframe>',
  secret: 'à garder',
});

function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.textContent = '';
  // Le moteur n'a AUCUN besoin du réseau : le moindre appel fait échouer le test.
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('réseau interdit'); }));
  vi.stubGlobal('XMLHttpRequest', vi.fn(() => { throw new Error('réseau interdit'); }));
  vi.stubGlobal('WebSocket', vi.fn(() => { throw new Error('réseau interdit'); }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('éditeur — affichage sûr', () => {
  it('affiche le HTML du document comme du texte, sans jamais créer d’élément', () => {
    const h = harness(enc(hostile));
    mountEditor(h.host, recetteConfig);
    const c = h.host.container;
    expect(c.querySelector('img, script, iframe, b')).toBeNull();
    const title = c.querySelector('.nc-title') as HTMLInputElement;
    expect(title.value).toBe('<img src=x onerror="globalThis.__pwned=1">');
    const notes = Array.from(c.querySelectorAll('textarea')).map((t) => t.value);
    expect(notes).toContain('<iframe src="https://evil.example"></iframe>');
    expect(notes).toContain('<b>gras</b>');
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('le nom de fichier aussi est du texte', () => {
    const h = harness(enc('{}'));
    (h.host as { fileName: string }).fileName = '<img src=x>.recette';
    mountEditor(h.host, recetteConfig);
    expect(h.host.container.querySelector('img')).toBeNull();
    expect(h.host.container.querySelector('.nc-file')!.textContent).toBe('<img src=x>.recette');
  });
});

describe('éditeur — cycle de vie', () => {
  it('une saisie : onDirty(true), enregistrement à 2 s, puis onDirty(false) ; le reste du fichier est gardé', async () => {
    const h = harness(enc(hostile));
    mountEditor(h.host, recetteConfig);
    type(h.host.container.querySelector('.nc-title') as HTMLInputElement, 'Tarte fine');
    expect(h.dirty).toEqual([true]);
    await vi.advanceTimersByTimeAsync(1999);
    expect(h.saveBytes).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.saveBytes).toHaveBeenCalledTimes(1);
    const relu = JSON.parse(dec(h.saves[0]));
    expect(relu.titre).toBe('Tarte fine');
    expect(relu.secret).toBe('à garder');
    expect(h.dirty).toEqual([true, false]);
  });

  it('getBytes rend les octets reçus tant que rien n’est touché', async () => {
    const original = enc('{"portions":  4,   "titre":"x"}');
    const h = harness(original);
    const inst = mountEditor(h.host, recetteConfig);
    expect(Array.from(inst.getBytes() as Uint8Array)).toEqual(Array.from(original));
  });

  it('pastille nombre : les boutons −/+ respectent les bornes', async () => {
    const h = harness(enc('{"portions": 1}'));
    const inst = mountEditor(h.host, recetteConfig);
    const [minus, plus] = Array.from(h.host.container.querySelectorAll('.nc-stepper button')) as HTMLButtonElement[];
    minus.click();
    expect(JSON.parse(dec(inst.getBytes() as Uint8Array)).portions).toBe(1);
    plus.click();
    plus.click();
    expect(JSON.parse(dec(inst.getBytes() as Uint8Array)).portions).toBe(3);
  });

  it('liste à cocher : ajout par Entrée, coche, retrait', () => {
    const h = harness(enc('[ ] lait\n'));
    const inst = mountEditor(h.host, coursesConfig);
    const c = h.host.container;
    const add = c.querySelector('.nc-add input') as HTMLInputElement;
    add.value = 'pain';
    add.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(c.querySelectorAll('.nc-list .nc-row').length).toBe(2);
    (c.querySelector('.nc-list .nc-check') as HTMLInputElement).click();
    expect(dec(inst.getBytes() as Uint8Array)).toBe('[x] lait\n[ ] pain\n');
    expect(c.querySelector('.nc-progress-text')!.textContent).toBe('1 / 2');
    (c.querySelector('.nc-row-tools button[aria-label="Retirer"]') as HTMLButtonElement).click();
    expect(dec(inst.getBytes() as Uint8Array)).toBe('[ ] pain\n');
  });

  it('tableau CSV : une ligne ajoutée, un total recalculé', () => {
    const h = harness(enc('article,quantite,prix\nvis,10,0.5\n'));
    const inst = mountEditor(h.host, inventaireConfig);
    const c = h.host.container;
    expect(c.querySelector('.nc-total-value')!.textContent).toBe('5,00');
    (c.querySelector('.nc-add button') as HTMLButtonElement).click();
    const inputs = c.querySelectorAll('tbody tr:last-child input');
    type(inputs[0] as HTMLInputElement, 'clou');
    type(inputs[2] as HTMLInputElement, '2');
    expect(c.querySelector('.nc-total-value')!.textContent).toBe('7,00');
    // La colonne « ok » n'est pas ajoutée : rien n'y a été écrit.
    expect(dec(inst.getBytes() as Uint8Array)).toBe('article,quantite,prix\nvis,10,0.5\nclou,1,2\n');
  });
});

describe('éditeur — lecture seule, garantie par le moteur', () => {
  it('tout se fige : contrôles inertes, aucun ajout, aucun enregistrement, octets intacts', async () => {
    const original = enc(hostile);
    const h = harness(original, { readOnly: true });
    const inst = mountEditor(h.host, recetteConfig);
    const c = h.host.container;
    for (const i of Array.from(c.querySelectorAll('input, textarea'))) {
      const el = i as HTMLInputElement;
      expect(el.readOnly || el.disabled).toBe(true);
    }
    for (const b of Array.from(c.querySelectorAll('button, select'))) expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(c.querySelector('.nc-add')).toBeNull();
    expect(c.querySelector('.nc-row-tools')).toBeNull();
    // Même en forçant les événements, rien ne s'écrit.
    type(c.querySelector('.nc-title') as HTMLInputElement, 'pirate');
    const box = c.querySelector('.nc-check') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    for (const t of Array.from(c.querySelectorAll('textarea'))) type(t, 'pirate');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.saveBytes).not.toHaveBeenCalled();
    expect(h.dirty).toEqual([]);
    expect(Array.from(inst.getBytes() as Uint8Array)).toEqual(Array.from(original));
    expect(c.querySelector('.nc-pill-ro')!.textContent).toBe('Lecture seule');
  });

  it('un document qu’enregistrer altérerait s’ouvre en lecture seule', () => {
    const h = harness(enc('{"titre":"a","titre":"b"}'));
    mountEditor(h.host, recetteConfig);
    expect(h.host.container.querySelector('.nc-banner')!.textContent).toMatch(/titre/);
    expect((h.host.container.querySelector('.nc-title') as HTMLInputElement).readOnly).toBe(true);
  });
});

describe('éditeur — erreurs et conflits', () => {
  it('un fichier illisible n’est jamais réécrit', async () => {
    const original = enc('{"a": [[[[[[[[[[[[[[1]]]]]]]]]]]]]}');
    const h = harness(original);
    const inst = mountEditor(h.host, recetteConfig);
    expect(h.host.container.querySelector('.nc-error')).not.toBeNull();
    expect(h.host.container.querySelector('input')).toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.saveBytes).not.toHaveBeenCalled();
    expect(Array.from(inst.getBytes() as Uint8Array)).toEqual(Array.from(original));
  });

  it('conflit de version : bandeau, l’enregistrement automatique s’arrête, on reste « sale »', async () => {
    const h = harness(enc('{}'), { reject: 'item_version_conflict' });
    mountEditor(h.host, recetteConfig);
    const title = h.host.container.querySelector('.nc-title') as HTMLInputElement;
    type(title, 'a');
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.saveBytes).toHaveBeenCalledTimes(1);
    expect(h.host.container.querySelector('.nc-banner[data-type="error"]')).not.toBeNull();
    type(title, 'ab');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.saveBytes).toHaveBeenCalledTimes(1);
    expect(h.dirty).not.toContain(false);
    (h.host.container.querySelector('.nc-btn-primary') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.saveBytes).toHaveBeenCalledTimes(2);
  });

  it('une configuration invalide donne un mount qui jette un message lisible', () => {
    const plugin = createPlugin({ ...recetteConfig, view: [{ type: 'carrousel' }] });
    const editor = plugin.editors!.find((e) => e.id === 'carnet-recettes-editor')!;
    expect(() => editor.mount(harness(enc('{}')).host)).toThrow(/Configuration sans code invalide.*view\[0\]\.type/);
  });
});

describe('éditeur — thème, accent, langue', () => {
  it('suit le thème de l’hôte et pose l’accent validé', () => {
    const h = harness(enc('{}'));
    mountEditor(h.host, recetteConfig);
    const root = h.host.container.querySelector('.nc-root') as HTMLElement;
    expect(root.getAttribute('data-scheme')).toBe('light');
    h.pushTheme('dark');
    expect(root.getAttribute('data-scheme')).toBe('dark');
    expect(root.style.getPropertyValue('--nc-accent')).toBe('#c2410c');
  });

  it('parle anglais quand l’hôte le demande', () => {
    const h = harness(enc('{}'), { locale: 'en-GB' });
    mountEditor(h.host, recetteConfig);
    expect(h.host.container.querySelector('.nc-btn-primary')!.textContent).toBe('Save');
    expect(h.host.container.querySelector('.nc-badge-label')!.textContent).toBe('Catégorie');
  });

  it('destroy libère tout et annule l’enregistrement en attente', async () => {
    const h = harness(enc('{}'));
    const inst = mountEditor(h.host, recetteConfig);
    type(h.host.container.querySelector('.nc-title') as HTMLInputElement, 'x');
    inst.destroy();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.saveBytes).not.toHaveBeenCalled();
    expect(h.host.container.childElementCount).toBe(0);
  });
});

describe('éditeur — chaque configuration de référence monte', () => {
  const cases: [string, NocodeConfig, string][] = [
    ['json vide', recetteConfig, ''],
    ['csv vide', inventaireConfig, ''],
    ['lignes vides', coursesConfig, ''],
  ];
  it.each(cases)('%s', (_n, config, text) => {
    const h = harness(enc(text));
    const inst = mountEditor(h.host, config);
    expect(h.host.container.querySelector('.nc-view')!.childElementCount).toBeGreaterThan(0);
    expect((inst.getBytes() as Uint8Array).length).toBe(0);
  });
});
