/*
 * ─── COPIE VENDORISÉE — ne pas modifier à la main ──────────────────────────
 * Source : filarg/src/services/plugins/sandbox/sandboxBridgeCore.ts
 * Recopiée à l'identique par `npm run sync` ; `test/vendor.test.ts` échoue
 * dès qu'elle s'écarte de la source, ou de l'empreinte notée dans vendor.json.
 * ─── fin de l'en-tête vendorisé ─────────────────────────────────────────────
 */
/**
 * sandboxBridgeCore — le CŒUR du pont côté hôte, pur (aucun DOM : le port est
 * abstrait, les timers et l'horloge injectés — testable en env node).
 *
 * L'adversaire est le greffon : messages entrants validés (sandboxProtocol),
 * corrélation par requestId, timeouts individuels, et COUPURE (onFatal) sous
 * le spam de messages invalides — un greffon qui bombarde n'est pas un greffon
 * qui bogue, et l'hôte tient les clés du coffre.
 *
 * ── ACCORDER, C'EST ICI (docs/plugins/CAPACITES.md) ─────────────────────────
 *
 * Une `request` de la page invitée n'atteint un service QUE si la capacité est
 * dans les `grants` passés au montage — signés par l'auteur ET acceptés par
 * l'utilisateur. La page reçoit les mêmes grants, mais c'est une information :
 * elle peut mentir, tricher, ignorer. Le refus se fait de ce côté-ci du port.
 *
 * Trois gardes de débit, chacune avec sa réponse :
 *  · une capacité non accordée → `capability_denied`, et le message compte
 *    comme invalide (un greffon honnête teste `host.storage` avant de s'en
 *    servir ; un greffon qui insiste se coupe tout seul) ;
 *  · plus de MAX_PENDING_REQUESTS requêtes en vol → `too_many_requests` ;
 *  · un seau de jetons (REQUEST_BURST, REQUEST_RATE_PER_SECOND) →
 *    `rate_limited` — sans compter comme invalide : un éditeur qui sauve ses
 *    réglages à chaque frappe est maladroit, pas hostile.
 *
 * La co-édition (`collab`, palier 1b) a ses propres seaux : chaque update
 * part chez TOUS les pairs, qui la paient en calcul. Au-delà de
 * COLLAB_UPDATES_PER_SECOND updates ou COLLAB_BYTES_PER_SECOND octets
 * (rafales COLLAB_UPDATE_BURST / COLLAB_BYTES_BURST), le pont COUPE
 * (`sandbox_collab_abuse`) — même franchise que le spam de messages. Une
 * update d'une page qui n'est pas en salle, en lecture seule ou sans la
 * capacité est un message invalide.
 */

import {
  COLLAB_RECEIVE_MAX_BYTES,
  SANDBOX_PROTOCOL_VERSION,
  parseGuestMessage,
  type GuestRequest,
  type HostMessage,
  type SandboxFunctionName,
  type SandboxMode,
  type SandboxTheme,
} from './sandboxProtocol';
import type { ExportTarget, ExtensionCapabilities } from '../capabilities/extensionCapabilities';

export const INIT_TIMEOUT_MS = 15_000;
export const REQUEST_TIMEOUT_MS = 10_000;
/** Une fonction pure a dix secondes par appel (CAPACITES.md, palier 2). */
export const CALL_TIMEOUT_MS = 10_000;
/** Au N-ième message invalide, le pont coupe. */
export const MAX_INVALID_MESSAGES = 20;
export const MAX_PENDING_REQUESTS = 16;
export const REQUEST_BURST = 40;
export const REQUEST_RATE_PER_SECOND = 20;
export const COLLAB_UPDATE_BURST = 120;
export const COLLAB_UPDATES_PER_SECOND = 60;
export const COLLAB_BYTES_BURST = 8 * 1024 * 1024;
export const COLLAB_BYTES_PER_SECOND = 2 * 1024 * 1024;

export interface SandboxPortLike {
  postMessage(data: unknown, transfer?: Transferable[]): void;
  close(): void;
}

export interface SandboxBridgeCallbacks {
  onDirty(dirty: boolean): void;
  /** Le SEUL chemin d'écriture — l'hôte re-chiffre et versionne. */
  saveBytes(bytes: Uint8Array): Promise<void>;
  onFatal(message: string): void;
}

/**
 * Les services de l'hôte derrière les capacités. Le pont n'appelle `handle`
 * qu'APRÈS avoir vérifié que la capacité est accordée ; le service, lui, tient
 * le reste (quota, poignées valides, consentement réseau). Un refus se dit en
 * jetant une `Error` dont le message est un CODE stable (`quota_exceeded`,
 * `unknown_handle`, `user_declined`…), jamais une phrase.
 */
