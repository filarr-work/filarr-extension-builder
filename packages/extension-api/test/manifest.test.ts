import { describe, expect, it } from 'vitest';
import {
  estimateSignedManifestBytes,
  isValidPluginIcon,
  readPublisherName,
  validateManifest,
  MAX_SIGNED_MANIFEST_BYTES,
} from '../src/index';

const base = {
  id: 'carnet-recettes',
  name: 'Carnet de recettes',
  version: '1.2.0',
  description: 'Vos recettes en fiches.',
  extensions: ['recette'],
  icon: '🍲',
  category: 'productivity',
  author: 'Camille R.',
  capabilities: { functions: { extractText: true } },
};

const codes = (m: unknown) =>
  validateManifest(m)
    .issues.filter((i) => i.level === 'error')
    .map((i) => i.code);

describe('validateManifest — les bornes du serveur', () => {
  it('accepte le manifeste de PACKAGE.md', () => {
    const v = validateManifest(base);
    expect(v.ok).toBe(true);
    expect(v.manifest).toBe(base);
  });

  it.each([
    ['id commençant par un chiffre', { id: '1abc' }, 'bad_id'],
    ['id d’une lettre', { id: 'a' }, 'bad_id'],
    ['id en majuscules', { id: 'Carnet' }, 'bad_id'],
    ['version préfixée', { version: 'v1.0.0' }, 'bad_version'],
    ['version à deux nombres', { version: '1.0' }, 'bad_version'],
    ['version avec suffixe', { version: '1.0.0-beta' }, 'bad_version'],
    ['nom vide', { name: '' }, 'bad_name'],
    ['nom de 101 caractères', { name: 'x'.repeat(101) }, 'bad_name'],
    ['description absente', { description: undefined }, 'bad_description'],
    ['description de 2001 caractères', { description: 'x'.repeat(2001) }, 'bad_description'],
    ['aucune extension', { extensions: [] }, 'bad_extensions'],
    ['onze extensions', { extensions: 'abcdefghijk'.split('') }, 'bad_extensions'],
    ['extension avec point', { extensions: ['.md'] }, 'bad_extensions'],
    ['icône texte', { icon: 'K' }, 'bad_icon'],
    ['catégorie inconnue', { category: 'games' }, 'bad_category'],
    ['auteur avec forçage bidi', { author: 'abc‮def' }, 'bad_author'],
    ['capacité inconnue', { capabilities: { teleport: true } }, 'unknown_capability'],
    [
      'réseau avec stockage',
      { capabilities: { network: { domains: ['api.example.com'] }, storage: { quota: 2048 } } },
      'network_exclusive',
    ],
    [
      'nouveau document hors extensions',
      { capabilities: { newDocument: [{ ext: 'txt', label: 'Texte' }] } },
      'bad_new_document',
    ],
  ])('refuse : %s', (_nom, patch, code) => {
    expect(codes({ ...base, ...patch })).toContain(code);
  });

  it('accepte une description vide (champ obligatoire, vide permis)', () => {
    const v = validateManifest({ ...base, description: '' });
    expect(v.ok).toBe(true);
    expect(v.issues.map((i) => i.code)).toContain('empty_description');
  });

  it('refuse les champs calculés par Filarr et les champs inconnus', () => {
    expect(codes({ ...base, bundleHash: 'a'.repeat(64) })).toContain('computed_field');
    expect(codes({ ...base, trust: 'sandboxed' })).toContain('computed_field');
    expect(codes({ ...base, previews: [] })).toContain('computed_field');
    expect(codes({ ...base, publisherFingerprint: '0' })).toContain('computed_field');
    expect(codes({ ...base, homepage: 'https://x' })).toContain('unknown_field');
  });

  it('compte le nom en unités UTF-16, comme le serveur', () => {
    // 50 emoji = 100 unités UTF-16 : accepté ; 51 = 102 : refusé.
    expect(validateManifest({ ...base, name: '🍲'.repeat(50) }).ok).toBe(true);
    expect(validateManifest({ ...base, name: '🍲'.repeat(51) }).ok).toBe(false);
  });
});

describe('icône et auteur', () => {
  it('icône : emoji composés acceptés, texte et HTML refusés', () => {
    expect(isValidPluginIcon('🗂️')).toBe(true);
    expect(isValidPluginIcon('👨‍👩‍👧‍👦')).toBe(true);
    expect(isValidPluginIcon('👍🏽')).toBe(true);
    expect(isValidPluginIcon('<b>')).toBe(false);
    expect(isValidPluginIcon('‍')).toBe(false);
    expect(isValidPluginIcon('🍲'.repeat(9))).toBe(false);
  });

  it('auteur : rogné, 80 points de code au plus', () => {
    expect(readPublisherName('  Camille  ')).toBe('Camille');
    expect(readPublisherName('x'.repeat(81))).toBeNull();
    expect(readPublisherName('a\u0007b')).toBeNull();
    expect(readPublisherName('')).toBeNull();
  });
});

describe('taille du manifeste signé', () => {
  it('compte les captures en base64, sous le plafond du worker', () => {
    const quatre = Array.from({ length: 4 }, () => ({ mime: 'image/webp', bytes: 96 * 1024 }));
    const n = estimateSignedManifestBytes(base as never, quatre);
    expect(n).toBeGreaterThan(4 * 128 * 1024);
    expect(n).toBeLessThan(MAX_SIGNED_MANIFEST_BYTES);
  });
});
