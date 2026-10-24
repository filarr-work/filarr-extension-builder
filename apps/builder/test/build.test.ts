import { describe, expect, it } from 'vitest';
import { buildProject as cliBuild } from '../../../packages/cli/src/build';
import { loadProject } from '../../../packages/cli/src/project';
import { buildProject } from '../src/lib/build';
import { utf8 } from '../src/lib/bytes';
import { parseProject } from '../src/lib/project';
import { runChecks } from '../src/lib/checks';
import { toCodeProject } from '../src/lib/tocode';
import { exampleDir, exampleFiles, nodeDeps } from './helpers';

describe('construction dans le navigateur — la même sortie que filarr-ext', () => {
  it('sans code : bundle identique octet pour octet (carnet-recettes)', async () => {
    const files = exampleFiles('nocode', 'carnet-recettes');
    const ours = await buildProject(files, parseProject(files), nodeDeps);
    const theirs = await cliBuild(loadProject(exampleDir('nocode', 'carnet-recettes')));
    expect(ours.ok).toBe(true);
    expect(ours.code).toBe(theirs.code);
    expect(ours.configJson).toBe(theirs.configJson);
  });

  it('avec code : esbuild-wasm et esbuild natif donnent le même bundle, ?worker compris (traces-gpx)', async () => {
    const files = exampleFiles('code', 'traces-gpx');
    const ours = await buildProject(files, parseProject(files), nodeDeps);
    const theirs = await cliBuild(loadProject(exampleDir('code', 'traces-gpx')));
    expect(ours.errors).toEqual([]);
    expect(theirs.ok).toBe(true);
    expect(ours.code).toBe(theirs.code);
  });

  it('avec code : une dépendance embarquée (yjs) se résout sans réseau (tableau-blanc)', async () => {
    const files = exampleFiles('code', 'tableau-blanc');
    const ours = await buildProject(files, parseProject(files), nodeDeps);
    expect(ours.errors).toEqual([]);
    expect(ours.code).toContain('filarrSandboxedPlugin');
  });

  it('refuse une dépendance qui n’est pas embarquée, et dit quoi faire', async () => {
    const files = {
      ...exampleFiles('code', 'compteur-mots'),
      'src/index.ts': utf8(`import { h } from 'preact';\nconsole.log(h);\n`),
    };
    const r = await buildProject(files, parseProject(files), nodeDeps);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/preact.*filarr-ext build/s);
  });

  it('localise une erreur de syntaxe dans le fichier du projet', async () => {
    const files = { ...exampleFiles('code', 'compteur-mots'), 'src/index.ts': utf8('const = 1;\n') };
    const r = await buildProject(files, parseProject(files), nodeDeps);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/^src\/index\.ts:1 — /);
  });

  it('« Passer en code » : le même moteur, appelé depuis src/index.js, se construit et passe les contrôles', async () => {
    const files = toCodeProject(exampleFiles('nocode', 'carnet-recettes'), 'Carnet de recettes');
    const project = parseProject(files);
    expect(project.build).toEqual({ kind: 'code', entry: 'src/index.js' });
    const r = await buildProject(files, project, nodeDeps);
    expect(r.errors).toEqual([]);
    expect(r.code).toContain('carnet-recettes');
    const errors = runChecks(files, r).report.lines.filter((l) => l.level === 'error');
    expect(errors).toEqual([]);
  });
});