export interface SandboxServices {
  handle(req: GuestRequest): Promise<{ value: unknown; transfer?: Transferable[] }>;
}

/**
 * Le lien de l'hôte vers la salle, pour une page qui y est montée. Le pont ne
 * lui passe que des updates déjà validées en forme, en taille et en débit.
 */
export interface SandboxCollabLink {
  send(bytes: Uint8Array): void;
  /** La page a semé la salle vide (une fois, et seulement si elle devait semer). */
  seeded(): void;
}

export interface SandboxBridgeCore {
  /** À brancher sur port.onmessage côté DOM (reçoit event.data). */
  handleMessage(data: unknown): void;
  init(params: {
    mode: SandboxMode;
    code: string;
    editorId: string;
    fileName: string;
    readOnly: boolean;
    bytes: Uint8Array;
    theme: SandboxTheme;
    locale: string;
    /** En salle seulement (capacité `collab` accordée ET lien posé). */
    collab?: { seed: boolean; responsible: boolean; updates: Uint8Array[] };
  }): Promise<void>;
  requestBytes(): Promise<Uint8Array>;
  /** Mode fonction : appeler une fonction pure. La valeur rendue est BRUTE — `readCallValue`. */
  call(params: {
    fn: SandboxFunctionName;
    fileName: string;
    bytes: Uint8Array;
    to?: ExportTarget;
  }): Promise<unknown>;
  /** Le thème de l'hôte a changé : le dire à la page. */
  pushTheme(theme: SandboxTheme): void;
  /** Une update d'un autre pair de la salle. */
  pushCollabUpdate(bytes: Uint8Array): void;
  /** L'élu a changé. */
  pushCollabState(responsible: boolean): void;
  dispose(): void;
}

