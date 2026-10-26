import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { ENGINE_VERSION } from '@filarr/nocode-engine';
import { assemblePackage, verifyPackage } from '../../../packages/cli/src/package';
import { runCheck } from '../../../packages/cli/src/check';
import { buildProject } from '../src/lib/build';
import { text, utf8 } from '../src/lib/bytes';
import { runChecks } from '../src/lib/checks';
import { makePackage } from '../src/lib/pack';
import { jsonFile, parseProject, PROJECT_FILE, writeMeta, type FileMap } from '../src/lib/project';
import { exampleDir, exampleFiles, nodeDeps } from './helpers';

const codes = (lines: { level: string; code: string }[], level = 'error') => lines.filter((l) => l.level === level).map((l) => l.code);

function withManifest(files: FileMap, patch: (m: Record<string, unknown>, raw: Record<string, unknown>) => void): FileMap {
  const raw = JSON.parse(text(files[PROJECT_FILE]));
  patch(raw.manifest, raw);
  return { ...files, [PROJECT_FILE]: jsonFile(raw) };
}

async function pack(files: FileMap) {
  const project = parseProject(files);
  const build = await buildProject(files, project, nodeDeps);
  return makePackage(files, build, await nodeDeps.engineSource());
}

describe('empaquetage — le paquet de PACKAGE.md, comme filarr-ext pack', () => {
  it('sans code : mêmes entrées et mêmes octets que l’outil, sauf l’outil déclaré', async () => {
    const files = exampleFiles('nocode', 'carnet-recettes');
    const ours = await pack(files);
    expect(codes(ours.check.report.lines)).toEqual([]);
    expect(ours.ok).toBe(true);
    const cli = await runCheck(exampleDir('nocode', 'carnet-recettes'));
    const theirs = assemblePackage(cli, '1.0.0');
    const a = unzipSync(ours.bytes!);
    const b = unzipSync(theirs.bytes);
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(text(a['bundle.js'])).toBe(text(b['bundle.js']));
    expect(text(a['nocode.json'])).toBe(text(b['nocode.json']));
    const da = JSON.parse(text(a['filarr-package.json']));
    const db = JSON.parse(text(b['filarr-package.json']));
    expect(da.build).toEqual({ kind: 'nocode', tool: 'Filarr Builder 1.0.0', engine: ENGINE_VERSION });
    expect({ ...da, build: null }).toEqual({ ...db, build: null });
    // La relecture de filarr-ext verify, telle quelle (new Function, sous Node), l’accepte.
    expect(verifyPackage(ours.bytes!).report.passed).toBe(true);
    expect(ours.fileName).toBe('carnet-recettes-1.0.0.filarrext');
    expect(ours.bundleSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('avec code : le paquet passe la relecture de l’outil', async () => {
    const files = exampleFiles('code', 'traces-gpx');
    const ours = await pack(files);
    expect(codes(ours.check.report.lines)).toEqual([]);
    expect(verifyPackage(ours.bytes!).report.passed).toBe(true);
    expect(Object.keys(unzipSync(ours.bytes!)).sort()).toEqual(['bundle.js', 'filarr-package.json']);
  });

  it('ne fabrique rien quand un contrôle échoue', async () => {
    const files = withManifest(exampleFiles('nocode', 'carnet-recettes'), (m) => {
      m.bundleHash = 'x';
    });
    const r = await pack(files);
    expect(r.ok).toBe(false);
    expect(r.bytes).toBeUndefined();
    expect(codes(r.check.report.lines)).toEqual(expect.arrayContaining(['computed_field', 'pack_refused']));
  });
});

describe('contrôles avant publication', () => {
  it('avertit d’un fetch() comme filarr-ext check', async () => {
    const base = exampleFiles('code', 'compteur-mots');
    const entry = text(base['src/index.ts']);
    const files = { ...base, 'src/index.ts': utf8(`${entry}\nexport function sonde() { return fetch('https://exemple.org'); }\n`) };
    const project = parseProject(files);
    const build = await buildProject(files, project, nodeDeps);
    const report = runChecks(files, build).report;
    expect(codes(report.lines, 'warning')).toContain('uses_fetch');
  });

  it('refuse une capture JPEG, une version qui ne dépasse pas la dernière publiée, et le réseau en sans code', async () => {
    let files = exampleFiles('nocode', 'carnet-recettes');
    files = { ...files, 'captures/1.jpg': new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]) };
    files = withManifest(files, (m, raw) => {
      raw.screenshots = ['captures/1.jpg'];
      m.capabilities = { ...(m.capabilities as object), network: { domains: ['api.exemple.org'] } };
    });
    files = writeMeta(files, { builder: 1, lastPublished: '1.0.0' });
    const project = parseProject(files);
    const build = await buildProject(files, project, nodeDeps);
    const errors = codes(runChecks(files, build).report.lines);
    expect(errors).toEqual(expect.arrayContaining(['screenshot_jpeg', 'version_not_greater']));
    // network est exclusif de functions : le validateur de capacités de Filarr le refuse d'abord.
    expect(errors.some((c) => c === 'network_exclusive' || c === 'nocode_unused_capability')).toBe(true);
  });

  it('signale un champ obligatoire absent d’un exemple', async () => {
    let files = exampleFiles('nocode', 'carnet-recettes');
    files = writeMeta(files, { builder: 1, required: { titre: true, 'ingredients[].nom': true } });
    files = { ...files, 'exemples/sans-titre.recette': utf8('{"portions": 2, "ingredients": [{"pris": false}]}') };
    const project = parseProject(files);
    const build = await buildProject(files, project, nodeDeps);
    const warns = runChecks(files, build).report.lines.filter((l) => l.code === 'required_missing');
    expect(warns).toHaveLength(1);
    expect(warns[0].message).toMatch(/sans-titre\.recette.*titre, ingredients\[\]\.nom/);
  });
});
