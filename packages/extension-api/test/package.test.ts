import { describe, expect, it } from 'vitest';
import { ENTRY_NAME_RE, sniffImage, validatePackageDescription } from '../src/index';

const exemple = {
  format: 1,
  manifest: {
    id: 'carnet-recettes',
    name: 'Carnet de recettes',
    version: '1.2.0',
    description: 'Vos recettes en fiches : portions, ingrédients à cocher, étapes.',
    extensions: ['recette'],
    icon: '🍲',
    category: 'productivity',
    author: 'Camille R.',
    capabilities: { functions: { extractText: true } },
  },
  listing: {
    releaseNotes: 'Champ « temps » en minutes.',
    sourceUrl: 'https://github.com/exemple/carnet-recettes',
    license: 'MIT',
  },
  screenshots: ['screenshots/1.webp'],
  build: { kind: 'nocode', tool: 'filarr-ext 1.0.0', engine: '1.0.0' },
};

describe('filarr-package.json (PACKAGE.md §3)', () => {
  it('accepte l’exemple du contrat', () => {
    const v = validatePackageDescription(exemple);
    expect(v.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it.each([
    ['format inconnu', { format: 2 }, 'bad_format'],
    ['champ inconnu', { signature: 'x' }, 'unknown_field'],
    ['source en http', { listing: { sourceUrl: 'http://x.org' } }, 'bad_source_url'],
    ['licence trop longue', { listing: { license: 'x'.repeat(41) } }, 'bad_license'],
    ['notes trop longues', { listing: { releaseNotes: 'x'.repeat(2001) } }, 'bad_release_notes'],
    ['capture mal nommée', { screenshots: ['shot.png'] }, 'bad_screenshots'],
    ['moteur absent en sans code', { build: { kind: 'nocode', tool: 'x' } }, 'bad_engine'],
    ['moteur en code', { build: { kind: 'code', tool: 'x', engine: '1.0.0' } }, 'bad_engine'],
    ['outil trop long', { build: { kind: 'code', tool: 'x'.repeat(61) } }, 'bad_tool'],
    [
      'empreinte du bundle',
      { manifest: { ...exemple.manifest, bundleHash: 'a'.repeat(64) } },
      'computed_field',
    ],
  ])('refuse : %s', (_nom, patch, code) => {
    const v = validatePackageDescription({ ...exemple, ...patch });
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain(code);
  });

  it('refuse une description de plus de 64 Kio', () => {
    expect(validatePackageDescription(exemple, 64 * 1024 + 1).ok).toBe(false);
  });

  it('noms d’entrées : un niveau de dossier, jamais .. ni chemin absolu', () => {
    expect(ENTRY_NAME_RE.test('screenshots/1.webp')).toBe(true);
    expect(ENTRY_NAME_RE.test('../bundle.js')).toBe(false);
    expect(ENTRY_NAME_RE.test('/bundle.js')).toBe(false);
    expect(ENTRY_NAME_RE.test('a/b/c.js')).toBe(false);
    expect(ENTRY_NAME_RE.test('Bundle.js')).toBe(false);
  });
});

describe('sniffImage — le type lu dans les octets', () => {
  it('PNG : type et taille depuis IHDR', () => {
    const png = new Uint8Array(33);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    png.set([0, 0, 0, 64, 0, 0, 0, 48], 16);
    expect(sniffImage(png)).toEqual({ mime: 'image/png', width: 64, height: 48 });
  });

  it('JPEG : taille depuis le segment SOF0', () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 120, 0, 160, 3, 0, 0, 0, 0,
    ]);
    expect(sniffImage(jpeg)).toEqual({ mime: 'image/jpeg', width: 160, height: 120 });
  });

  it('WebP VP8X : taille sur 24 bits', () => {
    const webp = new Uint8Array(30);
    webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
    webp.set([99, 0, 0], 24);
    webp.set([49, 0, 0], 27);
    expect(sniffImage(webp)).toEqual({ mime: 'image/webp', width: 100, height: 50 });
  });

  it('refuse le SVG et le texte', () => {
    expect(
      sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))
    ).toBeNull();
    expect(sniffImage(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
