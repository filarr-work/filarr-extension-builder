#!/usr/bin/env node
/**
 * check.mjs — vérifie qu'un exemple PUBLIERAIT : ce que le worker de Filarr et
 * l'écran Publier refuseraient, on le refuse ici, avant.
 *
 *   node ../_outils/check.mjs            (depuis le dossier d'un exemple)
 *
 * Ce qui est vérifié, et d'où vient la règle :
 *
 *  1. `filarr.extension.json` — la description du paquet (PACKAGE.md §3), avec
 *     le manifeste NON signé sous les bornes de PUBLISHING.md §2. Les champs que
 *     Filarr calcule lui-même (`bundleHash`, `publisherFingerprint`, `trust`,
 *     `previews`) sont REFUSÉS : un paquet qui les porte est refusé à la remise.
 *  2. `capabilities` — par LE validateur de Filarr
 *     (`src/services/plugins/capabilities/extensionCapabilities.ts`), bundlé à
 *     la volée depuis le dépôt de l'application. Deux validateurs qui divergent,
 *     c'est une extension acceptée ici et refusée au publish : on ne recopie pas
 *     les règles, on exécute les siennes. Dépôt introuvable : avertissement, et
 *     seules la liste fermée et l'exclusion réseau sont revérifiées localement.
 *  3. Les sources — aucun puits HTML (`innerHTML`…), aucune API que la page
 *     n'a pas (réseau direct, `localStorage`…) ; puis `tsc --noEmit`.
 *  4. `dist/bundle.js` — 1 octet à 4 Mio, compilable comme corps de fonction,
 *     et, exécuté dans une page simulée : `filarrSandboxedPlugin` posé, un
 *     éditeur `<id>-editor`, et les points d'entrée que les capacités promettent
 *     (`functions.*`, `block`, `widget`).
 *  5. `package.json` privé, sans aucune dépendance ; `README.md` ; au moins un
 *     fichier d'exemple par extension déclarée.
 */

import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_BUNDLE_BYTES, dossierExemple, taille, verifierCorps } from './build.mjs';
import { creerPage } from './page.mjs';

const OUTILS = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const ID_RE = /^[a-z][a-z0-9-]{1,63}$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const EXT_RE = /^[a-z0-9]{1,10}$/;
const CATEGORIES = ['editors', 'productivity', 'data', 'media', 'fun', 'other'];
const INVISIBLE_RE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const CHAMPS_MANIFESTE = ['id', 'name', 'version', 'description', 'extensions', 'icon', 'category', 'author', 'capabilities'];
const CHAMPS_CALCULES = ['bundleHash', 'publisherFingerprint', 'trust', 'previews'];
const ENTREE_RE = /^[a-z0-9][a-z0-9._-]{0,63}(\/[a-z0-9][a-z0-9._-]{0,63})?$/;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_CAPTURE_BYTES = 96 * 1024;

