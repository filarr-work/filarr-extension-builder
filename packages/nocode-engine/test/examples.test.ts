// @vitest-environment jsdom
/**
 * Chaque exemple sans code du dépôt, monté sur chacun de ses fichiers
 * d'exemple : le document s'ouvre, la vue se dessine, rien n'est réécrit tant
 * qu'on n'a rien touché, et les fonctions déclarées répondent.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtensionHost } from '@filarr/extension-api';
import { exportDocument, extractText, fieldValues, openDocument, validateConfig } from '../src/index';
import { mountEditor } from '../src/ui/editor';
import type { NocodeConfig } from '../src/types';

// Relatif au paquet : sous jsdom, `import.meta.url` n'est pas une URL de fichier.
const ROOT = join(process.cwd(), '..', '..', 'examples', 'nocode');
const cases: [string, string, NocodeConfig, Uint8Array][] = [];
if (existsSync(ROOT)) {
  for (const id of readdirSync(ROOT).sort()) {
    const dir = join(ROOT, id);
    if (!existsSync(join(dir, 'nocode.json'))) continue;
    const config = JSON.parse(readFileSync(join(dir, 'nocode.json'), 'utf8')) as NocodeConfig;
    const samples = join(dir, 'exemples');
    for (const f of readdirSync(samples)) cases.push([id, f, config, new Uint8Array(readFileSync(join(samples, f)))]);
    cases.push([id, '(document neuf)', config, new Uint8Array()]);
  }
}

function host(bytes: Uint8Array): ExtensionHost<'editor'> {
  const container = document.createElement('div');
  document.body.append(container);
  return {
    mode: 'editor',
    container,
    fileName: 'exemple',
    readOnly: false,
    initialBytes: bytes,
    locale: 'fr',
    theme: { scheme: 'light', tokens: {} },
    onThemeChange: () => () => undefined,
    saveBytes: async () => undefined,
    onDirty: () => undefined,
  } as unknown as ExtensionHost<'editor'>;
}

describe('les exemples sans code, montés', () => {
  it('il y en a', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  it.each(cases)('%s — %s', (_id, _file, config, bytes) => {
    expect(validateConfig(config).ok).toBe(true);
    const doc = openDocument(bytes, config);
    expect(doc.ok).toBe(true);
    const h = host(bytes);
    const inst = mountEditor(h, config);
    expect(h.container.querySelector('.nc-error')).toBeNull();
    expect(h.container.querySelector('.nc-view')!.childElementCount).toBe(config.view.length);
    expect(Array.from(inst.getBytes() as Uint8Array)).toEqual(Array.from(bytes));
    if (config.functions?.extractText) expect(typeof extractText(config, bytes, 'fr')).toBe('string');
    if (config.functions?.fields) expect(Object.keys(fieldValues(config, bytes, 'fr')).sort()).toEqual(config.functions.fields.map((f) => f.key).sort());
    for (const e of config.functions?.exports ?? []) expect(exportDocument(config, bytes, e.to, 'fr', 'exemple').byteLength).toBeGreaterThan(0);
    inst.destroy();
  });
});
