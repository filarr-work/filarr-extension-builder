// @vitest-environment jsdom
import { beforeAll, describe, expect, inject, it } from 'vitest';
import {
  BOOT_CALL,
  buildNocodeBundle,
  checkNocodeAgainstManifest,
  ENGINE_VERSION,
  NocodeConfigError,
  parseNocodeConfigFromBundle,
  serializeNocodeConfig,
} from '../src/index';
import type { NocodeConfig } from '../src/types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recetteConfig } from './fixtures';

let engine = '';
beforeAll(() => {
  engine = inject('engineSource');
});

/** Exécute un bundle EXACTEMENT comme la page bac à sable : corps de fonction, globalThis en paramètre. */
function runLikeSandbox(code: string): Record<string, unknown> {
  const g: Record<string, unknown> = Object.create(globalThis);
  new Function('globalThis', code)(g);
  return g;
}

describe('buildNocodeBundle — PACKAGE.md §4', () => {
  it('les deux dernières lignes, exactement, sans rien après « ); »', () => {
    const bundle = buildNocodeBundle(recetteConfig, { engineVersion: '1.0.0', engineSource: engine });
    const lignes = bundle.split('\n');
    expect(lignes[lignes.length - 2]).toBe('/* filarr-nocode engine=1.0.0 */');
    expect(lignes[lignes.length - 1]).toBe(`${BOOT_CALL}${serializeNocodeConfig(recetteConfig)});`);
    expect(bundle.endsWith(');')).toBe(true);
    expect(bundle.startsWith(engine.trimEnd())).toBe(true);
  });

  it('JSON sur une ligne, en ASCII, relu à l’identique par JSON.parse sans évaluation', () => {
    const avecSeparateurs: NocodeConfig = { ...recetteConfig, fields: [{ ...recetteConfig.fields[0], default: 'Titre   🍲 é' }, ...recetteConfig.fields.slice(1)] };
    const bundle = buildNocodeBundle(avecSeparateurs, { engineSource: engine });
    expect(/^[\x00-\x7f]*$/.test(bundle.split('\n').pop()!)).toBe(true);
    const parsed = parseNocodeConfigFromBundle(bundle);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.config).toEqual(avecSeparateurs);
    expect(parsed.engineVersion).toBe(ENGINE_VERSION);
    expect(parsed.json).toBe(serializeNocodeConfig(avecSeparateurs));
    expect(parsed.engineSource).toBe(engine.trimEnd());
  });

  it('refuse de construire une configuration que le moteur refuserait', () => {
    expect(() => buildNocodeBundle({ ...recetteConfig, accent: 'rouge' }, { engineSource: engine })).toThrow(NocodeConfigError);
    expect(() => buildNocodeBundle(recetteConfig, { engineSource: engine, engineVersion: 'v1' })).toThrow(/version/);
  });

  it('la version du moteur est celle du paquet', () => {
    expect(ENGINE_VERSION).toBe(JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version);
  });

  it('relecture : refuse ce qui n’a pas les deux lignes finales', () => {
    expect(parseNocodeConfigFromBundle('console.log(1)').ok).toBe(false);
    expect(parseNocodeConfigFromBundle('x\n/* filarr-nocode engine=1.0 */\nglobalThis.__filarrNocodeBoot({});').ok).toBe(false);
    expect(parseNocodeConfigFromBundle('x\n/* filarr-nocode engine=1.0.0 */\nglobalThis.__filarrNocodeBoot({a:1});').ok).toBe(false);
    expect(parseNocodeConfigFromBundle('x\n/* filarr-nocode engine=1.0.0 */\nglobalThis.__filarrNocodeBoot({});\n').ok).toBe(true);
  });
});

describe('le bundle dans la page', () => {
  it('pose filarrSandboxedPlugin avec <id>-editor et les fonctions déclarées', () => {
    const g = runLikeSandbox(buildNocodeBundle(recetteConfig, { engineSource: engine }));
    const plugin = g.filarrSandboxedPlugin as { editors: { id: string }[]; functions: Record<string, unknown> };
    expect(plugin.editors[0].id).toBe('carnet-recettes-editor');
    expect(plugin.editors.map((e) => e.id)).toContain('dev-local-1-editor');
    expect(Object.keys(plugin.functions).sort()).toEqual(['export', 'extractText', 'fields']);
  });

  it('un bundle retouché à la main (prototype dans la configuration) est refusé au montage', () => {
    const forge = `${engine.trimEnd()}\n/* filarr-nocode engine=1.0.0 */\n${BOOT_CALL}{"__proto__":{"nocode":1},"id":"carnet-recettes","format":{"type":"json"},"fields":[{"key":"t","type":"text"}],"view":[{"type":"title","field":"t"}]});`;
    // JSON.parse y lit une CLÉ (Filarr la montrerait) ; le moteur, lui, y voit un prototype et refuse.
    expect(parseNocodeConfigFromBundle(forge).ok).toBe(true);
    const g = runLikeSandbox(forge);
    const plugin = g.filarrSandboxedPlugin as { editors: { id: string; mount: () => unknown }[] };
    expect(() => plugin.editors[0].mount()).toThrow(/Configuration sans code invalide/);
  });
});

describe('cohérence avec le manifeste', () => {
  const manifest = {
    id: 'carnet-recettes',
    name: 'Carnet',
    version: '1.0.0',
    description: '',
    extensions: ['recette'],
    capabilities: {
      functions: {
        extractText: true as const,
        fields: [
          { key: 'portions', label: 'Portions', type: 'number' as const },
          { key: 'temps', label: 'Temps', type: 'number' as const },
          { key: 'categorie', label: 'Catégorie', type: 'text' as const },
        ],
        exports: [{ to: 'md' as const, label: 'Markdown' }],
      },
    },
  };

  it('accepte un manifeste qui dit la même chose', () => {
    expect(checkNocodeAgainstManifest(recetteConfig, manifest).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('refuse un identifiant différent, une colonne absente ou mal typée, une capacité inutile', () => {
    const codes = checkNocodeAgainstManifest(recetteConfig, {
      ...manifest,
      id: 'autre',
      capabilities: {
        storage: { quota: 2048 },
        functions: { thumbnail: true, fields: [{ key: 'portions', label: 'P', type: 'text' }, { key: 'note', label: 'N', type: 'number' }] },
      },
    }).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['nocode_id_mismatch', 'nocode_unused_capability', 'nocode_no_thumbnail', 'nocode_field_type', 'nocode_field_missing']));
  });

  it('vérifie que le modèle de départ s’ouvre', () => {
    const seed = btoa('{"titre": [');
    const issues = checkNocodeAgainstManifest(recetteConfig, { ...manifest, capabilities: { newDocument: [{ ext: 'recette', label: 'Recette', seed }] } });
    expect(issues.map((i) => i.code)).toContain('nocode_seed_unreadable');
  });
});
