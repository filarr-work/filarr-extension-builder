/**
 * create — `npm create filarr-extension@latest <nom>`.
 *
 * Pose les questions (type de fichier, modèle, langage), puis écrit un projet
 * prêt : il passe `filarr-ext check` tel quel. Sans terminal, ou avec `--yes`,
 * aucune question : les options (`--ext`, `--template`, `--lang`, `--name`) ou
 * leurs valeurs par défaut font foi — c'est ainsi que les tests le pilotent.
 *
 * Il n'écrase rien : un dossier qui existe et n'est pas vide est refusé.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { LANGS, projectFiles, slugify, TEMPLATES } from './templates.mjs';

const ALIASES = { text: 'texte', txt: 'texte', binary: 'binaire', bin: 'binaire', 'no-code': 'nocode', 'sans-code': 'nocode', typescript: 'ts', javascript: 'js' };
const EXT_RE = /^[a-z0-9]{1,10}$/;

export function parseArgs(argv) {
  const opts = { positionals: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-y' || a === '--yes') opts.yes = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
      opts[name] = eq > 0 ? a.slice(eq + 1) : argv[++i];
    } else opts.positionals.push(a);
  }
  return opts;
}

const HELP = `npm create filarr-extension@latest <nom> [-- options]

  --template texte|json|binaire|nocode   le modèle (défaut : texte)
  --lang ts|js                           le langage, pour les modèles avec code (défaut : ts)
  --ext <extension>                      le type de fichier, sans point (défaut : tiré du nom)
  --name "<nom affiché>"                 le nom de l’extension
  --yes                                  aucune question
`;

function norm(v, list, fallback) {
  const x = ALIASES[String(v ?? '').toLowerCase()] ?? String(v ?? '').toLowerCase();
  return list.includes(x) ? x : fallback;
}

function toolVersion() {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  } catch {
    return '1.0.0';
  }
}

async function ask(rl, question, fallback, valid) {
  for (;;) {
    const r = (await rl.question(`${question} (${fallback}) : `)).trim();
    const v = r === '' ? fallback : r;
    if (!valid || valid(v)) return v;
    console.log('  valeur refusée, réessayez.');
  }
}

/**
 * Crée le projet. `io` : où écrire les messages (console par défaut). Rend le
 * dossier créé et les options retenues.
 */
export async function create(argv, io = console, interactive = process.stdin.isTTY === true) {
  const a = parseArgs(argv);
  if (a.help) {
    io.log(HELP);
    return null;
  }
  const target = a.positionals[0];
  let o = {
    dir: target ? resolve(target) : null,
    name: a.name ?? (target ? basename(resolve(target)) : 'Mon extension'),
    template: norm(a.template, TEMPLATES, 'texte'),
    lang: norm(a.lang, LANGS, 'ts'),
    ext: a.ext,
  };
  if (interactive && !a.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (!o.dir) o.dir = resolve(await ask(rl, 'Dossier du projet', 'mon-extension'));
      o.name = await ask(rl, 'Nom affiché', o.name);
      o.ext = await ask(rl, 'Type de fichier (extension, sans point)', o.ext ?? (slugify(o.name).replace(/[^a-z0-9]/g, '').slice(0, 10) || 'doc'), (v) => EXT_RE.test(v));
      o.template = norm(await ask(rl, `Modèle — ${TEMPLATES.join(', ')}`, o.template, (v) => TEMPLATES.includes(norm(v, TEMPLATES, ''))), TEMPLATES, 'texte');
      if (o.template !== 'nocode') o.lang = norm(await ask(rl, 'Langage — ts ou js', o.lang, (v) => LANGS.includes(norm(v, LANGS, ''))), LANGS, 'ts');
    } finally {
      rl.close();
    }
  }
  if (!o.dir) o.dir = resolve('mon-extension');
  const id = slugify(a.id ?? basename(o.dir));
  const ext = o.ext ?? (id.replace(/[^a-z0-9]/g, '').slice(0, 10) || 'doc');
  if (!EXT_RE.test(ext)) throw new Error(`extension « ${ext} » refusée : ^[a-z0-9]{1,10}$, sans point`);
  if (existsSync(o.dir) && readdirSync(o.dir).length > 0) throw new Error(`le dossier ${o.dir} existe et n’est pas vide : rien n’est écrit`);

  const options = {
    id,
    name: o.name.slice(0, 100),
    description: o.template === 'nocode' ? 'Des fiches, sans une ligne de code.' : `Un éditeur pour les fichiers .${ext}.`,
    ext,
    template: o.template,
    lang: o.template === 'nocode' ? 'js' : o.lang,
    toolVersion: toolVersion(),
  };
  const files = projectFiles(options);
  for (const [rel, content] of Object.entries(files)) {
    const path = join(o.dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  io.log(`✓ Extension « ${options.name} » créée dans ${o.dir}`);
  io.log(`  identifiant ${id} · fichiers .${ext} · modèle ${options.template}${options.template === 'nocode' ? '' : ` · ${options.lang.toUpperCase()}`}`);
  io.log('');
  io.log(`  cd ${target ?? o.dir}`);
  io.log('  npm install');
  io.log('  npm run dev');
  return { dir: o.dir, options };
}
