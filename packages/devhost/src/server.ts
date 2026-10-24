/**
 * server — le petit serveur Node du simulateur (`filarr-ext dev`).
 *
 * Il sert trois choses : l'HÔTE simulé (une page qui rejoue le protocole v2 du
 * côté de Filarr), la PAGE BAC À SABLE de Filarr, recopiée à l'identique et
 * servie avec la même CSP que l'application, et le bundle de l'extension,
 * reconstruit à chaque modification du projet (les pages ouvertes se
 * rechargent par un flux d'événements).
 *
 * Il n'écoute que sur 127.0.0.1 et refuse tout `Host` qui n'est pas le sien
 * (pas de rebond DNS vers ce serveur). Ses routes d'écriture — le relais
 * réseau — exigent le jeton de la page et son origine.
 */

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, watch, type FSWatcher } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { relayRequest, type NetGrant } from './netRelay';

/** Ce que l'outil rend à chaque construction. */
export interface DevBuild {
  ok: boolean;
  kind: 'code' | 'nocode';
  code?: string;
  errors: string[];
  warnings: string[];
  /** Le manifeste non signé du projet (capacités, identifiant, extensions). */
  manifest: unknown;
}

export interface DevHostOptions {
  port?: number;
  host?: string;
  build(): Promise<DevBuild>;
  /** Les dossiers surveillés (récursivement) ; une modification reconstruit. */
  watch?: string[];
  /** Les chemins ignorés (préfixes absolus) : dist, node_modules… */
  ignore?: string[];
  /** Les fichiers d'exemple que le simulateur ouvre et que le sélecteur propose. */
  samplesDir: string;
  log?(s: string): void;
  /** Injectable pour les tests du relais réseau. */
  fetchImpl?: typeof fetch;
  resolveHost?: (host: string) => Promise<string[]>;
}

export interface DevHost {
  url: string;
  port: number;
  token: string;
  rebuild(): Promise<DevBuild>;
  close(): Promise<void>;
}

/**
 * Les deux empreintes (fins de ligne LF et CRLF) du SEUL script en ligne de la
 * page bac à sable — comme `scripts/sandbox-csp-hash.cjs` de filarg. La CSP
 * n'admet que lui : une iframe enfant fabriquée par l'extension n'exécute
 * rien, et c'est ce qui ferme WebRTC, que Chromium ne coupe pas par la
 * directive `webrtc`. Calculées depuis la page servie : elles ne peuvent pas
 * dériver d'elle.
 */
