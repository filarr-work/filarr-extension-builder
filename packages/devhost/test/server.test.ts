import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sandboxHeaders, startDevHost, type DevBuild, type DevHost } from '../src/index';

let host: DevHost;
let dir: string;
let builds = 0;

function get(path: string, headers: Record<string, string> = {}, method = 'GET', body?: string): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((ok, ko) => {
    const r = request({ host: '127.0.0.1', port: host.port, path, method, headers: { host: `127.0.0.1:${host.port}`, ...headers } }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => ok({ status: res.statusCode ?? 0, headers: res.headers, body: data }));
    });
    r.on('error', ko);
    if (body) r.write(body);
    r.end();
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'filarr-devhost-'));
  mkdirSync(join(dir, 'exemples'));
  writeFileSync(join(dir, 'exemples', 'a.notes'), 'bonjour');
  writeFileSync(join(dir, 'secret.txt'), 'à ne pas servir');
  host = await startDevHost({
    port: 0,
    samplesDir: join(dir, 'exemples'),
    watch: [dir],
    async build(): Promise<DevBuild> {
      builds++;
      return { ok: true, kind: 'code', code: `globalThis.filarrSandboxedPlugin={editors:[]};/*${builds}*/`, errors: [], warnings: [], manifest: { id: 'notes', extensions: ['notes'] } };
    },
  });
});

afterAll(async () => {
  await host.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('le serveur du simulateur', () => {
  it('sert l’hôte avec son jeton, et la page bac à sable avec la CSP de Filarr, octet pour octet', async () => {
    const index = await get('/');
    expect(index.status).toBe(200);
    expect(index.body).toContain(host.token);
    const page = await get('/plugin-sandbox.html');
    expect(page.status).toBe(200);
    const csp = page.headers['content-security-policy'] as string;
    expect(csp).toBe(sandboxHeaders(page.body as string)['Content-Security-Policy']);
    // Le seul script de la page, par son empreinte : jamais 'unsafe-inline'.
    expect(csp).toMatch(/script-src 'sha256-[^']+' 'sha256-[^']+' 'unsafe-eval'/);
    expect(csp).not.toContain("'unsafe-inline' 'unsafe-eval'");
    expect(page.headers['content-security-policy']).toContain("webrtc 'block'");
    expect(page.body).toBe(readFileSync(new URL('../vendor/plugin-sandbox.html', import.meta.url), 'utf8'));
  });

  it('état, bundle et fichiers d’exemple — sans sortir du dossier', async () => {
    const state = JSON.parse((await get('/api/state')).body);
    expect(state.ok).toBe(true);
    expect(state.samples).toEqual([{ name: 'a.notes', size: 7 }]);
    expect((await get('/api/bundle')).body).toContain('filarrSandboxedPlugin');
    expect((await get('/api/samples/a.notes')).body).toBe('bonjour');
    expect((await get('/api/samples/..%2Fsecret.txt')).status).toBe(404);
    expect((await get('/api/samples/%2E%2E%5Csecret.txt')).status).toBe(404);
  });

  it('refuse un Host étranger (rebond DNS) et un relais réseau sans jeton', async () => {
    expect((await get('/api/state', { host: 'evil.example' })).status).toBe(421);
    const sans = await get('/api/net', { 'content-type': 'application/json', origin: `http://127.0.0.1:${host.port}` }, 'POST', '{}');
    expect(sans.status).toBe(403);
    const avec = await get('/api/net', { 'content-type': 'application/json', origin: `http://127.0.0.1:${host.port}`, 'x-filarr-dev-token': host.token }, 'POST', JSON.stringify({ method: 'GET', url: 'https://example.com/', headers: {} }));
    // Le manifeste ne déclare pas `network` : rien ne part.
    expect(JSON.parse(avec.body)).toMatchObject({ ok: false, code: 'capability_denied' });
  });

  it('reconstruit quand le projet change', async () => {
    const avant = builds;
    writeFileSync(join(dir, 'source.ts'), 'export {}');
    for (let i = 0; i < 50 && builds === avant; i++) await new Promise((r) => setTimeout(r, 50));
    expect(builds).toBeGreaterThan(avant);
  });
});
