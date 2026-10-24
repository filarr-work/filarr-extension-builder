import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { equalBytes } from '../src/lib/bytes';
import { createProjectFiles, treeLines } from '../src/lib/templates';
import { exportProjectZip, importProjectZip, ImportError, zipOf } from '../src/lib/zip';
import { parseProject, PROJECT_FILE } from '../src/lib/project';
import { exampleFiles } from './helpers';

const PROJET = JSON.stringify({ manifest: { id: 'essai', name: 'Essai', version: '0.1.0', description: '', extensions: ['ess'] }, build: { kind: 'nocode', config: 'nocode.json' } });

describe('projet en .zip', () => {
  it('aller-retour : la même carte de fichiers, sous un dossier <id>/', () => {
    const files = exampleFiles('code', 'planche-photos');
    const zip = exportProjectZip(files, 'planche-photos');
    const back = importProjectZip(zip).files;
    expect(Object.keys(back).sort()).toEqual(Object.keys(files).sort());
    for (const k of Object.keys(files)) expect(equalBytes(back[k], files[k]), k).toBe(true);
  });

  it('refuse les chemins qui sortent du projet et ignore node_modules', () => {
    expect(() => importProjectZip(zipOf({ [PROJECT_FILE]: PROJET, '../evil.txt': 'x' }))).toThrow(ImportError);
    expect(() => importProjectZip(zipOf({ [PROJECT_FILE]: PROJET, 'C:/evil.txt': 'x' }))).toThrow(ImportError);
    const r = importProjectZip(zipOf({ [`p/${PROJECT_FILE}`]: PROJET, 'p/node_modules/x/index.js': 'x', 'p/src/a.ts': 'a' }));
    expect(Object.keys(r.files).sort()).toEqual([PROJECT_FILE, 'src/a.ts']);
  });

  it('refuse une archive sans projet, et une entrée qui ment sur sa taille', () => {
    expect(() => importProjectZip(zipOf({ 'a.txt': 'x' }))).toThrow(/filarr\.extension\.json/);
    const zip = zipSync({ [PROJECT_FILE]: new TextEncoder().encode(PROJET), 'gros.bin': [new Uint8Array(200_000), { level: 9 }] });
    // Taille décompressée annoncée ramenée à 10 octets, dans l'en-tête local et le répertoire central.
    const view = new DataView(zip.buffer);
    let patched = 0;
    for (let i = 0; i < zip.length - 4; i++) {
      const sig = view.getUint32(i, true);
      if (sig === 0x04034b50 && new TextDecoder().decode(zip.subarray(i + 30, i + 30 + view.getUint16(i + 26, true))) === 'gros.bin') {
        view.setUint32(i + 22, 10, true);
        patched++;
      }
      if (sig === 0x02014b50 && new TextDecoder().decode(zip.subarray(i + 46, i + 46 + view.getUint16(i + 28, true))) === 'gros.bin') {
        view.setUint32(i + 24, 10, true);
        patched++;
      }
    }
    expect(patched).toBe(2);
    expect(() => importProjectZip(zip)).toThrow(/taille annoncée|refusée/);
  });
});

describe('modèles de départ', () => {
  it('chaque modèle donne un projet que filarr-ext saurait lire', async () => {
    for (const [mode, template] of [['code', 'texte'], ['code', 'json'], ['code', 'binaire'], ['code', 'vierge'], ['nocode', 'nocode-fiche'], ['nocode', 'nocode-vierge']] as const) {
      const files = await createProjectFiles({ mode, name: 'Mon essai', id: 'mon-essai', extensions: ['ess', 'es2'], template, lang: 'ts' });
      const p = parseProject(files);
      expect(p.manifest).toMatchObject({ id: 'mon-essai', name: 'Mon essai', extensions: ['ess', 'es2'] });
      expect(p.build.kind).toBe(mode);
    }
  });

  it('dessine l’arborescence comme la maquette', () => {
    expect(treeLines('traces-gpx', ['src/index.ts', 'exemples/exemple.gpx', 'exemples/vide.gpx', 'filarr.extension.json', 'package.json', 'README.md'])).toEqual([
      'traces-gpx/',
      '├─ src/index.ts',
      '├─ exemples/',
      '│  ├─ exemple.gpx',
      '│  └─ vide.gpx',
      '├─ filarr.extension.json',
      '├─ package.json',
      '└─ README.md',
    ]);
  });
});
