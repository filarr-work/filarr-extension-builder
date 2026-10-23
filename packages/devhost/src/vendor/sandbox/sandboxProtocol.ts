/*
 * ─── COPIE VENDORISÉE — ne pas modifier à la main ──────────────────────────
 * Source : filarg/src/services/plugins/sandbox/sandboxProtocol.ts
 * Recopiée à l'identique par `npm run sync` ; `test/vendor.test.ts` échoue
 * dès qu'elle s'écarte de la source, ou de l'empreinte notée dans vendor.json.
 * ─── fin de l'en-tête vendorisé ─────────────────────────────────────────────
 */
/**
 * sandboxProtocol — le PROTOCOLE du pont hôte ↔ greffon bac à sable.
 *
 * QUI EST L'ADVERSAIRE : le greffon lui-même. Tout message ENTRANT (côté hôte)
 * vient de code non revu qui tourne dans une iframe d'origine opaque — le
 * parseur refuse toute forme inattendue, plafonne chaque champ d'octets et
 * chaque chaîne, et ne jette JAMAIS (null, à charge du pont de compter et de
 * couper sous le spam). Symétriquement, le bootstrap de la page invitée
 * n'accepte qu'UN message du parent, et le contenu sensible ne passe QUE par
 * le MessagePort — privé par construction.
 *
 * Le message de bootstrap est le SEUL à passer par window.postMessage (ciblé
 * '*' : une origine opaque est inmatchable) — il ne transporte RIEN d'autre
 * que le type et le port.
 *
 * ── VERSION 2 (docs/plugins/CAPACITES.md) ───────────────────────────────────
 *
 * `init` porte le MODE (éditeur, fonction, bloc, widget), les capacités
 * ACCORDÉES, le thème et la langue. L'invitée demande à l'hôte par `request`
 * (une opération, des arguments, un `requestId`) ; l'hôte répond par
 * `response`. En mode fonction, l'hôte appelle par `call` et l'invitée répond
 * par `call-result`. La page invitée et l'hôte sont livrés ensemble : aucune
 * compatibilité v1 n'est gardée.
 *
 * Accorder n'est PAS l'affaire de ce module : il dit si un message est BIEN
 * FORMÉ. Le pont (sandboxBridgeCore) dit s'il est PERMIS.
 *
 * ── CO-ÉDITION (capacité `collab`, palier 1b) ───────────────────────────────
 *
 * Des OCTETS dans les deux sens, jamais un document partagé : l'invitée envoie
 * ses updates Yjs par `collab-send` (1 Mio au plus chacune), l'hôte lui passe
 * celles des autres par `collab-update` (8 Mio au plus) et l'élu par
 * `collab-state`. `init.collab` dit si cette page SÈME une salle vide et porte
 * ce que la salle contient déjà. Ni clé, ni jeton, ni identifiant de salle :
 * l'hôte les garde (voir `capabilities/extensionCollab.ts`).
 */

import type { ExportTarget, ExtensionCapabilities } from '../capabilities/extensionCapabilities';

export const SANDBOX_PROTOCOL_VERSION = 2;
export const SANDBOX_BOOTSTRAP_TYPE = 'filarr-sandbox-bootstrap';
/** Plafond sur TOUT champ d'octets, entrant comme sortant. */
export const SANDBOX_MAX_BYTES = 64 * 1024 * 1024;
const MAX_MESSAGE_CHARS = 2000;

// ── Les bornes des requêtes (CAPACITES.md) ──────────────────────────────────

export const STORAGE_KEY_RE = /^[a-z0-9._-]{1,64}$/;
/** Une poignée de sélecteur : opaque, aléatoire, jamais un identifiant d'élément. */
export const PICK_HANDLE_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const NET_MAX_BODY_BYTES = 1024 * 1024;
export const NET_MAX_URL_CHARS = 2048;
export const NET_MAX_HEADERS = 16;
const NET_HEADER_NAME_RE = /^[a-z0-9-]{1,40}$/;
const NET_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type NetMethod = (typeof NET_METHODS)[number];

/** Une update de co-édition ENVOYÉE par l'invitée (CAPACITES.md, palier 1b). */
export const COLLAB_SEND_MAX_BYTES = 1024 * 1024;
/** Une update REÇUE de la salle — le plafond de trame du transport. */
export const COLLAB_RECEIVE_MAX_BYTES = 8 * 1024 * 1024;

