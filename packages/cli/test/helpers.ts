import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

/** Sous le paquet (et non dans /tmp) : un projet d'essai y résout @filarr/extension-api par le dépôt. */
export const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-output');

export function project(name: string, files: Record<string, string | Uint8Array | object>): string {
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  for (const [rel, content] of Object.entries(files)) {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof content === 'string' || content instanceof Uint8Array ? content : JSON.stringify(content, null, 2));
  }
  return dir;
}

/** Un vrai PNG (IHDR, IDAT, IEND) de la taille voulue, avec `pad` octets de bruit en plus. */
export function png(width: number, height: number, pad = 0): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = new Uint8Array((width * 3 + 1) * height);
  const idat = new Uint8Array(deflateSync(raw));
  const noise = new Uint8Array(pad).map((_, i) => (i * 2654435761) >>> 24);
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), ...(pad ? [chunk('tEXt', noise)] : []), chunk('IEND', new Uint8Array())];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export const nocodeConfig = {
  nocode: 1,
  id: 'liste-essai',
  format: { type: 'lines' },
  fields: [{ key: 'text', type: 'text', label: 'Article' }],
  view: [{ type: 'progress' }, { type: 'checklist' }],
  functions: { extractText: true },
};

export const nocodeProject = (over: Record<string, unknown> = {}) => ({
  'filarr.extension.json': {
    manifest: {
      id: 'liste-essai',
      name: 'Liste d’essai',
      version: '0.1.0',
      description: 'Une liste à cocher.',
      extensions: ['essai'],
      icon: '🛒',
      category: 'productivity',
      capabilities: { functions: { extractText: true } },
    },
    listing: { license: 'MIT', releaseNotes: 'Première version.' },
    screenshots: ['captures/1.png'],
    build: { kind: 'nocode', config: 'nocode.json' },
    ...over,
  },
  'nocode.json': nocodeConfig,
  'captures/1.png': png(64, 40),
  'exemples/marche.essai': '[ ] lait\n[x] pain\n',
});

export const capture = () => {
  const lines: string[] = [];
  const errors: string[] = [];
  return { out: { log: (s: string) => lines.push(s), error: (s: string) => errors.push(s) }, lines, errors };
};
