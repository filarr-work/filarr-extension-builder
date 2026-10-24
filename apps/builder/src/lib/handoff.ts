/**
 * handoff — « Ouvrir dans Filarr », PACKAGE.md §5, chemin 3 (web).
 *
 *   1. ouvrir `<origine de Filarr>/?filarr-publish=builder` dans une nouvelle
 *      fenêtre (pas `noopener` : Filarr répond à `window.opener`) ;
 *   2. attendre `{ type: "filarr-publish-ready", version: 1 }` venant de CETTE
 *      fenêtre (`event.source`) ET de CETTE origine (`event.origin`) — tout
 *      autre message est ignoré, d'où qu'il vienne ;
 *   3. répondre UNE fois `{ type: "filarr-publish-package", version: 1,
 *      bytes: ArrayBuffer }`, avec cette seule origine pour `targetOrigin` :
 *      si la fenêtre a navigué ailleurs entre-temps, le navigateur ne livre
 *      rien.
 *
 * Filarr n'accepte le paquet qu'une fois et dans les 60 s ; on attend autant.
 * Rien d'autre ne part : ni mot de passe, ni jeton, ni clé — le Builder n'en a
 * pas. Filarr relit tout, montre la provenance, et signe sur l'appareil après
 * « J'ai tout relu ».
 */

export const DEFAULT_FILARR_ORIGIN = 'https://app.filarr.com';
export const HANDOFF_TIMEOUT_MS = 60_000;

/**
 * L'origine de Filarr, réglable pour le développement. Refuse ce qui n'est ni
 * `https://…`, ni `http://localhost` / `127.0.0.1` : un paquet ne part pas en
 * clair sur le réseau.
 */
export function normalizeFilarrOrigin(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.username || u.password) return null;
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if (u.protocol === 'https:' || (u.protocol === 'http:' && local)) return u.origin;
  return null;
}

export function publishUrl(origin: string): string {
  return `${origin}/?filarr-publish=builder`;
}

export interface HandoffEnv {
  open(url: string): WindowProxy | Window | null;
  addEventListener(type: 'message', fn: (ev: MessageEvent) => void): void;
  removeEventListener(type: 'message', fn: (ev: MessageEvent) => void): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export type HandoffOutcome = 'sent' | 'blocked' | 'timeout' | 'closed' | 'cancelled';

export interface Handoff {
  done: Promise<HandoffOutcome>;
  cancel(): void;
}

const browserEnv = (): HandoffEnv => ({
  // Une fenêtre nommée de façon unique : jamais un onglet déjà ouvert qu'on réutiliserait.
  open: (url) => window.open(url, `filarr-publish-${Date.now()}`),
  addEventListener: (t, fn) => window.addEventListener(t, fn),
  removeEventListener: (t, fn) => window.removeEventListener(t, fn),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id as number),
});

/**
 * Lance la remise. À appeler DANS le geste de l'utilisateur (le clic) : sinon
 * le navigateur bloque la fenêtre. Le paquet est copié avant d'être transféré.
 */
export function openInFilarr(bytes: Uint8Array, origin: string, env: HandoffEnv = browserEnv(), log: (s: string) => void = () => undefined): Handoff {
  const target = normalizeFilarrOrigin(origin);
  if (!target) return { done: Promise.resolve('blocked'), cancel: () => undefined };
  const win = env.open(publishUrl(target));
  if (!win) return { done: Promise.resolve('blocked'), cancel: () => undefined };
  let settle: (o: HandoffOutcome) => void = () => undefined;
  let finished = false;
  let timer: unknown = null;
  let poll: unknown = null;
  const finish = (o: HandoffOutcome) => {
    if (finished) return;
    finished = true;
    env.removeEventListener('message', onMessage);
    env.clearTimeout(timer);
    env.clearTimeout(poll);
    settle(o);
  };
  function onMessage(ev: MessageEvent): void {
    if (finished) return;
    if (ev.source !== win) return; // pas cette fenêtre : ignoré
    if (ev.origin !== target) return; // pas cette origine : ignoré
    const d = ev.data as { type?: unknown; version?: unknown } | null;
    if (!d || typeof d !== 'object' || d.type !== 'filarr-publish-ready' || d.version !== 1) return;
    const buf = bytes.slice().buffer as ArrayBuffer;
    (win as Window).postMessage({ type: 'filarr-publish-package', version: 1, bytes: buf }, target as string, [buf]);
    log(`paquet remis à ${target} (${bytes.byteLength} octets)`);
    finish('sent');
  }
  const done = new Promise<HandoffOutcome>((resolve) => {
    settle = resolve;
  });
  env.addEventListener('message', onMessage);
  timer = env.setTimeout(() => finish('timeout'), HANDOFF_TIMEOUT_MS);
  const watch = () => {
    if ((win as Window).closed) finish('closed');
    else poll = env.setTimeout(watch, 1000);
  };
  poll = env.setTimeout(watch, 1000);
  return { done, cancel: () => finish('cancelled') };
}
