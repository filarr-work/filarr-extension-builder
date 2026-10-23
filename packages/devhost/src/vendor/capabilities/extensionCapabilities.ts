/*
 * ─── COPIE VENDORISÉE — ne pas modifier à la main ──────────────────────────
 * Source : filarg/src/services/plugins/capabilities/extensionCapabilities.ts
 * Recopiée à l'identique par `npm run sync` ; `test/vendor.test.ts` échoue
 * dès qu'elle s'écarte de la source, ou de l'empreinte notée dans vendor.json.
 * ─── fin de l'en-tête vendorisé ─────────────────────────────────────────────
 */
/**
 * extensionCapabilities — LE validateur du champ signé `capabilities`.
 *
 * Contrat : docs/plugins/CAPACITES.md (gelé le 2026-10-23).
 *
 * ── UN SEUL VALIDATEUR, DEUX ENDROITS ───────────────────────────────────────
 *
 * Ce module est PORTÉ tel quel dans le worker (`scripts/plugin-core-port.cjs`,
 * vérifié par `pluginCorePort.vitest.ts`). Deux validateurs qui s'écartent d'un
 * plafond, c'est une extension ACCEPTÉE au publish et REFUSÉE à l'installation,
 * sans que rien ne dise pourquoi. D'où ses contraintes : PUR, aucun import, rien
 * qui dépende du DOM ni de Node.
 *
 * ── LISTE FERMÉE ────────────────────────────────────────────────────────────
 *
 * Une clé inconnue n'est pas ignorée : elle est REFUSÉE, au premier niveau comme
 * dans chaque sous-objet. Ignorer une capacité qu'on ne connaît pas, c'est
 * exécuter une extension privée de ce qu'elle attend — ou, pire, accorder un
 * jour en silence ce qu'un champ mal orthographié aurait dû demander. Le refus
 * pour clé inconnue a SON code (`unknown_capability`) : l'application en fait
 * « demande une version plus récente de Filarr », pas « manifeste cassé ».
 *
 * ── L'EXCLUSION RÉSEAU ──────────────────────────────────────────────────────
 *
 * `network` est refusé avec `picker`, `storage`, `functions` et `noteBlock`.
 * C'est la seconde règle du contrat, tenue ICI et pas dans l'interface : une
 * extension qui parle à Internet ne reçoit rien d'autre que le document ouvert,
 * et chaque requête passe par l'utilisateur.
 */