/** Ce que la page bac à sable n'a pas, ou ce qui ouvre l'injection de HTML. */
const INTERDITS = [
  [/\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write/, 'puits HTML — construisez par createElement'],
  [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/, "stockage du navigateur — l'origine est opaque, il jette ; voir la capacité storage"],
  [/\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|EventSource|sendBeacon/, 'réseau direct — la CSP le coupe ; voir la capacité network'],
  [/\beval\s*\(|new Function\s*\(/, 'évaluation de code'],
  [/\b(alert|confirm|prompt)\s*\(/, 'boîte native — inutilisable dans la page'],
];

const erreurs = [];
const avertissements = [];
const ok = [];
const faute = (m) => erreurs.push(m);
const prudence = (m) => avertissements.push(m);

const pointsDeCode = (s) => [...s].length;
const estTexte = (v, min, max) => typeof v === 'string' && pointsDeCode(v) >= min && pointsDeCode(v) <= max;

/** L'icône : 1 à 8 points de code, liste blanche, au moins un pictogramme (PUBLISHING.md §2). */
function iconeValide(v) {
  if (typeof v !== 'string') return false;
  const cps = [...v];
  if (cps.length < 1 || cps.length > 8) return false;
  let picto = false;
  for (const c of cps) {
    const n = c.codePointAt(0);
    if (/\p{Extended_Pictographic}/u.test(c)) picto = true;
    else if (n !== 0xfe0f && n !== 0x200d && !(n >= 0x1f3fb && n <= 0x1f3ff)) return false;
  }
  return picto;
}

async function chargerValidateur() {
  const filarg = process.env.FILARG_DIR ?? resolve(OUTILS, '..', '..', '..', '..', 'filarg');
  const chemin = join(filarg, 'src', 'services', 'plugins', 'capabilities', 'extensionCapabilities.ts');
  if (!existsSync(chemin)) return null;
  const r = await build({
    entryPoints: [chemin],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    logLevel: 'silent',
  });
  const url = 'data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64');
  const mod = await import(url);
  return { mod, chemin };
}

/** Le repli sans le dépôt de Filarr : la liste fermée et l'exclusion réseau, rien de plus. */
function validationMinimale(c) {
  const cles = ['newDocument', 'maxBytes', 'imports', 'storage', 'collab', 'functions', 'picker', 'noteBlock', 'homeWidget', 'network'];
  if (typeof c !== 'object' || c === null || Array.isArray(c)) return { ok: false, reason: 'not_object' };
  if (Object.keys(c).some((k) => !cles.includes(k))) return { ok: false, reason: 'unknown_capability' };
  if (c.network && (c.picker || c.storage || c.functions || c.noteBlock)) return { ok: false, reason: 'network_exclusive' };
  return { ok: true };
}

function fichiers(dossier, filtre) {
  if (!existsSync(dossier)) return [];
  const out = [];
  for (const nom of readdirSync(dossier)) {
    const p = join(dossier, nom);
    if (statSync(p).isDirectory()) out.push(...fichiers(p, filtre));
    else if (filtre(p)) out.push(p);
  }
  return out;
}

function verifierPaquet(dossier, config) {
  const cles = Object.keys(config);
  for (const k of cles) {
    if (!['format', 'manifest', 'listing', 'screenshots', 'build'].includes(k)) faute(`filarr.extension.json : clé inconnue « ${k} »`);
  }
  if (config.format !== undefined && config.format !== 1) faute('format : seul le format 1 existe (PACKAGE.md)');

  const m = config.manifest;
  if (typeof m !== 'object' || m === null) {
    faute('manifest absent');
    return null;
  }
  for (const k of Object.keys(m)) {
    if (CHAMPS_CALCULES.includes(k)) faute(`manifest.${k} : calculé par Filarr, un paquet qui le porte est refusé`);
    else if (!CHAMPS_MANIFESTE.includes(k)) faute(`manifest.${k} : champ inconnu`);
  }
  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) faute('manifest.id : ^[a-z][a-z0-9-]{1,63}$ (le slug, définitif)');
  if (!estTexte(m.name, 1, 100) || m.name.trim() === '') faute('manifest.name : 1 à 100 caractères');
  if (typeof m.version !== 'string' || !VERSION_RE.test(m.version)) faute('manifest.version : ^\\d+\\.\\d+\\.\\d+$');
  if (typeof m.description !== 'string') faute('manifest.description : obligatoire (peut être vide)');
  else if (pointsDeCode(m.description) > 2000) faute('manifest.description : 2000 caractères au plus');
  if (
    !Array.isArray(m.extensions) ||
    m.extensions.length < 1 ||
    m.extensions.length > 10 ||
    !m.extensions.every((e) => typeof e === 'string' && EXT_RE.test(e)) ||
    new Set(m.extensions).size !== m.extensions.length
  ) {
    faute('manifest.extensions : 1 à 10 entrées uniques, ^[a-z0-9]{1,10}$');
  }
  if (m.icon !== undefined && !iconeValide(m.icon)) faute('manifest.icon : 1 à 8 points de code, au moins un pictogramme');
  if (m.category !== undefined && !CATEGORIES.includes(m.category)) faute(`manifest.category : parmi ${CATEGORIES.join(', ')}`);
  if (m.author !== undefined && (!estTexte(m.author, 1, 80) || m.author.trim() !== m.author || INVISIBLE_RE.test(m.author))) {
    faute('manifest.author : détrimé, 1 à 80 points de code, sans caractère invisible');
  }
  // Le manifeste SIGNÉ portera en plus bundleHash, publisherFingerprint et trust.
  const signe = { ...m, bundleHash: '0'.repeat(64), publisherFingerprint: '00000 '.repeat(6).trim(), trust: 'sandboxed' };
  const octets = Buffer.byteLength(JSON.stringify(signe), 'utf8');
  if (octets > MAX_MANIFEST_BYTES) faute(`manifeste signé de ${taille(octets)} : 64 Kio au plus, en octets UTF-8`);

  const l = config.listing;
  if (l !== undefined) {
    if (typeof l !== 'object' || l === null) faute('listing : objet attendu');
    else {
      for (const k of Object.keys(l)) if (!['releaseNotes', 'sourceUrl', 'license'].includes(k)) faute(`listing.${k} : champ inconnu`);
      if (l.releaseNotes !== undefined && !estTexte(l.releaseNotes, 0, 2000)) faute('listing.releaseNotes : 2000 caractères au plus');
      if (l.sourceUrl !== undefined && (typeof l.sourceUrl !== 'string' || !l.sourceUrl.startsWith('https://') || l.sourceUrl.length > 300)) {
        faute('listing.sourceUrl : https://, 300 caractères au plus');
      }
      if (l.license !== undefined && !estTexte(l.license, 0, 40)) faute('listing.license : 40 caractères au plus');
    }
  }

  const s = config.screenshots;
  if (!Array.isArray(s) || s.length > 4) faute('screenshots : tableau de 4 entrées au plus');
  else {
    for (const nom of s) {
      if (typeof nom !== 'string' || !ENTREE_RE.test(nom) || !nom.startsWith('screenshots/')) {
        faute(`screenshots : « ${nom} » n'est pas un nom d'entrée valide`);
        continue;
      }
      const p = join(dossier, nom);
      if (!existsSync(p)) faute(`screenshots : ${nom} introuvable`);
      else if (statSync(p).size > MAX_CAPTURE_BYTES) faute(`screenshots : ${nom} dépasse 96 Kio`);
    }
  }

  const b = config.build;
  if (typeof b !== 'object' || b === null) faute('build absent');
  else {
    for (const k of Object.keys(b)) if (!['kind', 'entry', 'tool'].includes(k)) faute(`build.${k} : champ inconnu pour un exemple avec code`);
    if (b.kind !== 'code') faute('build.kind : "code" attendu');
    if (typeof b.entry !== 'string' || !existsSync(join(dossier, b.entry))) faute('build.entry : fichier source introuvable');
    if (b.tool !== undefined && !estTexte(b.tool, 1, 60)) faute('build.tool : 60 caractères au plus');
  }
  return m;
}

function verifierPackageJson(dossier, id) {
  const p = join(dossier, 'package.json');
  if (!existsSync(p)) return faute('package.json absent');
  const pkg = JSON.parse(readFileSync(p, 'utf8'));
  if (pkg.name !== `@filarr-examples/${id}`) faute(`package.json : name doit valoir @filarr-examples/${id}`);
  if (pkg.private !== true) faute('package.json : "private": true — un exemple ne se publie pas sur npm');
  for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    if (pkg[k] && Object.keys(pkg[k]).length > 0) faute(`package.json : ${k} interdit — les outils sont à la racine du dépôt`);
  }
  for (const s of ['build', 'check', 'test']) if (!pkg.scripts?.[s]) faute(`package.json : script « ${s} » absent`);
}