export const EXTRACT_TEXT_MAX_CHARS = 100_000;
export const THUMBNAIL_MAX_BYTES = 96 * 1024;
export const FIELD_TEXT_MAX_CHARS = 500;

// ── Ce que l'hôte passe au montage ──────────────────────────────────────────

export type SandboxMode = 'editor' | 'function' | 'block' | 'widget';

export interface SandboxTheme {
  scheme: 'light' | 'dark';
  /** Variables CSS de l'hôte, déjà filtrées (voir `sandboxTheme.ts`). */
  tokens: Record<string, string>;
}

export const THEME_MAX_TOKENS = 64;
const THEME_TOKEN_NAME_RE = /^--[a-z0-9-]{1,48}$/;
const THEME_TOKEN_VALUE_MAX = 80;
const THEME_TOKEN_FORBIDDEN_RE = /[;{}<>\\]|url\s*\(/i;

/**
 * Un thème est-il présentable à la page invitée ? Noms et valeurs bornés, rien
 * qui ferme une déclaration ni charge une ressource. L'hôte filtre AVANT
 * d'envoyer ; la page refiltre — chacun son côté.
 */
export function sanitizeSandboxTheme(raw: unknown): SandboxTheme {
  const theme: SandboxTheme = { scheme: 'light', tokens: {} };
  if (!isRecord(raw)) return theme;
  if (raw.scheme === 'dark') theme.scheme = 'dark';
  if (!isRecord(raw.tokens)) return theme;
  let n = 0;
  for (const [nom, valeur] of Object.entries(raw.tokens)) {
    if (n >= THEME_MAX_TOKENS) break;
    if (!THEME_TOKEN_NAME_RE.test(nom) || typeof valeur !== 'string') continue;
    const v = valeur.trim();
    if (v === '' || v.length > THEME_TOKEN_VALUE_MAX || THEME_TOKEN_FORBIDDEN_RE.test(v)) continue;
    theme.tokens[nom] = v;
    n++;
  }
  return theme;
}

export type SandboxFunctionName = 'extractText' | 'thumbnail' | 'fields' | 'export';

/** Ce qu'une page en salle reçoit au montage (capacité `collab`). */
export interface SandboxCollabInit {
  /** Vrai : la salle est vide et CETTE page la sème depuis `bytes`. */
  seed: boolean;
  /** L'élu qui enregistre pour la salle, au montage. */
  responsible: boolean;
  /** Ce que la salle contient déjà, à appliquer avant tout. */
  updates: ArrayBuffer[];
}

// ── Hôte → greffon ───────────────────────────────────────────────────────────

export type HostMessage =
  | {
      kind: 'init';
      version: number;
      mode: SandboxMode;
      code: string;
      /** Vide hors mode éditeur. */
      editorId: string;
      fileName: string;
      readOnly: boolean;
      bytes: ArrayBuffer;
      /** Les capacités ACCORDÉES — informatives pour la page, tenues par le pont. */
      grants: ExtensionCapabilities;
      theme: SandboxTheme;
      locale: string;
      /** Présent seulement en salle, capacité `collab` accordée. */
      collab?: SandboxCollabInit;
    }
  | { kind: 'save-result'; requestId: number; ok: boolean; errorMessage?: string }
  | { kind: 'get-bytes'; requestId: number }
  | { kind: 'destroy' }
  | { kind: 'response'; requestId: number; ok: boolean; value?: unknown; error?: string }
  | { kind: 'theme'; theme: SandboxTheme }
  | {
      kind: 'call';
      requestId: number;
      fn: SandboxFunctionName;
      fileName: string;
      bytes: ArrayBuffer;
      to?: ExportTarget;
    }
  | { kind: 'collab-update'; bytes: ArrayBuffer }
  | { kind: 'collab-state'; responsible: boolean };

// ── Greffon → hôte ───────────────────────────────────────────────────────────

/** Les opérations qu'une page invitée peut DEMANDER — liste fermée. */
export type GuestRequest =
  | { op: 'storage-get'; key: string }
  | { op: 'storage-set'; key: string; bytes: ArrayBuffer }
  | { op: 'storage-delete'; key: string }
  | { op: 'storage-list' }
  | { op: 'pick'; multiple: boolean }
  | { op: 'picked-read'; handle: string }
  | { op: 'picked-write'; handle: string; bytes: ArrayBuffer }
  | {
      op: 'net-request';
      method: NetMethod;
      url: string;
      headers: Record<string, string>;
      body: ArrayBuffer | null;
    };

export type GuestRequestOp = GuestRequest['op'];

export type GuestMessage =
  | { kind: 'ready'; version: number }
  | { kind: 'mounted' }
  | { kind: 'mount-error'; message: string }
  | { kind: 'dirty'; dirty: boolean }
  | { kind: 'save-request'; requestId: number; bytes: ArrayBuffer }
  | { kind: 'bytes-result'; requestId: number; bytes: ArrayBuffer }
  | { kind: 'fatal'; message: string }
  | ({ kind: 'request'; requestId: number } & GuestRequest)
  | { kind: 'call-result'; requestId: number; ok: boolean; value: unknown; error?: string }
  | { kind: 'collab-send'; bytes: ArrayBuffer }
  | { kind: 'collab-seeded' };

// ── Validation stricte ───────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isRequestId(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && Number.isFinite(v) && v >= 0;
}