export function sandboxScriptHashes(page: string): string {
  const lf = page.replace(/\r\n/g, '\n');
  const blocs = [...lf.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (blocs.length !== 1) throw new Error(`plugin-sandbox.html : ${blocs.length} scripts en ligne, 1 attendu`);
  const h = (s: string) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
  return `${h(blocs[0][1])} ${h(blocs[0][1].replace(/\n/g, '\r\n'))}`;
}

/** La CSP et les en-têtes de la page bac à sable — ceux de Filarr (`SANDBOX_HEADERS`). */
export function sandboxHeaders(page: string): Record<string, string> {
  return {
    ...SANDBOX_HEADERS,
    'Content-Security-Policy': SANDBOX_HEADERS['Content-Security-Policy'].replace(
      'SANDBOX_SCRIPT_HASHES',
      sandboxScriptHashes(page)
    ),
  };
}

/** Le modèle des en-têtes ; `sandboxHeaders(page)` y pose les empreintes du script. */
export const SANDBOX_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'none'",
    "script-src SANDBOX_SCRIPT_HASHES 'unsafe-eval'",
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    'media-src blob: data:',
    'worker-src blob:',
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
    "webrtc 'block'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/** La page de l'hôte simulé : aucun script tiers, rien qui sorte du serveur local. */
const HOST_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  'img-src data: blob:',
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const MAX_SAMPLE_BYTES = 64 * 1024 * 1024;
const MAX_NET_BODY_JSON = 2 * 1024 * 1024;
const SAMPLE_NAME_RE = /^[^/\\\0]{1,200}$/;

interface Assets {
  index: string;
  client: string;
  sandbox: string;
}

async function loadAssets(): Promise<Assets> {
  const here = dirname(fileURLToPath(import.meta.url));
  // Publié : tout est dans dist/. Depuis les sources : le client se construit à la volée.
  if (existsSync(join(here, 'client.js')) && existsSync(join(here, 'plugin-sandbox.html'))) {
    return {
      index: readFileSync(join(here, 'index.html'), 'utf8'),
      client: readFileSync(join(here, 'client.js'), 'utf8'),
      sandbox: readFileSync(join(here, 'plugin-sandbox.html'), 'utf8'),
    };
  }
  const { build } = await import('esbuild');
  const r = await build({
    entryPoints: [join(here, 'client', 'main.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    write: false,
    charset: 'utf8',
    logLevel: 'silent',
  });
  return {
    index: readFileSync(join(here, 'client', 'index.html'), 'utf8'),
    client: r.outputFiles[0].text,
    sandbox: readFileSync(join(here, '..', 'vendor', 'plugin-sandbox.html'), 'utf8'),
  };
}

function listSamples(dir: string): { name: string; size: number }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => {
      try {
        return statSync(join(dir, n)).isFile() && !n.startsWith('.');
      } catch {
        return false;
      }
    })
    .sort()
    .map((name) => ({ name, size: statSync(join(dir, name)).size }));
}

function send(res: ServerResponse, status: number, body: string | Uint8Array, type: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

const json = (res: ServerResponse, status: number, value: unknown) => send(res, status, JSON.stringify(value), 'application/json; charset=utf-8');

function readBody(req: IncomingMessage, max: number): Promise<Buffer | null> {
  return new Promise((ok) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) {
        req.destroy();
        ok(null);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', () => ok(null));
  });
}

function networkGrant(manifest: unknown): NetGrant | null {
  const caps = (manifest as { capabilities?: { network?: NetGrant } } | null)?.capabilities;
  const n = caps?.network;
  if (!n || !Array.isArray(n.domains)) return null;
  return { domains: n.domains.filter((d) => typeof d === 'string'), secrets: Array.isArray(n.secrets) ? n.secrets : [] };
}

export async function startDevHost(opts: DevHostOptions): Promise<DevHost> {
  const log = opts.log ?? (() => undefined);
  const assets = await loadAssets();
  const token = randomBytes(18).toString('base64url');
  const samplesDir = resolve(opts.samplesDir);
  const events = new Set<ServerResponse>();
  let current: DevBuild & { seq: number; at: string } = { ok: false, kind: 'code', errors: ['construction en cours…'], warnings: [], manifest: null, seq: 0, at: new Date().toISOString() };
  let building: Promise<DevBuild> | null = null;
  let again = false;

  const broadcast = () => {
    const data = `event: build\ndata: ${JSON.stringify({ seq: current.seq, ok: current.ok })}\n\n`;
    for (const r of events) r.write(data);
  };

  const rebuild = async (): Promise<DevBuild> => {
    if (building) {
      again = true;
      return building;
    }
    building = (async () => {
      let b: DevBuild;
      try {
        b = await opts.build();
      } catch (e) {
        b = { ok: false, kind: current.kind, errors: [e instanceof Error ? e.message : String(e)], warnings: [], manifest: current.manifest };
      }
      current = { ...b, seq: current.seq + 1, at: new Date().toISOString() };
      log(b.ok ? `✓ construit (${b.kind === 'nocode' ? 'sans code' : 'avec code'}, ${Buffer.byteLength(b.code ?? '')} o)` : `✗ construction refusée : ${b.errors[0] ?? ''}`);
      broadcast();
      return b;
    })();
    try {
      return await building;
    } finally {
      building = null;
      if (again) {
        again = false;
        void rebuild();
      }
    }
  };

  // ── La surveillance du projet ──────────────────────────────────────────
  const watchers: FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const ignore = (opts.ignore ?? []).map((p) => resolve(p));
  for (const root of opts.watch ?? []) {
    try {
      watchers.push(
        watch(root, { recursive: true }, (_evt, name) => {
          if (!name) return;
          const abs = resolve(root, name.toString());
          if (ignore.some((p) => abs === p || abs.startsWith(p + sep))) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => void rebuild(), 120);
        })
      );
    } catch (e) {
      log(`! surveillance impossible de ${root} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  let selfOrigin = '';
  const server = createServer(async (req, res) => {
    // Un rebond DNS (« evil.example » résolu en 127.0.0.1) n'atteint pas ce serveur.
    const host = req.headers.host ?? '';
    const expected = selfOrigin.replace(/^http:\/\//, '');
    if (host !== expected && host !== expected.replace('127.0.0.1', 'localhost')) {
      send(res, 421, 'hôte refusé', 'text/plain; charset=utf-8');
      return;
    }
    const url = new URL(req.url ?? '/', selfOrigin);
    const path = url.pathname;
    try {
      if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
        const page = assets.index.replace('__FILARR_DEV_TOKEN__', token);
        send(res, 200, page, 'text/html; charset=utf-8', { 'Content-Security-Policy': HOST_CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
        return;
      }
      if (req.method === 'GET' && path === '/client.js') {
        send(res, 200, assets.client, 'text/javascript; charset=utf-8', { 'X-Content-Type-Options': 'nosniff' });
        return;
      }
      if (req.method === 'GET' && path === '/plugin-sandbox.html') {
        send(res, 200, assets.sandbox, 'text/html; charset=utf-8', sandboxHeaders(assets.sandbox));
        return;
      }
      if (req.method === 'GET' && path === '/api/state') {
        json(res, 200, {
          seq: current.seq,
          at: current.at,
          ok: current.ok,
          kind: current.kind,
          errors: current.errors,
          warnings: current.warnings,
          manifest: current.manifest,
          bundleBytes: Buffer.byteLength(current.code ?? ''),
          samples: listSamples(samplesDir),
        });
        return;
      }
      if (req.method === 'GET' && path === '/api/bundle') {
        if (!current.ok || current.code === undefined) {
          send(res, 409, current.errors.join('\n'), 'text/plain; charset=utf-8');
          return;
        }
        send(res, 200, current.code, 'text/javascript; charset=utf-8');
        return;
      }
      if (req.method === 'GET' && path.startsWith('/api/samples/')) {
        const name = decodeURIComponent(path.slice('/api/samples/'.length));
        const file = resolve(samplesDir, name);
        if (!SAMPLE_NAME_RE.test(name) || dirname(file) !== samplesDir || !existsSync(file) || !statSync(file).isFile() || statSync(file).size > MAX_SAMPLE_BYTES) {
          send(res, 404, 'exemple introuvable', 'text/plain; charset=utf-8');
          return;
        }
        send(res, 200, readFileSync(file), 'application/octet-stream');
        return;
      }
      if (req.method === 'GET' && path === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(`event: build\ndata: ${JSON.stringify({ seq: current.seq, ok: current.ok })}\n\n`);
        events.add(res);
        req.on('close', () => events.delete(res));
        return;
      }
      if (req.method === 'POST' && path === '/api/net') {
        if (req.headers.origin !== selfOrigin || req.headers['x-filarr-dev-token'] !== token) {
          json(res, 403, { ok: false, code: 'forbidden' });
          return;
        }
        const grant = networkGrant(current.manifest);
        if (!grant) {
          json(res, 200, { ok: false, code: 'capability_denied' });
          return;
        }
        const raw = await readBody(req, MAX_NET_BODY_JSON);
        if (!raw) {
          json(res, 413, { ok: false, code: 'net_invalid' });
          return;
        }
        let input: { method: string; url: string; headers: Record<string, string>; bodyBase64: string | null; secrets?: Record<string, string> };
        try {
          input = JSON.parse(raw.toString('utf8'));
        } catch {
          json(res, 400, { ok: false, code: 'net_invalid' });
          return;
        }
        const outcome = await relayRequest(
          {
            method: String(input.method),
            url: String(input.url),
            headers: input.headers && typeof input.headers === 'object' ? input.headers : {},
            body: input.bodyBase64 ? new Uint8Array(Buffer.from(input.bodyBase64, 'base64')) : null,
            secrets: input.secrets,
          },
          grant,
          { fetchImpl: opts.fetchImpl, resolve: opts.resolveHost }
        );
        log(outcome.ok ? `→ réseau : ${input.method} ${input.url} (${outcome.status})` : `→ réseau refusé : ${input.method} ${input.url} (${outcome.code})`);
        json(
          res,
          200,
          outcome.ok
            ? { ok: true, status: outcome.status, contentType: outcome.contentType, bodyBase64: Buffer.from(outcome.body).toString('base64'), hops: outcome.hops }
            : outcome
        );
        return;
      }
      send(res, 404, 'introuvable', 'text/plain; charset=utf-8');
    } catch (e) {
      send(res, 500, e instanceof Error ? e.message : String(e), 'text/plain; charset=utf-8');
    }
  });

  await new Promise<void>((ok, ko) => {
    server.once('error', ko);
    server.listen(opts.port ?? 5199, opts.host ?? '127.0.0.1', () => ok());
  });
  const addr = server.address() as AddressInfo;
  selfOrigin = `http://${addr.address === '::1' ? '[::1]' : addr.address}:${addr.port}`;
  await rebuild();

  return {
    url: `${selfOrigin}/`,
    port: addr.port,
    token,
    rebuild,
    async close() {
      if (timer) clearTimeout(timer);
      for (const w of watchers) w.close();
      for (const r of events) r.end();
      events.clear();
      await new Promise<void>((ok) => server.close(() => ok()));
    },
  };
}
