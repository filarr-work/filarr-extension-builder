/**
 * netRelay — le relais RÉSEAU du simulateur (capacité `network`, palier 4).
 *
 * Il rejoue côté serveur de développement ce que fait le processus principal
 * du bureau (`electron/extensionNetwork.ts`) : la requête ne part que vers un
 * hôte EXACTEMENT déclaré dans `network.domains`, en HTTPS, sans port ni
 * identifiants, jamais vers une adresse IP, l'hôte local ou Filarr ; une
 * redirection reste sur l'origine de départ, en GET, deux sauts au plus ;
 * 8 s, 1 Mio dans chaque sens, aucun cookie.
 *
 * Ce relais n'est PAS un mandataire ouvert : le serveur n'écoute que sur
 * 127.0.0.1, n'accepte que la page du simulateur (jeton et origine), et le
 * manifeste lu est celui du projet.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const NET_TIMEOUT_MS = 8000;
export const NET_MAX_BODY = 1024 * 1024;
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const HEADER_NAME_RE = /^[a-z0-9-]{1,40}$/;
const BLOCKED_HEADERS = new Set([
  'host',
  'cookie',
  'cookie2',
  'origin',
  'referer',
  'user-agent',
  'connection',
  'content-length',
  'transfer-encoding',
  'keep-alive',
  'upgrade',
  'te',
  'trailer',
  'expect',
  'forwarded',
  'via',
]);

export interface NetGrant {
  domains: string[];
  secrets?: { id: string; label: string; header: string }[];
}

export interface NetInput {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Uint8Array | null;
  /** Les secrets saisis dans le panneau du simulateur, par identifiant déclaré. */
  secrets?: Record<string, string>;
}

export type NetOutcome =
  | { ok: true; status: number; contentType: string; body: Uint8Array; hops: string[] }
  | { ok: false; code: string; detail?: string };

/** Le jugement, sans rien envoyer. */
export function judgeRequest(input: NetInput, grant: NetGrant): { ok: true; url: URL } | { ok: false; code: string; detail?: string } {
  if (!METHODS.includes(input.method)) return { ok: false, code: 'net_invalid', detail: 'méthode' };
  if (input.method === 'GET' && input.body && input.body.byteLength > 0) return { ok: false, code: 'net_invalid', detail: 'corps sur un GET' };
  if (input.body && input.body.byteLength > NET_MAX_BODY) return { ok: false, code: 'net_invalid', detail: 'corps de plus de 1 Mio' };
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return { ok: false, code: 'net_invalid', detail: 'adresse illisible' };
  }
  if (url.protocol !== 'https:') return { ok: false, code: 'net_domain', detail: 'HTTPS seulement' };
  if (url.username || url.password) return { ok: false, code: 'net_domain', detail: 'identifiants dans l’adresse' };
  if (url.port !== '') return { ok: false, code: 'net_domain', detail: 'port explicite' };
  const host = url.hostname.toLowerCase();
  if (isIP(host.replace(/^\[|\]$/g, '')) !== 0) return { ok: false, code: 'net_domain', detail: 'adresse IP' };
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return { ok: false, code: 'net_domain', detail: 'hôte local' };
  if (/(^|\.)filarr\.(com|app)$/.test(host)) return { ok: false, code: 'net_domain', detail: 'Filarr' };
  if (!grant.domains.includes(host)) return { ok: false, code: 'net_domain', detail: `${host} n’est pas dans network.domains` };
  const reserved = new Set((grant.secrets ?? []).map((s) => s.header));
  for (const [name, value] of Object.entries(input.headers)) {
    if (!HEADER_NAME_RE.test(name) || BLOCKED_HEADERS.has(name) || name.startsWith('sec-') || name.startsWith('proxy-') || reserved.has(name)) {
      return { ok: false, code: 'net_header', detail: name };
    }
    if (typeof value !== 'string' || value.length > 1024 || /[\r\n\0]/.test(value)) return { ok: false, code: 'net_header', detail: name };
  }
  return { ok: true, url };
}

const PRIVATE_V4 = [
  [0x0a000000, 8],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0a80000, 16],
  [0x64400000, 10],
  [0x00000000, 8],
] as const;

/** Une adresse résolue est-elle publique ? (Le relais du bureau le revérifie à chaque saut.) */
export function isPublicAddress(addr: string): boolean {
  if (isIP(addr) === 4) {
    const n = addr.split('.').reduce((a, b) => (a << 8) + Number(b), 0) >>> 0;
    return !PRIVATE_V4.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));
  }
  const a = addr.toLowerCase();
  if (a === '::1' || a === '::' || a.startsWith('fe80') || a.startsWith('fc') || a.startsWith('fd')) return false;
  if (a.startsWith('::ffff:')) return isPublicAddress(a.slice(7));
  return true;
}

async function readCapped(res: Response): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > NET_MAX_BODY) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

/** Juge, puis envoie. `fetchImpl` et `resolve` sont injectables pour les tests. */
export async function relayRequest(
  input: NetInput,
  grant: NetGrant,
  deps: { fetchImpl?: typeof fetch; resolve?: (host: string) => Promise<string[]> } = {}
): Promise<NetOutcome> {
  const judged = judgeRequest(input, grant);
  if (!judged.ok) return judged;
  const doFetch = deps.fetchImpl ?? fetch;
  const resolveHost = deps.resolve ?? (async (h: string) => (await lookup(h, { all: true })).map((r) => r.address));
  const headers: Record<string, string> = { ...input.headers };
  for (const s of grant.secrets ?? []) {
    const v = input.secrets?.[s.id];
    if (v) headers[s.header] = v;
  }
  let url = judged.url;
  const origin = url.origin;
  let method = input.method;
  let body: Uint8Array | null = input.body;
  const hops: string[] = [];
  for (let saut = 0; saut <= 2; saut++) {
    try {
      const addrs = await resolveHost(url.hostname);
      if (addrs.length === 0 || !addrs.every(isPublicAddress)) return { ok: false, code: 'net_domain', detail: 'adresse non publique' };
    } catch {
      return { ok: false, code: 'net_unreachable', detail: 'résolution DNS' };
    }
    let res: Response;
    try {
      res = await doFetch(url, {
        method,
        headers,
        body: body && body.byteLength > 0 ? body : undefined,
        redirect: 'manual',
        credentials: 'omit',
        cache: 'no-store',
        signal: AbortSignal.timeout(NET_TIMEOUT_MS),
      });
    } catch (e) {
      return { ok: false, code: 'net_unreachable', detail: e instanceof Error ? e.message : String(e) };
    }
    hops.push(`${method} ${url.href} → ${res.status}`);
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      let next: URL;
      try {
        next = new URL(res.headers.get('location') as string, url);
      } catch {
        return { ok: false, code: 'net_redirect', detail: 'adresse de redirection illisible' };
      }
      // Un secret ne suit jamais un autre hôte : la redirection reste sur l'origine de départ.
      if (next.origin !== origin) return { ok: false, code: 'net_redirect', detail: next.origin };
      if (saut === 2) return { ok: false, code: 'net_redirect', detail: 'plus de deux sauts' };
      url = next;
      method = 'GET';
      body = null;
      continue;
    }
    const data = await readCapped(res);
    if (data === null) return { ok: false, code: 'net_too_large' };
    return { ok: true, status: res.status, contentType: res.headers.get('content-type') ?? '', body: data, hops };
  }
  return { ok: false, code: 'net_redirect' };
}