export const CAPABILITY_KEYS = [
  'newDocument',
  'maxBytes',
  'imports',
  'storage',
  'collab',
  'functions',
  'picker',
  'noteBlock',
  'homeWidget',
  'network',
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export type FieldType = 'text' | 'number' | 'date' | 'checkbox' | 'url';
export type ExportTarget = 'md' | 'txt' | 'html' | 'csv' | 'json';

export interface NewDocumentCapability {
  ext: string;
  label: string;
  /** Les octets du fichier neuf, en base64. Absent = zéro octet. */
  seed?: string;
}

export interface FieldDeclaration {
  key: string;
  label: string;
  type: FieldType;
}

export interface ExportDeclaration {
  to: ExportTarget;
  label: string;
}

export interface NetworkSecret {
  id: string;
  label: string;
  header: string;
}

export interface ExtensionCapabilities {
  newDocument?: NewDocumentCapability[];
  maxBytes?: number;
  imports?: string[];
  storage?: { quota: number };
  collab?: true;
  functions?: {
    extractText?: true;
    thumbnail?: true;
    fields?: FieldDeclaration[];
    exports?: ExportDeclaration[];
  };
  picker?: { access: 'read' | 'readwrite'; extensions?: string[] };
  noteBlock?: { label: string };
  homeWidget?: { label: string };
  network?: { domains: string[]; secrets?: NetworkSecret[] };
}

export type CapabilityRefusal =
  | 'not_object'
  | 'unknown_capability'
  | 'bad_new_document'
  | 'bad_max_bytes'
  | 'bad_imports'
  | 'bad_storage'
  | 'bad_collab'
  | 'bad_functions'
  | 'bad_picker'
  | 'bad_note_block'
  | 'bad_home_widget'
  | 'bad_network'
  | 'network_exclusive';

export type CapabilitiesVerdict =
  | { ok: true; capabilities: ExtensionCapabilities }
  | { ok: false; reason: CapabilityRefusal };

// ── Les bornes du contrat ───────────────────────────────────────────────────

export const MAX_NEW_DOCUMENTS = 4;
export const MAX_SEED_BYTES = 64 * 1024;
/** Le plafond d'un champ d'octets du pont (SANDBOX_MAX_BYTES). */
export const MAX_OPEN_BYTES = 64 * 1024 * 1024;
export const MAX_IMPORTS = 10;
export const MIN_STORAGE_QUOTA = 1024;
export const MAX_STORAGE_QUOTA = 16 * 1024 * 1024;
export const MAX_FIELDS = 32;
export const MAX_EXPORTS = 4;
export const MAX_PICKER_EXTENSIONS = 10;
export const MAX_NETWORK_DOMAINS = 8;
export const MAX_NETWORK_SECRETS = 4;
export const MAX_LABEL_CODE_POINTS = 60;

const EXT_RE = /^[a-z0-9]{1,10}$/;
const KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;
const HEADER_RE = /^x-[a-z0-9-]{1,40}$/;
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const DNS_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD_RE = /^[a-z]{2,63}$/;
/**
 * Contrôle, format (bidi, sans chasse), séparateurs de ligne et de paragraphe :
 * un libellé les porte, et il retourne le texte voisin ou se rend invisible.
 */
const INVISIBLE_RE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

const FIELD_TYPES: ReadonlySet<string> = new Set(['text', 'number', 'date', 'checkbox', 'url']);
const EXPORT_TARGETS: ReadonlySet<string> = new Set(['md', 'txt', 'html', 'csv', 'json']);
const KNOWN_KEYS: ReadonlySet<string> = new Set(CAPABILITY_KEYS);

// ── Les petites marches ─────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Toutes les clés de `o` sont-elles dans `allowed` ? */
function onlyKeys(o: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(o).every((k) => allowed.includes(k));
}

function isLabel(v: unknown): v is string {
  if (typeof v !== 'string' || v.trim() !== v || v === '') return false;
  if ([...v].length > MAX_LABEL_CODE_POINTS) return false;
  return !INVISIBLE_RE.test(v);
}

function isIntegerIn(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

/** Une liste non vide, bornée, de chaînes UNIQUES qui passent `test`. */
function isUniqueList(v: unknown, max: number, test: (s: string) => boolean): v is string[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > max) return false;
  if (!v.every((s) => typeof s === 'string' && test(s))) return false;
  return new Set(v).size === v.length;
}

/** La taille DÉCODÉE d'une chaîne base64 bien formée, sans la décoder. */
function base64DecodedLength(s: string): number | null {
  if (s.length % 4 !== 0 || !BASE64_RE.test(s)) return null;
  const padding = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return (s.length / 4) * 3 - padding;
}

/**
 * Un HÔTE exact : au moins deux étiquettes, une dernière alphabétique (donc pas
 * d'adresse IPv4), ni joker, ni port, ni majuscule, ni point final.
 */
export function isNetworkDomain(v: string): boolean {
  if (v.length < 1 || v.length > 253) return false;
  const parts = v.split('.');
  if (parts.length < 2) return false;
  if (!parts.every((p) => DNS_LABEL_RE.test(p))) return false;
  return TLD_RE.test(parts[parts.length - 1]);
}

export function isSecretHeader(v: string): boolean {
  return v === 'authorization' || v === 'x-api-key' || HEADER_RE.test(v);
}

// ── Une capacité à la fois ──────────────────────────────────────────────────

function readNewDocument(v: unknown, extensions: readonly string[]): boolean {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_NEW_DOCUMENTS) return false;
  const vues = new Set<string>();
  for (const offre of v) {
    if (!isRecord(offre) || !onlyKeys(offre, ['ext', 'label', 'seed'])) return false;
    if (typeof offre.ext !== 'string' || !EXT_RE.test(offre.ext)) return false;
    // On ne crée que ce qu'on sait OUVRIR : un fichier neuf qu'aucun éditeur
    // de l'extension n'ouvre serait un fichier orphelin dès sa création.
    if (!extensions.includes(offre.ext) || vues.has(offre.ext)) return false;
    vues.add(offre.ext);
    if (!isLabel(offre.label)) return false;
    if (offre.seed !== undefined) {
      if (typeof offre.seed !== 'string') return false;
      const n = base64DecodedLength(offre.seed);
      if (n === null || n > MAX_SEED_BYTES) return false;
    }
  }
  return true;
}

function readFunctions(v: unknown): boolean {
  if (!isRecord(v) || Object.keys(v).length === 0) return false;
  if (!onlyKeys(v, ['extractText', 'thumbnail', 'fields', 'exports'])) return false;
  if (v.extractText !== undefined && v.extractText !== true) return false;
  if (v.thumbnail !== undefined && v.thumbnail !== true) return false;
  if (v.fields !== undefined) {
    if (!Array.isArray(v.fields) || v.fields.length === 0 || v.fields.length > MAX_FIELDS) {
      return false;
    }
    const cles = new Set<string>();
    for (const f of v.fields) {
      if (!isRecord(f) || !onlyKeys(f, ['key', 'label', 'type'])) return false;
      if (typeof f.key !== 'string' || !KEY_RE.test(f.key) || cles.has(f.key)) return false;
      cles.add(f.key);
      if (!isLabel(f.label)) return false;
      if (typeof f.type !== 'string' || !FIELD_TYPES.has(f.type)) return false;
    }
  }
  if (v.exports !== undefined) {
    if (!Array.isArray(v.exports) || v.exports.length === 0 || v.exports.length > MAX_EXPORTS) {
      return false;
    }
    const cibles = new Set<string>();
    for (const e of v.exports) {
      if (!isRecord(e) || !onlyKeys(e, ['to', 'label'])) return false;
      if (typeof e.to !== 'string' || !EXPORT_TARGETS.has(e.to) || cibles.has(e.to)) return false;
      cibles.add(e.to);
      if (!isLabel(e.label)) return false;
    }
  }
  return true;
}

