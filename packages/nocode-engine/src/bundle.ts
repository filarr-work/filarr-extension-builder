/**
 * bundle — fabriquer et relire un bundle sans code, au format EXACT de
 * PACKAGE.md §4 (contrat gelé le 2026-10-23).
 *
 * Le bundle est le moteur, puis ses deux dernières lignes :
 *
 *   /* filarr-nocode engine=X.Y.Z *\/
 *   globalThis.__filarrNocodeBoot(<la configuration en JSON>);
 *
 * Filarr lit la configuration entre `__filarrNocodeBoot(` et le `);` final par
 * `JSON.parse`, SANS l'évaluer, pour la montrer à la relecture et la comparer à
 * `nocode.json`. D'où trois précautions à l'écriture :
 *  · le JSON tient sur UNE ligne (aucun saut, ni `\n` ni U+2028/U+2029) et en
 *    ASCII (`\uXXXX`) : il n'y a qu'une façon de le découper ;
 *  · rien après `);` — pas même un saut de ligne final ;
 *  · la configuration est validée d'abord : un littéral `"__proto__"` serait
 *    une clé pour `JSON.parse` mais un PROTOTYPE pour le moteur qui l'exécute.
 *    Les deux lectures ne divergent jamais parce que cette clé n'y entre jamais.
 */

import { validateConfig } from './schema';
import type { ConfigIssue } from './types';
import { ENGINE_VERSION } from './version';

export const BOOT_CALL = 'globalThis.__filarrNocodeBoot(';
const BOOT_END = ');';
const ENGINE_LINE_RE = /^\/\* filarr-nocode engine=(\d+\.\d+\.\d+) \*\/$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

declare const __FILARR_NOCODE_ENGINE__: string | undefined;

/**
 * Le moteur embarqué au build (`define`), ou `''` quand on tourne depuis les
 * sources sans build (les tests le fournissent alors eux-mêmes).
 */
export const EMBEDDED_ENGINE_SOURCE: string =
  typeof __FILARR_NOCODE_ENGINE__ === 'string' ? __FILARR_NOCODE_ENGINE__ : '';

export class NocodeConfigError extends Error {
  constructor(readonly issues: ConfigIssue[]) {
    super(`configuration sans code invalide : ${issues.map((i) => `${i.path} — ${i.message}`).join(' ; ')}`);
    this.name = 'NocodeConfigError';
  }
}

/** Le JSON d'une configuration, sur une ligne, en ASCII. */
export function serializeNocodeConfig(config: unknown): string {
  return JSON.stringify(config).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export interface BuildNocodeOptions {
  /** La version écrite dans la ligne `filarr-nocode engine=…` (celle du moteur embarqué par défaut). */
  engineVersion?: string;
  /** Le moteur à placer en tête (celui embarqué au build par défaut). */
  engineSource?: string;
}

/**
 * Le bundle complet. Jette `NocodeConfigError` sur une configuration refusée :
 * on ne construit jamais ce que le moteur refuserait au montage.
 */
export function buildNocodeBundle(config: unknown, opts: BuildNocodeOptions = {}): string {
  const verdict = validateConfig(config);
  if (!verdict.ok) throw new NocodeConfigError(verdict.issues);
  const engineVersion = opts.engineVersion ?? ENGINE_VERSION;
  if (!SEMVER_RE.test(engineVersion)) throw new Error(`version de moteur invalide : ${engineVersion}`);
  const engine = (opts.engineSource ?? EMBEDDED_ENGINE_SOURCE).replace(/\s+$/, '');
  if (engine === '') throw new Error('moteur sans code absent : construisez @filarr/nocode-engine ou passez engineSource');
  return `${engine}\n/* filarr-nocode engine=${engineVersion} */\n${BOOT_CALL}${serializeNocodeConfig(config)}${BOOT_END}`;
}

export type ParsedNocodeBundle =
  | { ok: true; config: unknown; json: string; engineVersion: string; engineSource: string }
  | { ok: false; reason: string };

/**
 * Relit la configuration d'un bundle sans code par `JSON.parse`, SANS rien
 * évaluer — comme Filarr à la relecture. Tolère un saut de ligne final (le
 * contrat n'en met pas, un éditeur de texte en ajoute volontiers).
 */
export function parseNocodeConfigFromBundle(source: string): ParsedNocodeBundle {
  const text = source.replace(/\r?\n$/, '');
  const last = text.lastIndexOf('\n');
  if (last < 0) return { ok: false, reason: 'le bundle n’a pas ses deux lignes finales' };
  const bootLine = text.slice(last + 1);
  const before = text.slice(0, last).replace(/\r$/, '');
  const prev = before.lastIndexOf('\n');
  const engineLine = before.slice(prev + 1).replace(/\r$/, '');
  if (!bootLine.startsWith(BOOT_CALL) || !bootLine.endsWith(BOOT_END)) {
    return { ok: false, reason: 'dernière ligne attendue : globalThis.__filarrNocodeBoot(<JSON>);' };
  }
  const m = ENGINE_LINE_RE.exec(engineLine);
  if (!m) return { ok: false, reason: 'avant-dernière ligne attendue : /* filarr-nocode engine=X.Y.Z */' };
  const json = bootLine.slice(BOOT_CALL.length, bootLine.length - BOOT_END.length);
  let config: unknown;
  try {
    config = JSON.parse(json);
  } catch (e) {
    return { ok: false, reason: `configuration illisible : ${e instanceof Error ? e.message : 'JSON invalide'}` };
  }
  return { ok: true, config, json, engineVersion: m[1], engineSource: prev < 0 ? '' : before.slice(0, prev) };
}
