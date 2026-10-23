import { describe, expect, it, vi } from 'vitest';
import { isPublicAddress, judgeRequest, relayRequest, type NetGrant } from '../src/netRelay';

const grant: NetGrant = { domains: ['api.example.com'], secrets: [{ id: 'cle', label: 'Clé', header: 'x-api-key' }] };
const req = (over: Partial<Parameters<typeof judgeRequest>[0]> = {}) => ({ method: 'GET', url: 'https://api.example.com/v1', headers: {}, body: null, ...over });

describe('judgeRequest — les refus du relais du bureau', () => {
  it.each([
    ['http', { url: 'http://api.example.com/' }, 'net_domain'],
    ['sous-domaine', { url: 'https://x.api.example.com/' }, 'net_domain'],
    ['autre hôte', { url: 'https://evil.example/' }, 'net_domain'],
    ['port explicite', { url: 'https://api.example.com:8443/' }, 'net_domain'],
    ['identifiants', { url: 'https://a:b@api.example.com/' }, 'net_domain'],
    ['IP', { url: 'https://127.0.0.1/' }, 'net_domain'],
    ['Filarr', { url: 'https://app.filarr.com/' }, 'net_domain'],
    ['corps sur GET', { body: new Uint8Array([1]) }, 'net_invalid'],
    ['en-tête cookie', { headers: { cookie: 'a=b' } }, 'net_header'],
    ['en-tête sec-*', { headers: { 'sec-fetch-mode': 'cors' } }, 'net_header'],
    ['en-tête d’un secret', { headers: { 'x-api-key': 'vole' } }, 'net_header'],
    ['retour à la ligne', { headers: { 'x-a': 'a\r\nb' } }, 'net_header'],
  ])('refuse : %s', (_n, over, code) => {
    const r = judgeRequest(req(over), grant);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(code);
  });

  it('accepte l’hôte exact, en HTTPS', () => {
    expect(judgeRequest(req({ headers: { accept: 'application/json' } }), grant).ok).toBe(true);
  });

  it('adresses publiques seulement', () => {
    expect(isPublicAddress('93.184.216.34')).toBe(true);
    for (const a of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.5.4', '169.254.1.1', '::1', 'fd00::1', '::ffff:10.0.0.1']) expect(isPublicAddress(a)).toBe(false);
  });
});

describe('relayRequest', () => {
  const resolve = async () => ['93.184.216.34'];

  it('ajoute le secret à l’en-tête déclaré, rend le statut tel quel', async () => {
    const fetchImpl = vi.fn(async (_u: URL | RequestInfo, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['x-api-key']).toBe('s3cret');
      return new Response('absent', { status: 404, headers: { 'content-type': 'text/plain' } });
    });
    const r = await relayRequest({ ...req(), secrets: { cle: 's3cret' } }, grant, { fetchImpl: fetchImpl as unknown as typeof fetch, resolve });
    expect(r).toMatchObject({ ok: true, status: 404, contentType: 'text/plain' });
  });

  it('suit une redirection sur la même origine, refuse une autre origine', async () => {
    const same = vi.fn(async (u: URL | RequestInfo) =>
      String(u).endsWith('/v1') ? new Response(null, { status: 302, headers: { location: '/v2' } }) : new Response('ok')
    );
    expect(await relayRequest(req(), grant, { fetchImpl: same as unknown as typeof fetch, resolve })).toMatchObject({ ok: true, status: 200 });
    const other = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }));
    expect(await relayRequest(req(), grant, { fetchImpl: other as unknown as typeof fetch, resolve })).toMatchObject({ ok: false, code: 'net_redirect' });
  });

  it('refuse une réponse de plus de 1 Mio et une adresse résolue privée', async () => {
    const big = vi.fn(async () => new Response(new Uint8Array(1024 * 1024 + 1)));
    expect(await relayRequest(req(), grant, { fetchImpl: big as unknown as typeof fetch, resolve })).toMatchObject({ ok: false, code: 'net_too_large' });
    const never = vi.fn();
    expect(await relayRequest(req(), grant, { fetchImpl: never as unknown as typeof fetch, resolve: async () => ['10.0.0.8'] })).toMatchObject({ ok: false, code: 'net_domain' });
    expect(never).not.toHaveBeenCalled();
  });
});