function isBytes(v: unknown, max = SANDBOX_MAX_BYTES): v is ArrayBuffer {
  return v instanceof ArrayBuffer && v.byteLength <= max;
}

function clampMessage(v: unknown): string | null {
  return typeof v === 'string' ? v.slice(0, MAX_MESSAGE_CHARS) : null;
}

const isStorageKey = (v: unknown): v is string => typeof v === 'string' && STORAGE_KEY_RE.test(v);
const isHandle = (v: unknown): v is string => typeof v === 'string' && PICK_HANDLE_RE.test(v);

/** Des en-têtes de requête réseau : noms minuscules, valeurs sans retour à la ligne. */
function readNetHeaders(v: unknown): Record<string, string> | null {
  if (v === undefined) return {};
  if (!isRecord(v) || Array.isArray(v)) return null;
  const out: Record<string, string> = {};
  const entrees = Object.entries(v);
  if (entrees.length > NET_MAX_HEADERS) return null;
  for (const [nom, valeur] of entrees) {
    if (!NET_HEADER_NAME_RE.test(nom) || typeof valeur !== 'string') return null;
    if (valeur.length > 1024 || /[\r\n\0]/.test(valeur)) return null;
    out[nom] = valeur;
  }
  return out;
}

/** La partie `GuestRequest` d'un message `request` — null si mal formée. */
function parseGuestRequest(data: Record<string, unknown>): GuestRequest | null {
  switch (data.op) {
    case 'storage-get':
      return isStorageKey(data.key) ? { op: 'storage-get', key: data.key } : null;
    case 'storage-set':
      return isStorageKey(data.key) && isBytes(data.bytes)
        ? { op: 'storage-set', key: data.key, bytes: data.bytes }
        : null;
    case 'storage-delete':
      return isStorageKey(data.key) ? { op: 'storage-delete', key: data.key } : null;
    case 'storage-list':
      return { op: 'storage-list' };
    case 'pick':
      return typeof data.multiple === 'boolean' ? { op: 'pick', multiple: data.multiple } : null;
    case 'picked-read':
      return isHandle(data.handle) ? { op: 'picked-read', handle: data.handle } : null;
    case 'picked-write':
      return isHandle(data.handle) && isBytes(data.bytes)
        ? { op: 'picked-write', handle: data.handle, bytes: data.bytes }
        : null;
    case 'net-request': {
      const method = data.method;
      if (typeof method !== 'string' || !(NET_METHODS as readonly string[]).includes(method)) {
        return null;
      }
      if (typeof data.url !== 'string' || data.url.length > NET_MAX_URL_CHARS) return null;
      const headers = readNetHeaders(data.headers);
      if (headers === null) return null;
      const body = data.body ?? null;
      if (body !== null && !isBytes(body, NET_MAX_BODY_BYTES)) return null;
      return {
        op: 'net-request',
        method: method as NetMethod,
        url: data.url,
        headers,
        body: body as ArrayBuffer | null,
      };
    }
    default:
      return null;
  }
}