type TimerFn = (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;

/** La capacité qu'exige une opération — la table du contrat, et rien d'autre. */
export function isRequestPermitted(req: GuestRequest, grants: ExtensionCapabilities): boolean {
  switch (req.op) {
    case 'storage-get':
    case 'storage-set':
    case 'storage-delete':
    case 'storage-list':
      return grants.storage !== undefined;
    case 'pick':
    case 'picked-read':
      return grants.picker !== undefined;
    case 'picked-write':
      return grants.picker?.access === 'readwrite';
    case 'net-request':
      return grants.network !== undefined;
    default:
      return false;
  }
}

export function createSandboxBridgeCore(opts: {
  port: SandboxPortLike;
  callbacks: SandboxBridgeCallbacks;
  /** Les capacités ACCORDÉES. Absentes = le greffon de toujours : rien à demander. */
  grants?: ExtensionCapabilities;
  services?: SandboxServices;
  /** La salle, pour une page montée en co-édition. */
  collab?: SandboxCollabLink;
  setTimeoutFn?: TimerFn;
  clearTimeoutFn?: (t: ReturnType<typeof setTimeout>) => void;
  /** L'horloge du seau de jetons, en millisecondes. */
  now?: () => number;
}): SandboxBridgeCore {
  const { port, callbacks } = opts;
  const grants: ExtensionCapabilities = opts.grants ?? {};
  const setT: TimerFn = opts.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = opts.clearTimeoutFn ?? ((t: ReturnType<typeof setTimeout>) => clearTimeout(t));
  const now = opts.now ?? (() => Date.now());

  let disposed = false;
  let invalidCount = 0;
  let nextRequestId = 1;
  let mode: SandboxMode = 'editor';

  let mountResolve: (() => void) | null = null;
  let mountReject: ((e: Error) => void) | null = null;
  let mountTimer: ReturnType<typeof setTimeout> | null = null;

  type Pending<T> = {
    resolve: (v: T) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  const pendingBytes = new Map<number, Pending<Uint8Array>>();
  const pendingCalls = new Map<number, Pending<unknown>>();

  let requestsInFlight = 0;
  let tokens = REQUEST_BURST;
  let lastRefill = now();

  // La salle : active seulement si `init` l'a ouverte.
  let enSalle = false;
  let doitSemer = false;
  let semee = false;
  let lectureSeule = false;
  let jetonsCollab = COLLAB_UPDATE_BURST;
  let octetsCollab = COLLAB_BYTES_BURST;
  let dernierCollab = now();

  const send = (msg: HostMessage, transfer?: Transferable[]) => {
    if (disposed) return;
    try {
      port.postMessage(msg, transfer);
    } catch {
      /* port déjà fermé */
    }
  };

  const failAll = (message: string) => {
    if (mountReject) {
      mountReject(new Error(message));
      mountResolve = null;
      mountReject = null;
      if (mountTimer) clearT(mountTimer);
    }
    for (const pending of [...pendingBytes.values(), ...pendingCalls.values()]) {
      clearT(pending.timer);
      pending.reject(new Error(message));
    }
    pendingBytes.clear();
    pendingCalls.clear();
  };

  const fatal = (message: string) => {
    failAll(message);
    callbacks.onFatal(message);
  };

  const invalid = () => {
    invalidCount++;
    if (invalidCount >= MAX_INVALID_MESSAGES) fatal('sandbox_protocol_abuse');
  };

  /** Un jeton de débit, rechargé au fil du temps. */
  const takeToken = (): boolean => {
    const t = now();
    tokens = Math.min(REQUEST_BURST, tokens + ((t - lastRefill) / 1000) * REQUEST_RATE_PER_SECOND);
    lastRefill = t;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };

  /** Les deux seaux de la co-édition. Faux = au-delà : le pont coupe. */
  const takeCollab = (taille: number): boolean => {
    const t = now();
    const dt = (t - dernierCollab) / 1000;
    dernierCollab = t;
    jetonsCollab = Math.min(COLLAB_UPDATE_BURST, jetonsCollab + dt * COLLAB_UPDATES_PER_SECOND);
    octetsCollab = Math.min(COLLAB_BYTES_BURST, octetsCollab + dt * COLLAB_BYTES_PER_SECOND);
    if (jetonsCollab < 1 || octetsCollab < taille) return false;
    jetonsCollab -= 1;
    octetsCollab -= taille;
    return true;
  };

  const answer = (requestId: number, ok: boolean, value?: unknown, error?: string) =>
    send({
      kind: 'response',
      requestId,
      ok,
      ...(ok ? { value } : { error: error ?? 'request_failed' }),
    });

  const handleRequest = (requestId: number, req: GuestRequest) => {
    if (!isRequestPermitted(req, grants) || !opts.services) {
      answer(requestId, false, undefined, 'capability_denied');
      invalid();
      return;
    }
    if (requestsInFlight >= MAX_PENDING_REQUESTS) {
      answer(requestId, false, undefined, 'too_many_requests');
      return;
    }
    if (!takeToken()) {
      answer(requestId, false, undefined, 'rate_limited');
      return;
    }
    requestsInFlight++;
    void opts.services
      .handle(req)
      .then(
        (res) => {
          if (disposed) return;
          send({ kind: 'response', requestId, ok: true, value: res.value }, res.transfer);
        },
        (e: unknown) =>
          answer(requestId, false, undefined, e instanceof Error ? e.message : 'request_failed')
      )
      .finally(() => {
        requestsInFlight--;
      });
  };

  return {
    handleMessage(data: unknown) {
      if (disposed) return;
      const msg = parseGuestMessage(data);
      if (msg === null) {
        invalid();
        return;
      }
      switch (msg.kind) {
        case 'ready':
          // Distingue « page morte » de « greffon lent » — informatif seulement.
          return;
        case 'mounted':
          if (mountResolve) {
            mountResolve();
            mountResolve = null;
            mountReject = null;
            if (mountTimer) clearT(mountTimer);
          }
          return;
        case 'mount-error':
          if (mountReject) {
            mountReject(new Error(msg.message || 'sandbox_mount_failed'));
            mountResolve = null;
            mountReject = null;
            if (mountTimer) clearT(mountTimer);
          }
          return;
        case 'dirty':
          // Une FONCTION n'édite rien : un « sale » de sa part est un abus.
          if (mode === 'function') {
            invalid();
            return;
          }
          callbacks.onDirty(msg.dirty);
          return;
        case 'save-request': {
          const requestId = msg.requestId;
          if (mode === 'function') {
            invalid();
            send({ kind: 'save-result', requestId, ok: false, errorMessage: 'read_only' });
            return;
          }
          void callbacks
            .saveBytes(new Uint8Array(msg.bytes))
            .then(() => send({ kind: 'save-result', requestId, ok: true }))
            .catch((e: unknown) =>
              send({
                kind: 'save-result',
                requestId,
                ok: false,
                errorMessage: e instanceof Error ? e.message : 'save_failed',
              })
            );
          return;
        }
        case 'bytes-result': {
          const pending = pendingBytes.get(msg.requestId);
          if (!pending) return; // requête inconnue/expirée : ignoré
          pendingBytes.delete(msg.requestId);
          clearT(pending.timer);
          pending.resolve(new Uint8Array(msg.bytes));
          return;
        }
        case 'call-result': {
          const pending = pendingCalls.get(msg.requestId);
          if (!pending) return;
          pendingCalls.delete(msg.requestId);
          clearT(pending.timer);
          if (msg.ok) pending.resolve(msg.value);
          else pending.reject(new Error(msg.error || 'function_failed'));
          return;
        }
        case 'request': {
          const { kind: _kind, requestId, ...req } = msg;
          handleRequest(requestId, req as GuestRequest);
          return;
        }
        case 'fatal':
          fatal(msg.message || 'sandbox_crashed');
          return;
        case 'collab-send':
          if (!enSalle || !opts.collab || lectureSeule || grants.collab !== true) {
            invalid();
            return;
          }
          if (!takeCollab(msg.bytes.byteLength)) {
            fatal('sandbox_collab_abuse');
            return;
          }
          opts.collab.send(new Uint8Array(msg.bytes));
          return;
        case 'collab-seeded':
          if (!enSalle || !opts.collab || !doitSemer || semee) {
            invalid();
            return;
          }
          semee = true;
          opts.collab.seeded();
          return;
      }
    },

    init(params) {
      mode = params.mode;
      lectureSeule = params.readOnly;
      // La salle ne s'ouvre qu'à un éditeur dont la capacité est accordée ET
      // dont l'hôte a posé le lien : les trois, ou rien.
      const salle =
        params.mode === 'editor' && grants.collab === true && opts.collab && params.collab
          ? params.collab
          : undefined;
      enSalle = salle !== undefined;
      doitSemer = salle?.seed === true;
      return new Promise<void>((resolve, reject) => {
        mountResolve = resolve;
        mountReject = reject;
        mountTimer = setT(() => {
          if (mountReject) {
            mountReject(new Error('sandbox_init_timeout'));
            mountResolve = null;
            mountReject = null;
          }
        }, INIT_TIMEOUT_MS);
        // CLONE OBLIGATOIRE : le transfert DÉTACHE le buffer côté émetteur, et
        // l'appelant (la modale) garde les octets en état React. Imposé ici,
        // jamais laissé à l'appelant.
        const copie = params.bytes.slice();
        const dejaLa = (salle?.updates ?? []).map((u) => u.slice().buffer as ArrayBuffer);
        send(
          {
            kind: 'init',
            version: SANDBOX_PROTOCOL_VERSION,
            mode: params.mode,
            code: params.code,
            editorId: params.editorId,
            fileName: params.fileName,
            readOnly: params.readOnly,
            bytes: copie.buffer as ArrayBuffer,
            grants,
            theme: params.theme,
            locale: params.locale,
            ...(salle
              ? { collab: { seed: salle.seed, responsible: salle.responsible, updates: dejaLa } }
              : {}),
          },
          [copie.buffer as ArrayBuffer, ...dejaLa]
        );
      });
    },

    requestBytes() {
      return new Promise<Uint8Array>((resolve, reject) => {
        const requestId = nextRequestId++;
        const timer = setT(() => {
          pendingBytes.delete(requestId);
          reject(new Error('sandbox_request_timeout'));
        }, REQUEST_TIMEOUT_MS);
        pendingBytes.set(requestId, { resolve, reject, timer });
        send({ kind: 'get-bytes', requestId });
      });
    },

    call(params) {
      return new Promise<unknown>((resolve, reject) => {
        if (disposed) {
          reject(new Error('sandbox_disposed'));
          return;
        }
        const requestId = nextRequestId++;
        const timer = setT(() => {
          pendingCalls.delete(requestId);
          reject(new Error('function_timeout'));
        }, CALL_TIMEOUT_MS);
        pendingCalls.set(requestId, { resolve, reject, timer });
        const copie = params.bytes.slice();
        send(
          {
            kind: 'call',
            requestId,
            fn: params.fn,
            fileName: params.fileName,
            bytes: copie.buffer as ArrayBuffer,
            ...(params.to !== undefined ? { to: params.to } : {}),
          },
          [copie.buffer as ArrayBuffer]
        );
      });
    },

    pushTheme(theme) {
      send({ kind: 'theme', theme });
    },

    pushCollabUpdate(bytes) {
      if (!enSalle || bytes.byteLength > COLLAB_RECEIVE_MAX_BYTES) return;
      const copie = bytes.slice().buffer as ArrayBuffer;
      send({ kind: 'collab-update', bytes: copie }, [copie]);
    },

    pushCollabState(responsible) {
      if (enSalle) send({ kind: 'collab-state', responsible });
    },

    dispose() {
      if (disposed) return;
      send({ kind: 'destroy' });
      disposed = true;
      failAll('sandbox_disposed');
      try {
        port.close();
      } catch {
        /* déjà fermé */
      }
    },
  };
}