function verifierSources(dossier) {
  const sources = fichiers(join(dossier, 'src'), (f) => /\.tsx?$/.test(f) && !/__tests__|\.test\.ts$/.test(f));
  for (const f of sources) {
    const lignes = readFileSync(f, 'utf8').split(/\r?\n/);
    lignes.forEach((ligne, i) => {
      const code = ligne.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
      for (const [re, pourquoi] of INTERDITS) {
        if (re.test(code)) faute(`${relative(dossier, f)}:${i + 1} : ${pourquoi}`);
      }
    });
  }
  return sources.length;
}

function typecheck(dossier) {
  const tsc = require.resolve('typescript/lib/tsc.js');
  const r = spawnSync(process.execPath, [tsc, '-p', join(dossier, 'tsconfig.json'), '--noEmit'], { encoding: 'utf8' });
  if (r.status !== 0) faute(`tsc :\n${(r.stdout + r.stderr).trim().split('\n').slice(0, 20).join('\n')}`);
}

function verifierBundle(dossier, m) {
  const p = join(dossier, 'dist', 'bundle.js');
  if (!existsSync(p)) return faute('dist/bundle.js absent — lancez « npm run build »');
  const octets = readFileSync(p);
  if (octets.byteLength < 1 || octets.byteLength > MAX_BUNDLE_BYTES) faute(`bundle de ${taille(octets.byteLength)} : 1 octet à 4 Mio`);
  const code = octets.toString('utf8');
  try {
    verifierCorps(code);
  } catch (e) {
    return faute(e.message);
  }
  if (!code.includes('--color-')) prudence("le bundle n'utilise aucune variable --color-* : il ignorera le thème de Filarr");

  const page = creerPage();
  let plugin;
  try {
    plugin = page.charger(code);
  } catch (e) {
    page.fermer();
    return faute(`le bundle jette à l'exécution : ${e.message}`);
  }
  const id = `${m.id}-editor`;
  const c = m.capabilities ?? {};
  if (!plugin || typeof plugin !== 'object') faute('globalThis.filarrSandboxedPlugin absent après exécution');
  else {
    if (!Array.isArray(plugin.editors)) faute('filarrSandboxedPlugin.editors doit être un tableau');
    else if (!plugin.editors.some((e) => e && e.id === id && typeof e.mount === 'function')) {
      faute(`aucun éditeur « ${id} » avec mount() — l'hôte demandera exactement cet id`);
    }
    const f = plugin.functions ?? {};
    if (c.functions?.extractText && typeof f.extractText !== 'function') faute('functions.extractText déclarée mais absente');
    if (c.functions?.thumbnail && typeof f.thumbnail !== 'function') faute('functions.thumbnail déclarée mais absente');
    if (c.functions?.fields && typeof f.fields !== 'function') faute('functions.fields déclarée mais absente');
    if (c.functions?.exports && typeof f.export !== 'function') faute('functions.exports déclarée : le bundle doit exposer functions.export');
    if (plugin.functions && !c.functions) prudence('functions exposées mais non déclarées : Filarr ne les appellera jamais');
    if (c.noteBlock && typeof plugin.block?.mount !== 'function') faute('noteBlock déclaré : block.mount() absent');
    if (plugin.block && !c.noteBlock) prudence('block exposé mais noteBlock non déclaré');
    if (c.homeWidget && typeof plugin.widget?.mount !== 'function') faute('homeWidget déclaré : widget.mount() absent');
    if (plugin.widget && !c.homeWidget) prudence('widget exposé mais homeWidget non déclaré');
  }
  if (page.erreurs.length) faute(`erreurs à l'exécution du bundle : ${page.erreurs.join(' ; ')}`);
  page.fermer();
  ok.push(`bundle ${taille(octets.byteLength)}, globale posée, éditeur ${id}`);
}