/** Ce que le GREFFON envoie — LA surface d'attaque du pont côté hôte. */
export function parseGuestMessage(data: unknown): GuestMessage | null {
  if (!isRecord(data)) return null;
  switch (data.kind) {
    case 'ready':
      return typeof data.version === 'number' && Number.isFinite(data.version)
        ? { kind: 'ready', version: data.version }
        : null;
    case 'mounted':
      return { kind: 'mounted' };
    case 'mount-error': {
      const message = clampMessage(data.message);
      return message !== null ? { kind: 'mount-error', message } : null;
    }
    case 'dirty':
      return typeof data.dirty === 'boolean' ? { kind: 'dirty', dirty: data.dirty } : null;
    case 'save-request':
      return isRequestId(data.requestId) && isBytes(data.bytes)
        ? { kind: 'save-request', requestId: data.requestId, bytes: data.bytes }
        : null;
    case 'bytes-result':
      return isRequestId(data.requestId) && isBytes(data.bytes)
        ? { kind: 'bytes-result', requestId: data.requestId, bytes: data.bytes }
        : null;
    case 'fatal': {
      const message = clampMessage(data.message);
      return message !== null ? { kind: 'fatal', message } : null;
    }
    case 'request': {
      if (!isRequestId(data.requestId)) return null;
      const req = parseGuestRequest(data);
      return req ? { kind: 'request', requestId: data.requestId, ...req } : null;
    }
    case 'call-result': {
      // La VALEUR n'est pas lue ici : sa forme dépend de la fonction appelée,
      // que seul le pont connaît (`readCallValue`). On ne garde que l'enveloppe.
      if (!isRequestId(data.requestId) || typeof data.ok !== 'boolean') return null;
      const error = data.error === undefined ? undefined : clampMessage(data.error);
      if (error === null) return null;
      return {
        kind: 'call-result',
        requestId: data.requestId,
        ok: data.ok,
        value: data.value,
        ...(error !== undefined ? { error } : {}),
      };
    }
    case 'collab-send':
      return isBytes(data.bytes, COLLAB_SEND_MAX_BYTES) && data.bytes.byteLength > 0
        ? { kind: 'collab-send', bytes: data.bytes }
        : null;
    case 'collab-seeded':
      return { kind: 'collab-seeded' };
    default:
      return null;
  }
}

/** `init.collab`, relu côté page invitée — absent ou mal formé : pas de salle. */
function readCollabInit(v: unknown): SandboxCollabInit | undefined {
  if (!isRecord(v) || typeof v.seed !== 'boolean' || typeof v.responsible !== 'boolean') {
    return undefined;
  }
  if (!Array.isArray(v.updates)) return undefined;
  const updates = v.updates.filter((u): u is ArrayBuffer => isBytes(u, COLLAB_RECEIVE_MAX_BYTES));
  if (updates.length !== v.updates.length) return undefined;
  return { seed: v.seed, responsible: v.responsible, updates };
}

// ── Les valeurs rendues par une fonction pure ───────────────────────────────

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

/** Le type d'une vignette, lu dans ses OCTETS — jamais dans ce qu'elle annonce. */
export function thumbnailMime(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  const commence = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (bytes.length >= 8 && commence(PNG)) return 'image/png';
  if (bytes.length >= 3 && commence(JPEG)) return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return 'image/webp';
  }
  return null;
}

export type FieldValue = string | number | boolean | null;

/**
 * La valeur d'un `call-result`, lue selon la fonction appelée. `null` = refusée
 * (mauvaise forme, hors bornes) : l'appelant la traite comme un échec de
 * l'extension, jamais comme une donnée.
 *
 * `fields` : seules les clés DÉCLARÉES passent, chacune au type déclaré — une
 * extension ne fait pas entrer dans un tableau de Filarr une colonne qu'elle
 * n'a pas annoncée au consentement.
 */
