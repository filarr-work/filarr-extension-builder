import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { parseNocodeConfigFromBundle } from '@filarr/nocode-engine';
import { main } from '../src/main';
import { runCheck } from '../src/check';
import { assemblePackage, verifyPackage } from '../src/package';
import { planPublish, publishUrl } from '../src/publish';
import { checkBundleShape } from '../src/checks';
import { Report } from '../src/report';
import { capture, nocodeConfig, nocodeProject, png, project } from './helpers';

const codes = (r: Report, level: 'error' | 'warning' = 'error') => r.lines.filter((l) => l.level === level).map((l) => l.code);

describe('check — un projet sans code', () => {
  it('passe, et relit le bundle comme Filarr', async () => {
    const dir = project('nocode-ok', nocodeProject());
    const r = await runCheck(dir);
    expect(codes(r.report)).toEqual([]);
    const ok = r.report.lines.filter((l) => l.level === 'ok').map((l) => l.code);
    expect(ok).toEqual(expect.arrayContaining(['project', 'manifest', 'manifest_size', 'build', 'bundle_size', 'bundle_syntax', 'nocode_boot', 'editor_id', 'screenshot']));
  });

  it('refuse un nocode.json qui vise un champ absent, avec son chemin', async () => {
    const dir = project('nocode-bad', { ...nocodeProject(), 'nocode.json': { ...nocodeConfig, view: [{ type: 'number', field: 'quantite' }] } });
    const r = await runCheck(dir);
    expect(r.report.lines.find((l) => l.level === 'error')?.message).toMatch(/view\[0\]\.field/);
  });

  it('refuse un manifeste qui déclare une fonction que la configuration n’offre pas', async () => {
    const files = nocodeProject();
    const m = (files['filarr.extension.json'] as { manifest: Record<string, unknown> }).manifest;
    m.capabilities = { functions: { extractText: true, exports: [{ to: 'csv', label: 'CSV' }] } };
    const r = await runCheck(project('nocode-fn', files));
    expect(codes(r.report)).toContain('nocode_export_missing');
  });
});