function verifierExemples(dossier, m) {
  const tous = fichiers(join(dossier, 'exemples'), () => true);
  if (tous.length === 0) return faute('exemples/ vide');
  const exts = [...(m.extensions ?? []), ...(m.capabilities?.imports ?? [])];
  for (const ext of exts) {
    if (!tous.some((f) => extname(f).toLowerCase() === `.${ext}`)) faute(`aucun fichier d'exemple .${ext} dans exemples/`);
  }
  ok.push(`${tous.length} fichier(s) d'exemple`);
}

async function main() {
  const dossier = dossierExemple(process.argv[2]);
  const config = JSON.parse(readFileSync(join(dossier, 'filarr.extension.json'), 'utf8'));
  const m = verifierPaquet(dossier, config);
  if (!m) return;

  if (m.capabilities !== undefined) {
    const validateur = await chargerValidateur();
    const exts = Array.isArray(m.extensions) ? m.extensions : [];
    if (validateur) {
      const v = validateur.mod.readExtensionCapabilities(m.capabilities, exts);
      if (!v.ok) faute(`capabilities refusées par le validateur de Filarr : ${v.reason}`);
      else ok.push(`capacités acceptées par le validateur de Filarr (${validateur.mod.declaredCapabilityKeys(v.capabilities).join(', ')})`);
    } else {
      prudence('dépôt filarg introuvable (FILARG_DIR) : capacités vérifiées en mode minimal seulement');
      const v = validationMinimale(m.capabilities);
      if (!v.ok) faute(`capabilities : ${v.reason}`);
    }
  } else ok.push('aucune capacité');

  verifierPackageJson(dossier, m.id);
  // Un exemple sans explication n'apprend rien : le README doit dire ce qu'il montre.
  const readme = join(dossier, 'README.md');
  if (!existsSync(readme) || readFileSync(readme, 'utf8').trim().length < 200) faute('README.md absent ou vide');
  const n = verifierSources(dossier);
  ok.push(`${n} source(s) sans puits HTML ni API absente de la page`);
  typecheck(dossier);
  verifierExemples(dossier, m);
  verifierBundle(dossier, m);

  const nom = relative(join(OUTILS, '..'), dossier) || dossier;
  for (const o of ok) console.log(`ok     ${o}`);
  for (const a of avertissements) console.warn(`attention ${a}`);
  for (const e of erreurs) console.error(`ÉCHEC  ${e}`);
  if (erreurs.length) {
    console.error(`check ${nom} : ${erreurs.length} échec(s)`);
    process.exit(1);
  }
  console.log(`check ${nom} : conforme`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`check : ${e.stack ?? e}`);
    process.exit(1);
  });
}
