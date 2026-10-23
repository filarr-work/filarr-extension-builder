/**
 * filarr-ext — créer, tester, contrôler et empaqueter une extension Filarr.
 *
 *   filarr-ext dev                 le simulateur local, reconstruit à chaque modification
 *   filarr-ext build               dist/bundle.js
 *   filarr-ext check               les contrôles du serveur et du client
 *   filarr-ext pack                dist/<id>-<version>.filarrext
 *   filarr-ext verify <paquet>     relit et contrôle un paquet
 *   filarr-ext publish <paquet>    le remet à Filarr pour bureau (filarr://publish)
 *   filarr-ext seed <fichier>      le base64 d'un modèle de départ (newDocument.seed)
 *
 * Code de sortie : 0 réussi, 1 erreur de contrôle, 2 commande mal formée.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { MAX_SEED_BYTES, PACKAGE_EXTENSION } from '@filarr/extension-api';
import { buildProject, engineSource, writeBundle } from './build';
import { runCheck } from './check';
import { assemblePackage, verifyPackage } from './package';
import { loadProject, PROJECT_FILE } from './project';
import { openUrl, planPublish } from './publish';
import { formatBytes, formatReport, Report } from './report';
import { toolVersion } from './version';

export interface Args {
  command: string | undefined;
  positionals: string[];
  flags: Map<string, string | true>;
}

export function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string | true>();
  const positionals: string[] = [];
  const valued = new Set(['dir', 'out', 'port', 'host', 'file']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-C') {
      flags.set('dir', argv[++i] ?? '');
    } else if (a === '-h') {
      flags.set('help', true);
    } else if (a === '-v') {
      flags.set('version', true);
    } else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
      if (eq > 0) flags.set(name, a.slice(eq + 1));
      else if (valued.has(name) && i + 1 < argv.length && !argv[i + 1].startsWith('--')) flags.set(name, argv[++i]);
      else flags.set(name, true);
    } else {
      positionals.push(a);
    }
  }
  return { command: positionals.shift(), positionals, flags };
}

const HELP = `filarr-ext ${toolVersion()} — les extensions Filarr, avec ou sans code

Usage : filarr-ext <commande> [options]

  dev                  lance le simulateur local (http://127.0.0.1:5199)
  build                construit dist/bundle.js
  check                contrôle le projet comme le serveur et Filarr le feront
  pack                 fabrique dist/<id>-<version>.filarrext (refuse ce que Filarr refuserait)
  verify <paquet>      relit et contrôle un paquet .filarrext
  publish <paquet>     ouvre Filarr pour bureau sur l’écran Publier (filarr://publish)
  seed <fichier>       rend le base64 d’un modèle de départ (capacité newDocument)

Options
  -C, --dir <dossier>  le dossier du projet (défaut : dossier courant)
  --out <fichier>      pack : le chemin du paquet
  --json               check, verify : la sortie en JSON
  --no-minify          build : sans minification
  --port <n>           dev : le port (défaut 5199)
  --no-open            dev : ne pas ouvrir le navigateur
  --print              publish : affiche l’adresse sans l’ouvrir
  -h, --help           cette aide
  -v, --version        la version
`;

type Out = { log(s: string): void; error(s: string): void };

function emit(report: Report, title: string, json: boolean, out: Out, extra: Record<string, unknown> = {}): number {
  if (json) out.log(JSON.stringify({ ...report.toJSON(), ...extra }, null, 2));
  else out.log(formatReport(report, title));
  return report.passed ? 0 : 1;
}

async function cmdBuild(dir: string, args: Args, out: Out): Promise<number> {
  const project = loadProject(dir);
  const r = await buildProject(project, { minify: !args.flags.has('no-minify') });
  if (!r.ok || r.code === undefined) {
    out.error('✗ build refusé :');
    for (const e of r.errors) out.error(`  - ${e}`);
    return 1;
  }
  for (const w of r.warnings) out.error(`! ${w}`);
  const path = writeBundle(project, r.code);
  out.log(`✓ ${relative(process.cwd(), path) || path} — ${formatBytes(Buffer.byteLength(r.code))}${r.kind === 'nocode' ? ` (moteur sans code ${r.engineVersion})` : ''}`);
  return 0;
}

async function cmdCheck(dir: string, args: Args, out: Out): Promise<number> {
  const result = await runCheck(dir);
  const m = result.project?.manifest;
  return emit(result.report, `filarr-ext check — ${m?.id ?? '?'} ${m?.version ?? ''}`.trim(), args.flags.has('json'), out);
}

async function cmdPack(dir: string, args: Args, out: Out): Promise<number> {
  const result = await runCheck(dir);
  const m = result.project?.manifest;
  const json = args.flags.has('json');
  if (!result.report.passed || !result.manifest || !result.build?.code) {
    result.report.error('pack_refused', 'paquet NON fabriqué : corrigez les erreurs ci-dessus');
    return emit(result.report, `filarr-ext pack — ${m?.id ?? '?'} ${m?.version ?? ''}`, json, out);
  }
  const { bytes } = assemblePackage(result, toolVersion());
  // Relu par le même chemin que `verify` avant d'exister sur le disque.
  const relu = verifyPackage(bytes, { engineSource: result.build.kind === 'nocode' ? await engineSource() : undefined });
  if (!relu.report.passed) {
    result.report.merge(relu.report);
    result.report.error('pack_refused', 'le paquet assemblé ne passe pas sa propre relecture : rien n’est écrit');
    return emit(result.report, `filarr-ext pack — ${m?.id} ${m?.version}`, json, out);
  }
  const project = result.project!;
  const target = typeof args.flags.get('out') === 'string' ? resolve(args.flags.get('out') as string) : join(project.outDir, `${result.manifest.id}-${result.manifest.version}${PACKAGE_EXTENSION}`);
  if (!target.toLowerCase().endsWith(PACKAGE_EXTENSION)) {
    out.error(`✗ --out doit finir par ${PACKAGE_EXTENSION}`);
    return 2;
  }
  mkdirSync(resolve(target, '..'), { recursive: true });
  writeFileSync(target, bytes);
  result.report.ok('pack', `paquet écrit : ${relative(process.cwd(), target) || target} (${formatBytes(bytes.byteLength)})`);
  return emit(result.report, `filarr-ext pack — ${result.manifest.id} ${result.manifest.version}`, json, out, { path: target, bytes: bytes.byteLength });
}

async function cmdVerify(file: string | undefined, args: Args, out: Out): Promise<number> {
  if (!file) {
    out.error('Usage : filarr-ext verify <paquet.filarrext>');
    return 2;
  }
  const path = resolve(file);
  if (!existsSync(path) || !statSync(path).isFile()) {
    out.error(`✗ ${path} introuvable`);
    return 1;
  }
  const v = verifyPackage(new Uint8Array(readFileSync(path)), { engineSource: await engineSource().catch(() => undefined) });
  const m = v.description?.manifest;
  return emit(v.report, `filarr-ext verify — ${m ? `${m.id} ${m.version}` : file}`, args.flags.has('json'), out);
}

async function cmdPublish(file: string | undefined, args: Args, out: Out): Promise<number> {
  if (!file) {
    out.error('Usage : filarr-ext publish <paquet.filarrext>');
    return 2;
  }
  const plan = planPublish(file, await engineSource().catch(() => undefined));
  if (!plan.url) return emit(plan.report, `filarr-ext publish — ${file}`, args.flags.has('json'), out);
  out.log(formatReport(plan.report, `filarr-ext publish — ${file}`));
  out.log('');
  out.log(`Remise à Filarr pour bureau : ${plan.url}`);
  out.log('Filarr relira tout le paquet et vous le montrera ; la signature se fait dans Filarr, sur votre appareil.');
  if (args.flags.has('print')) return 0;
  try {
    await openUrl(plan.url);
  } catch (e) {
    out.error(`! impossible d’ouvrir l’adresse (${e instanceof Error ? e.message : String(e)}) : déposez le fichier dans Place de marché › Publier`);
    return 1;
  }
  return 0;
}

function cmdSeed(file: string | undefined, out: Out): number {
  if (!file) {
    out.error('Usage : filarr-ext seed <fichier>');
    return 2;
  }
  const bytes = readFileSync(resolve(file));
  if (bytes.byteLength > MAX_SEED_BYTES) {
    out.error(`✗ ${formatBytes(bytes.byteLength)} : un modèle de départ fait 64 Kio au plus`);
    return 1;
  }
  out.log(bytes.toString('base64'));
  return 0;
}

async function cmdDev(dir: string, args: Args, out: Out): Promise<number> {
  const { startDev } = await import('./dev');
  const portFlag = args.flags.get('port');
  const port = typeof portFlag === 'string' ? Number(portFlag) : 5199;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    out.error('✗ --port : un entier de 0 à 65535');
    return 2;
  }
  await startDev(dir, { port, open: !args.flags.has('no-open'), log: out.log, error: out.error });
  return new Promise<number>(() => undefined);
}

export async function main(argv: string[], out: Out = console): Promise<number> {
  const args = parseArgs(argv);
  if (args.flags.has('version')) {
    out.log(toolVersion());
    return 0;
  }
  if (args.flags.has('help') || !args.command || args.command === 'help') {
    out.log(HELP);
    return args.command || args.flags.has('help') ? 0 : 2;
  }
  const dirFlag = args.flags.get('dir');
  const dir = resolve(typeof dirFlag === 'string' ? dirFlag : process.cwd());
  const needsProject = ['dev', 'build', 'check', 'pack'].includes(args.command);
  if (needsProject && !existsSync(join(dir, PROJECT_FILE))) {
    out.error(`✗ pas de ${PROJECT_FILE} dans ${dir} — lancez la commande depuis le dossier d’une extension, ou créez-en une : npm create filarr-extension@latest`);
    return 1;
  }
  try {
    switch (args.command) {
      case 'build':
        return await cmdBuild(dir, args, out);
      case 'check':
        return await cmdCheck(dir, args, out);
      case 'pack':
        return await cmdPack(dir, args, out);
      case 'verify':
        return await cmdVerify(args.positionals[0], args, out);
      case 'publish':
        return await cmdPublish(args.positionals[0], args, out);
      case 'seed':
        return cmdSeed(args.positionals[0], out);
      case 'dev':
        return await cmdDev(dir, args, out);
      default:
        out.error(`commande inconnue « ${args.command} »\n\n${HELP}`);
        return 2;
    }
  } catch (e) {
    out.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}
