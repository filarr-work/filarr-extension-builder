import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — module JS sans déclarations
import { create } from '../src/create.mjs';
// @ts-expect-error — module JS sans déclarations
import { slugify } from '../src/templates.mjs';
import { runCheck } from '../../cli/src/check';

// Sous le paquet : le projet créé résout @filarr/extension-api par le dépôt.
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-output');
const quiet = { log: () => undefined };

async function make(name: string, args: string[]) {
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  return (await create([dir, '--yes', ...args], quiet, false)) as { dir: string; options: { id: string; ext: string } };
}

describe('create-filarr-extension', () => {
  it.each([
    ['texte-ts', ['--template', 'texte', '--lang', 'ts', '--ext', 'note']],
    ['texte-js', ['--template', 'text', '--lang', 'js']],
    ['json-ts', ['--template', 'json', '--ext', 'fiche']],
    ['binaire-js', ['--template', 'binaire', '--lang', 'js', '--ext', 'bin']],
    ['sans-code', ['--template', 'nocode', '--name', 'Mes fiches']],
  ])('%s : un projet qui passe filarr-ext check tel quel', async (name, args) => {
    const r = await make(name, args);
    const files = ['filarr.extension.json', 'package.json', 'README.md', '.gitignore'];
    for (const f of files) expect(existsSync(join(r.dir, f))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(r.dir, 'package.json'), 'utf8'));
    expect(Object.keys(pkg.scripts)).toEqual(expect.arrayContaining(['dev', 'check', 'pack']));
    const check = await runCheck(r.dir);
    expect(check.report.lines.filter((l) => l.level === 'error')).toEqual([]);
    expect(check.report.lines.find((l) => l.code === 'editor_id')?.level).toBe('ok');
  });

  it('un modèle avec code utilise defineExtension', async () => {
    const r = await make('define', ['--template', 'texte']);
    expect(readFileSync(join(r.dir, 'src', 'index.ts'), 'utf8')).toMatch(/defineExtension\(\{\n  id: 'define'/);
  });

  it('n’écrase jamais un dossier non vide', async () => {
    const dir = join(OUT, 'plein');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'garde.txt'), 'x');
    await expect(create([dir, '--yes'], quiet, false)).rejects.toThrow(/pas vide/);
    expect(readFileSync(join(dir, 'garde.txt'), 'utf8')).toBe('x');
  });

  it('refuse une extension de fichier invalide', async () => {
    await expect(make('ext-bad', ['--ext', '.MD'])).rejects.toThrow(/refusée/);
  });

  it('dérive un identifiant valide du nom', () => {
    expect(slugify('Mon Éditeur Génial !')).toBe('mon-editeur-genial');
    expect(slugify('3D')).toBe('ext-3d');
    expect(slugify('x')).toBe('mon-extension');
  });
});