function readNetwork(v: unknown): boolean {
  if (!isRecord(v) || !onlyKeys(v, ['domains', 'secrets'])) return false;
  if (!isUniqueList(v.domains, MAX_NETWORK_DOMAINS, isNetworkDomain)) return false;
  if (v.secrets !== undefined) {
    if (
      !Array.isArray(v.secrets) ||
      v.secrets.length === 0 ||
      v.secrets.length > MAX_NETWORK_SECRETS
    ) {
      return false;
    }
    const ids = new Set<string>();
    for (const s of v.secrets) {
      if (!isRecord(s) || !onlyKeys(s, ['id', 'label', 'header'])) return false;
      if (typeof s.id !== 'string' || !KEY_RE.test(s.id) || ids.has(s.id)) return false;
      ids.add(s.id);
      if (!isLabel(s.label)) return false;
      if (typeof s.header !== 'string' || !isSecretHeader(s.header)) return false;
    }
  }
  return true;
}

/** `{ label }` et rien d'autre — le bloc de note et le widget d'accueil. */
function readLabelOnly(v: unknown): boolean {
  return isRecord(v) && onlyKeys(v, ['label']) && isLabel(v.label);
}

// ── La lecture complète ─────────────────────────────────────────────────────

/**
 * Lit `capabilities` tel que le manifeste signé le porte.
 *
 * `extensions` : les extensions du manifeste — `newDocument` doit y être et
 * `imports` en être disjoint. Le verdict ne jette jamais.
 */
export function readExtensionCapabilities(
  raw: unknown,
  extensions: readonly string[]
): CapabilitiesVerdict {
  if (!isRecord(raw)) return { ok: false, reason: 'not_object' };
  for (const cle of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(cle)) return { ok: false, reason: 'unknown_capability' };
  }
  const c = raw;

  if (c.newDocument !== undefined && !readNewDocument(c.newDocument, extensions)) {
    return { ok: false, reason: 'bad_new_document' };
  }
  if (c.maxBytes !== undefined && !isIntegerIn(c.maxBytes, 1, MAX_OPEN_BYTES)) {
    return { ok: false, reason: 'bad_max_bytes' };
  }
  if (
    c.imports !== undefined &&
    !isUniqueList(c.imports, MAX_IMPORTS, (s) => EXT_RE.test(s) && !extensions.includes(s))
  ) {
    return { ok: false, reason: 'bad_imports' };
  }
  if (
    c.storage !== undefined &&
    !(
      isRecord(c.storage) &&
      onlyKeys(c.storage, ['quota']) &&
      isIntegerIn(c.storage.quota, MIN_STORAGE_QUOTA, MAX_STORAGE_QUOTA)
    )
  ) {
    return { ok: false, reason: 'bad_storage' };
  }
  if (c.collab !== undefined && c.collab !== true) return { ok: false, reason: 'bad_collab' };
  if (c.functions !== undefined && !readFunctions(c.functions)) {
    return { ok: false, reason: 'bad_functions' };
  }
  if (c.picker !== undefined) {
    const p = c.picker;
    const ok =
      isRecord(p) &&
      onlyKeys(p, ['access', 'extensions']) &&
      (p.access === 'read' || p.access === 'readwrite') &&
      (p.extensions === undefined ||
        isUniqueList(p.extensions, MAX_PICKER_EXTENSIONS, (s) => EXT_RE.test(s)));
    if (!ok) return { ok: false, reason: 'bad_picker' };
  }
  if (c.noteBlock !== undefined && !readLabelOnly(c.noteBlock)) {
    return { ok: false, reason: 'bad_note_block' };
  }
  if (c.homeWidget !== undefined && !readLabelOnly(c.homeWidget)) {
    return { ok: false, reason: 'bad_home_widget' };
  }
  if (c.network !== undefined) {
    if (!readNetwork(c.network)) return { ok: false, reason: 'bad_network' };
    if (
      c.picker !== undefined ||
      c.storage !== undefined ||
      c.functions !== undefined ||
      c.noteBlock !== undefined
    ) {
      return { ok: false, reason: 'network_exclusive' };
    }
  }
  return { ok: true, capabilities: c as ExtensionCapabilities };
}

/**
 * Le JSON CANONIQUE des capacités : clés triées à chaque niveau, tableaux dans
 * leur ordre. C'est ce que hache le consentement — deux manifestes qui disent la
 * même chose dans un autre ordre de clés ne redemandent rien, deux manifestes
 * qui disent autre chose redemandent toujours.
 */
export function canonicalCapabilitiesJson(c: ExtensionCapabilities): string {
  const tri = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(tri);
    if (isRecord(v)) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) out[k] = tri(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(tri(c));
}

/** Les capacités présentes, dans l'ordre du contrat — ce que l'écran énumère. */
export function declaredCapabilityKeys(c: ExtensionCapabilities | undefined): CapabilityKey[] {
  if (!c) return [];
  return CAPABILITY_KEYS.filter((k) => c[k] !== undefined);
}