describe('check — un projet avec code', () => {
  const manifest = { id: 'notes-essai', name: 'Notes', version: '0.1.0', description: 'Des notes.', extensions: ['note'], icon: '📝' };

  it('passe avec defineExtension (l’API résolue depuis le dépôt)', async () => {
    const dir = project('code-ok', {
      'filarr.extension.json': { manifest, build: { kind: 'code', entry: 'src/index.ts' } },
      'src/index.ts': `import { defineExtension, type EditorHost } from '@filarr/extension-api';
defineExtension({ id: 'notes-essai', editor: { mount(host: EditorHost) {
  const t = document.createElement('textarea'); t.value = new TextDecoder().decode(host.initialBytes); host.container.append(t);
  return { destroy() { t.remove(); }, getBytes: () => new TextEncoder().encode(t.value) };
} } });`,
    });
    const r = await runCheck(dir);
    expect(codes(r.report)).toEqual([]);
    expect(r.report.lines.find((l) => l.code === 'editor_id')?.level).toBe('ok');
  });

  it('refuse un éditeur au mauvais identifiant et avertit des API fermées', async () => {
    const dir = project('code-bad', {
      'filarr.extension.json': { manifest, build: { kind: 'code', entry: 'src/index.js' } },
      'src/index.js': `globalThis.filarrSandboxedPlugin = { editors: [{ id: 'notes-editor', mount(host) { fetch('https://x'); localStorage.x = 1; host.container.innerHTML = '<b>'; return { destroy() {}, getBytes() { return new Uint8Array(); } }; } }] };`,
    });
    const r = await runCheck(dir);
    expect(codes(r.report)).toContain('editor_id');
    expect(codes(r.report, 'warning')).toEqual(expect.arrayContaining(['uses_fetch', 'uses_localstorage', 'uses_innerhtml', 'no_screenshots']));
  });

  it('lit le projet des exemples avec code ({ format: 1, … }) et construit un import ?worker en texte', async () => {
    const dir = project('code-worker', {
      'filarr.extension.json': { format: 1, manifest, listing: { license: 'MIT' }, screenshots: [], build: { kind: 'code', entry: 'src/index.js' } },
      'src/calcul.worker.js': `self.onmessage = (e) => self.postMessage(e.data * 2);`,
      'src/index.js': `import source from './calcul.worker.js?worker';
globalThis.filarrSandboxedPlugin = { editors: [{ id: 'notes-essai-editor', mount(host) {
  const w = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
  return { destroy() { w.terminate(); }, getBytes() { return new Uint8Array(); } };
} }] };`,
    });
    const r = await runCheck(dir);
    expect(codes(r.report)).toEqual([]);
    expect(r.build?.code).toContain('self.onmessage');
    const c = capture();
    expect(await main(['pack', '--dir', dir], c.out)).toBe(0);
    const entries = unzipSync(new Uint8Array(readFileSync(join(dir, 'dist', 'notes-essai-0.1.0.filarrext'))));
    // Le paquet ne porte que kind et tool : ni `entry`, ni le `format` du fichier de projet.
    expect(JSON.parse(new TextDecoder().decode(entries['filarr-package.json'])).build).toEqual({ kind: 'code', tool: expect.stringMatching(/^filarr-ext /) });
    // pack n'écrit que le paquet.
    expect(existsSync(join(dir, 'dist', 'bundle.js'))).toBe(false);
  });

  it('refuse un bundle qui n’est pas un corps de fonction', () => {
    const r = new Report();
    checkBundleShape('export const x = 1;', 20, r);
    expect(r.lines.find((l) => l.code === 'bundle_syntax')?.level).toBe('error');
  });

  it('accepte une vérification de syntaxe fournie (là où new Function est interdit par la CSP)', () => {
    const vus: string[] = [];
    const ok = new Report();
    checkBundleShape('globalThis.filarrSandboxedPlugin = {};', 38, ok, (code) => {
      vus.push(code);
    });
    expect(vus).toEqual(['globalThis.filarrSandboxedPlugin = {};']);
    expect(ok.lines.find((l) => l.code === 'bundle_syntax')?.level).toBe('ok');
    const ko = new Report();
    checkBundleShape('globalThis.filarrSandboxedPlugin = {};', 38, ko, () => {
      throw new Error('Unexpected token');
    });
    expect(ko.lines.find((l) => l.code === 'bundle_syntax')?.message).toContain('Unexpected token');
  });
});