export function readCallValue(
  fn: SandboxFunctionName,
  value: unknown,
  declaredFields: readonly { key: string; type: string }[] = []
): string | Uint8Array | Record<string, FieldValue> | null {
  switch (fn) {
    case 'extractText':
      return typeof value === 'string' ? value.slice(0, EXTRACT_TEXT_MAX_CHARS) : null;
    case 'thumbnail': {
      if (!(value instanceof ArrayBuffer) || value.byteLength > THUMBNAIL_MAX_BYTES) return null;
      const bytes = new Uint8Array(value);
      return thumbnailMime(bytes) ? bytes : null;
    }
    case 'export':
      return value instanceof ArrayBuffer && value.byteLength <= SANDBOX_MAX_BYTES
        ? new Uint8Array(value)
        : null;
    case 'fields': {
      if (!isRecord(value) || Array.isArray(value)) return null;
      const out: Record<string, FieldValue> = {};
      for (const { key, type } of declaredFields) {
        const v = (value as Record<string, unknown>)[key];
        if (v === undefined || v === null) {
          out[key] = null;
          continue;
        }
        switch (type) {
          case 'number':
            out[key] = typeof v === 'number' && Number.isFinite(v) ? v : null;
            break;
          case 'checkbox':
            out[key] = typeof v === 'boolean' ? v : null;
            break;
          case 'date':
            out[key] =
              typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(v) ? v : null;
            break;
          case 'url':
            out[key] =
              typeof v === 'string' && /^https?:\/\//i.test(v) && v.length <= FIELD_TEXT_MAX_CHARS
                ? v
                : null;
            break;
          default:
            out[key] = typeof v === 'string' ? v.slice(0, FIELD_TEXT_MAX_CHARS) : null;
        }
      }
      return out;
    }
    default:
      return null;
  }
}

/** Ce que l'HÔTE envoie — validé côté page invitée, même rigueur. */
export function parseHostMessage(data: unknown): HostMessage | null {
  if (!isRecord(data)) return null;
  switch (data.kind) {
    case 'init':
      return typeof data.version === 'number' &&
        typeof data.code === 'string' &&
        (data.mode === 'editor' ||
          data.mode === 'function' ||
          data.mode === 'block' ||
          data.mode === 'widget') &&
        typeof data.editorId === 'string' &&
        typeof data.fileName === 'string' &&
        typeof data.readOnly === 'boolean' &&
        typeof data.locale === 'string' &&
        isRecord(data.grants) &&
        isBytes(data.bytes)
        ? {
            kind: 'init',
            version: data.version,
            mode: data.mode,
            code: data.code,
            editorId: data.editorId,
            fileName: data.fileName,
            readOnly: data.readOnly,
            bytes: data.bytes,
            grants: data.grants as ExtensionCapabilities,
            theme: sanitizeSandboxTheme(data.theme),
            locale: data.locale.slice(0, 35),
            ...(readCollabInit(data.collab) ? { collab: readCollabInit(data.collab) } : {}),
          }
        : null;
    case 'save-result':
      return isRequestId(data.requestId) && typeof data.ok === 'boolean'
        ? {
            kind: 'save-result',
            requestId: data.requestId,
            ok: data.ok,
            ...(typeof data.errorMessage === 'string'
              ? { errorMessage: data.errorMessage.slice(0, MAX_MESSAGE_CHARS) }
              : {}),
          }
        : null;
    case 'get-bytes':
      return isRequestId(data.requestId) ? { kind: 'get-bytes', requestId: data.requestId } : null;
    case 'destroy':
      return { kind: 'destroy' };
    case 'response':
      return isRequestId(data.requestId) && typeof data.ok === 'boolean'
        ? {
            kind: 'response',
            requestId: data.requestId,
            ok: data.ok,
            value: data.value,
            ...(typeof data.error === 'string'
              ? { error: data.error.slice(0, MAX_MESSAGE_CHARS) }
              : {}),
          }
        : null;
    case 'theme':
      return { kind: 'theme', theme: sanitizeSandboxTheme(data.theme) };
    case 'call':
      return isRequestId(data.requestId) &&
        (data.fn === 'extractText' ||
          data.fn === 'thumbnail' ||
          data.fn === 'fields' ||
          data.fn === 'export') &&
        typeof data.fileName === 'string' &&
        isBytes(data.bytes)
        ? {
            kind: 'call',
            requestId: data.requestId,
            fn: data.fn,
            fileName: data.fileName,
            bytes: data.bytes,
            ...(typeof data.to === 'string' ? { to: data.to as ExportTarget } : {}),
          }
        : null;
    case 'collab-update':
      return isBytes(data.bytes, COLLAB_RECEIVE_MAX_BYTES)
        ? { kind: 'collab-update', bytes: data.bytes }
        : null;
    case 'collab-state':
      return typeof data.responsible === 'boolean'
        ? { kind: 'collab-state', responsible: data.responsible }
        : null;
    default:
      return null;
  }
}
