import { describe, expect, it, vi } from 'vitest';
import { normalizeFilarrOrigin, openInFilarr, publishUrl, type HandoffEnv } from '../src/lib/handoff';

/** Une fausse fenêtre de Filarr et un faux `window` du Builder, pilotables. */
function harness() {
  const posted: { data: unknown; origin: string; transfer?: Transferable[] }[] = [];
  const filarr = { closed: false, postMessage: (data: unknown, origin: string, transfer?: Transferable[]) => posted.push({ data, origin, transfer }) };
  const listeners = new Set<(ev: MessageEvent) => void>();
  const timers: { fn: () => void; ms: number; id: number }[] = [];
  let opened: string | null = null;
  const env: HandoffEnv = {
    open: (url) => {
      opened = url;
      return filarr as unknown as Window;
    },
    addEventListener: (_t, fn) => listeners.add(fn),
    removeEventListener: (_t, fn) => listeners.delete(fn),
    setTimeout: (fn, ms) => {
      const id = timers.length + 1;
      timers.push({ fn, ms, id });
      return id;
    },
    clearTimeout: (id) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
  };
  const send = (data: unknown, origin: string, source: unknown = filarr) => {
    for (const fn of [...listeners]) fn({ data, origin, source } as MessageEvent);
  };
  return { env, posted, filarr, send, listeners, timers, opened: () => opened };
}

describe('Ouvrir dans Filarr (PACKAGE.md §5)', () => {
  it('ouvre ?filarr-publish=builder, attend « ready » de CETTE fenêtre et de CETTE origine, puis remet le paquet une fois', async () => {
    const h = harness();
    const bytes = new Uint8Array([1, 2, 3]);
    const handoff = openInFilarr(bytes, 'https://app.filarr.com', h.env);
    expect(h.opened()).toBe('https://app.filarr.com/?filarr-publish=builder');
    // Ignorés : mauvaise origine, mauvaise fenêtre, mauvaise version, mauvais type.
    h.send({ type: 'filarr-publish-ready', version: 1 }, 'https://evil.example');
    h.send({ type: 'filarr-publish-ready', version: 1 }, 'https://app.filarr.com', {});
    h.send({ type: 'filarr-publish-ready', version: 2 }, 'https://app.filarr.com');
    h.send({ type: 'autre', version: 1 }, 'https://app.filarr.com');
    expect(h.posted).toHaveLength(0);
    h.send({ type: 'filarr-publish-ready', version: 1 }, 'https://app.filarr.com');
    expect(await handoff.done).toBe('sent');
    expect(h.posted).toHaveLength(1);
    const p = h.posted[0];
    expect(p.origin).toBe('https://app.filarr.com');
    expect(p.data).toMatchObject({ type: 'filarr-publish-package', version: 1 });
    const buf = (p.data as { bytes: ArrayBuffer }).bytes;
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(buf))).toEqual([1, 2, 3]);
    expect(p.transfer).toEqual([buf]);
    // Une seule fois : un second « ready » ne renvoie rien.
    h.send({ type: 'filarr-publish-ready', version: 1 }, 'https://app.filarr.com');
    expect(h.posted).toHaveLength(1);
    expect(h.listeners.size).toBe(0);
    // Le paquet d'origine n'est pas détaché par le transfert.
    expect(bytes.byteLength).toBe(3);
  });

  it('abandonne après 60 s, ou si la fenêtre est fermée', async () => {
    const h = harness();
    const a = openInFilarr(new Uint8Array([1]), 'https://app.filarr.com', h.env);
    h.timers.find((t) => t.ms === 60_000)!.fn();
    expect(await a.done).toBe('timeout');
    const h2 = harness();
    const b = openInFilarr(new Uint8Array([1]), 'https://app.filarr.com', h2.env);
    h2.filarr.closed = true;
    h2.timers.find((t) => t.ms === 1000)!.fn();
    expect(await b.done).toBe('closed');
  });

  it('refuse une origine en clair hors de la machine, et une fenêtre bloquée', async () => {
    expect(normalizeFilarrOrigin('http://app.filarr.com')).toBeNull();
    expect(normalizeFilarrOrigin('https://user:pw@app.filarr.com')).toBeNull();
    expect(normalizeFilarrOrigin('http://localhost:5174/chemin')).toBe('http://localhost:5174');
    expect(normalizeFilarrOrigin('https://app.filarr.com/x?y')).toBe('https://app.filarr.com');
    expect(publishUrl('http://localhost:5174')).toBe('http://localhost:5174/?filarr-publish=builder');
    const open = vi.fn(() => null);
    const h = harness();
    expect(await openInFilarr(new Uint8Array([1]), 'https://app.filarr.com', { ...h.env, open }).done).toBe('blocked');
    expect(await openInFilarr(new Uint8Array([1]), 'http://exemple.org', h.env).done).toBe('blocked');
  });
});