describe('pack et verify', () => {
  it('fabrique EXACTEMENT le paquet du contrat, reproductible', async () => {
    const dir = project('pack-ok', nocodeProject());
    const c = capture();
    expect(await main(['pack', '--dir', dir], c.out)).toBe(0);
    const path = join(dir, 'dist', 'liste-essai-0.1.0.filarrext');
    expect(existsSync(path)).toBe(true);
    const bytes = new Uint8Array(readFileSync(path));
    const entries = unzipSync(bytes);
    expect(Object.keys(entries).sort()).toEqual(['bundle.js', 'filarr-package.json', 'nocode.json', 'screenshots/1.webp']);
    const desc = JSON.parse(new TextDecoder().decode(entries['filarr-package.json']));
    expect(desc).toMatchObject({ format: 1, screenshots: ['screenshots/1.webp'], build: { kind: 'nocode', engine: '1.0.0' } });
    expect(desc.build.tool).toMatch(/^filarr-ext \d+\.\d+\.\d+$/);
    expect(desc.manifest).toEqual((nocodeProject()['filarr.extension.json'] as { manifest: unknown }).manifest);
    const bundle = new TextDecoder().decode(entries['bundle.js']);
    const parsed = parseNocodeConfigFromBundle(bundle);
    expect(parsed.ok && parsed.json).toBe(new TextDecoder().decode(entries['nocode.json']));
    expect(bundle.endsWith(');')).toBe(true);
    // Deux fois le même projet : la même archive.
    expect(await main(['pack', '--dir', dir], capture().out)).toBe(0);
    expect(Array.from(new Uint8Array(readFileSync(path)))).toEqual(Array.from(bytes));
    expect(verifyPackage(bytes).report.passed).toBe(true);
    // La même relecture, la syntaxe vérifiée par un analyseur fourni (Filarr Builder).
    let compiles = 0;
    expect(verifyPackage(bytes, { compile: () => void compiles++ }).report.passed).toBe(true);
    expect(compiles).toBe(1);
  });

  it('déclare l’outil qui assemble le paquet (build.tool), filarr-ext par défaut', async () => {
    const dir = project('pack-tool', nocodeProject());
    const check = await runCheck(dir);
    expect(check.report.passed).toBe(true);
    const parDefaut = assemblePackage(check, '1.0.0').description.build.tool;
    expect(parDefaut).toBe('filarr-ext 1.0.0');
    const { bytes, description } = assemblePackage(check, '1.0.0', { tool: 'Filarr Builder 1.0.0' });
    expect(description.build).toEqual({ kind: 'nocode', tool: 'Filarr Builder 1.0.0', engine: '1.0.0' });
    expect(verifyPackage(bytes).report.passed).toBe(true);
  });

  it('refuse de fabriquer un paquet que Filarr refuserait', async () => {
    const files = nocodeProject();
    (files['filarr.extension.json'] as { manifest: Record<string, unknown> }).manifest.bundleHash = 'a'.repeat(64);
    const dir = project('pack-bad', files);
    const c = capture();
    expect(await main(['pack', '--dir', dir], c.out)).toBe(1);
    expect(existsSync(join(dir, 'dist', 'liste-essai-0.1.0.filarrext'))).toBe(false);
    expect(c.lines.join('\n')).toMatch(/calculé par Filarr/);
  });

  async function packed(): Promise<Record<string, Uint8Array>> {
    const dir = project('pack-base', nocodeProject());
    await main(['pack', '--dir', dir], capture().out);
    return unzipSync(new Uint8Array(readFileSync(join(dir, 'dist', 'liste-essai-0.1.0.filarrext'))));
  }

  it.each([
    ['une image d’icône', (e: Record<string, Uint8Array>) => ({ ...e, 'icon.png': png(16, 16) }), 'archive_unknown_entry'],
    ['une entrée inconnue', (e: Record<string, Uint8Array>) => ({ ...e, 'readme.txt': strToU8('x') }), 'archive_unknown_entry'],
    ['un chemin qui remonte', (e: Record<string, Uint8Array>) => ({ ...e, '../bundle.js': strToU8('x') }), 'archive_entry_name'],
    ['un nocode.json qui diffère du bundle', (e: Record<string, Uint8Array>) => ({ ...e, 'nocode.json': strToU8(JSON.stringify({ ...nocodeConfig, id: 'autre' })) }), 'nocode_mismatch'],
    ['un bundle absent', (e: Record<string, Uint8Array>) => { const { 'bundle.js': _b, ...rest } = e; return rest; }, 'missing_bundle'],
    ['une capture non annoncée', (e: Record<string, Uint8Array>) => ({ ...e, 'screenshots/2.webp': png(8, 8) }), 'screenshot_unlisted'],
    ['une capture SVG', (e: Record<string, Uint8Array>) => ({ ...e, 'screenshots/1.webp': strToU8('<svg/>') }), 'screenshot_type'],
  ])('verify refuse %s', async (_n, alter, code) => {
    const e = alter(await packed());
    const r = verifyPackage(zipSync(e)).report;
    expect(r.passed).toBe(false);
    expect(codes(r)).toContain(code);
  });

  it('verify refuse une bombe de décompression sans la décompresser en entier', async () => {
    const e = await packed();
    const r = verifyPackage(zipSync({ ...e, 'bundle.js': [new Uint8Array(13 * 1024 * 1024), { level: 9 }] })).report;
    expect(codes(r)).toContain('archive_bomb');
  });

  it('verify coupe une entrée dont la taille annoncée MENT (décompression en flux bornée)', async () => {
    const e = await packed();
    const zip = zipSync({ ...e, 'bundle.js': [new Uint8Array(5 * 1024 * 1024), { level: 9 }] });
    // On réécrit la taille décompressée annoncée de bundle.js : 100 octets, partout.
    const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const dec = new TextDecoder();
    for (let i = 0; i < zip.length - 46; i++) {
      if (v.getUint32(i, true) === 0x04034b50 && dec.decode(zip.subarray(i + 30, i + 30 + v.getUint16(i + 26, true))) === 'bundle.js') v.setUint32(i + 22, 100, true);
      if (v.getUint32(i, true) === 0x02014b50 && dec.decode(zip.subarray(i + 46, i + 46 + v.getUint16(i + 28, true))) === 'bundle.js') v.setUint32(i + 24, 100, true);
    }
    const r = verifyPackage(zip).report;
    expect(r.passed).toBe(false);
    expect(r.lines.find((l) => l.code === 'archive_bomb')?.message).toMatch(/dépasse sa borne/);
  });

  it('verify refuse une archive de plus de 8 Mio', () => {
    expect(codes(verifyPackage(new Uint8Array(8 * 1024 * 1024 + 1)).report)).toContain('archive_too_large');
  });
});

describe('publish', () => {
  it('rend filarr://publish?file=<chemin absolu encodé>, sans rien demander', async () => {
    const dir = project('publish', nocodeProject());
    await main(['pack', '--dir', dir], capture().out);
    const path = join(dir, 'dist', 'liste-essai-0.1.0.filarrext');
    const plan = planPublish(path);
    expect(plan.report.passed).toBe(true);
    expect(plan.url).toBe(`filarr://publish?file=${encodeURIComponent(path)}`);
    expect(publishUrl('C:\\a b\\x.filarrext')).toBe('filarr://publish?file=C%3A%5Ca%20b%5Cx.filarrext');
    const c = capture();
    expect(await main(['publish', path, '--print'], c.out)).toBe(0);
    expect(c.lines.join('\n')).toContain(encodeURIComponent(path));
    expect(c.lines.join('\n')).not.toMatch(/mot de passe/i);
  });

  it('refuse ce que Filarr refuserait : extension, fichier absent', () => {
    expect(planPublish('paquet.zip').report.passed).toBe(false);
    expect(planPublish('absent.filarrext').report.passed).toBe(false);
  });
});

describe('main', () => {
  it('codes de sortie et sortie JSON', async () => {
    expect(await main([], capture().out)).toBe(2);
    expect(await main(['--version'], capture().out)).toBe(0);
    expect(await main(['inconnue'], capture().out)).toBe(2);
    const c = capture();
    expect(await main(['check', '--dir', project('json', nocodeProject()), '--json'], c.out)).toBe(0);
    expect(JSON.parse(c.lines.join('\n'))).toMatchObject({ ok: true, errors: 0 });
    expect(await main(['check', '--dir', join(project('vide', { 'a.txt': 'x' }))], capture().out)).toBe(1);
  });

  it('build écrit dist/bundle.js ; seed rend du base64', async () => {
    const dir = project('build', nocodeProject());
    expect(await main(['build', '--dir', dir], capture().out)).toBe(0);
    expect(readFileSync(join(dir, 'dist', 'bundle.js'), 'utf8')).toContain('__filarrNocodeBoot(');
    const c = capture();
    expect(await main(['seed', join(dir, 'exemples', 'marche.essai')], c.out)).toBe(0);
    expect(Buffer.from(c.lines[0], 'base64').toString()).toBe('[ ] lait\n[x] pain\n');
  });
});
