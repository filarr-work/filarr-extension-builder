/**
 * Le protocole v2 de bout en bout, sans navigateur : le SCRIPT de la vraie page
 * bac à sable (copie vendorisée) d'un côté, le VRAI pont de Filarr (copie
 * vendorisée) et les services du simulateur de l'autre, reliés par un
 * MessagePort. Seule l'iframe manque — la frontière d'origine, elle, est
 * vérifiée dans Filarr par ses tests Chromium.
 */
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildNocodeBundle } from '@filarr/nocode-engine';
import { createSandboxBridgeCore, type SandboxBridgeCore } from '../src/vendor/sandbox/sandboxBridgeCore';
import { createServices } from '../src/client/services';
import type { ExtensionCapabilities } from '../src/vendor/capabilities/extensionCapabilities';

// Relatif au paquet : sous jsdom, `import.meta.url` n'est pas une URL de fichier.
const html = readFileSync(join(process.cwd(), 'vendor', 'plugin-sandbox.html'), 'utf8');
const pageScript = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
let engine = '';
beforeAll(() => {
  engine = inject('engineSource');
  // Un DOM, mais les tableaux d'octets du processus : ceux que le MessagePort transporte.
  // (L'environnement « jsdom » de vitest remplacerait ArrayBuffer, et la page refuserait l'init.)
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const g = globalThis as Record<string, unknown>;
  for (const k of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'KeyboardEvent', 'getComputedStyle']) {
    g[k] = k === 'window' ? dom.window : (dom.window as unknown as Record<string, unknown>)[k];
  }
  cleanupAll.push(() => dom.window.close());
});
const cleanupAll: (() => void)[] = [];

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
afterAll(() => cleanupAll.forEach((c) => c()));

interface Session {
  bridge: SandboxBridgeCore;
  saves: Uint8Array[];
  dirty: boolean[];
  fatals: string[];
  root: HTMLElement;
}

let cleanup: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanup) c();
  cleanup = [];
});

/** Charge le script de la page dans ce document, puis le bootstrap par un MessagePort. */
function openSession(grants: ExtensionCapabilities = {}, saveError?: string): Session {
  document.body.textContent = '';
  const root = document.createElement('div');
  root.id = 'plugin-root';
  document.body.append(root);
  // Le script de la page, exécuté tel quel (il ne pose qu'un écouteur `message`).
  new Function(pageScript)();
  const channel = new MessageChannel();
  const saves: Uint8Array[] = [];
  const dirty: boolean[] = [];
  const fatals: string[] = [];
  const storage = new Map<string, Uint8Array>();
  const bridge = createSandboxBridgeCore({
    port: channel.port1,
    grants,
    callbacks: {
      onDirty: (d) => dirty.push(d),
      saveBytes: async (b) => {
        if (saveError) throw new Error(saveError);
        saves.push(b);
      },
      onFatal: (m) => fatals.push(m),
    },
    services: createServices({
      grants,
      storage,
      picked: new Map(),
      askPick: async () => null,
      readSample: async () => new Uint8Array(),
      askNet: async () => 'refuse',
      sendNet: async () => ({ status: 200, contentType: '', body: new Uint8Array() }),
      onChange: () => undefined,
      log: () => undefined,
    }),
  });
  channel.port1.onmessage = (ev) => bridge.handleMessage(ev.data);
  // Le bootstrap : un événement `message` venu du parent (ici, la fenêtre elle-même), portant le port.
  const ev = new Event('message');
  Object.defineProperties(ev, {
    source: { value: window.parent },
    data: { value: { type: 'filarr-sandbox-bootstrap' } },
    ports: { value: [channel.port2] },
  });
  window.dispatchEvent(ev);
  cleanup.push(() => {
    bridge.dispose();
    channel.port1.close();
  });
  return { bridge, saves, dirty, fatals, root };
}

const config = {
  nocode: 1,
  id: 'liste-courses',
  format: { type: 'lines' },
  fields: [],
  view: [{ type: 'checklist' }],
  functions: { extractText: true, exports: [{ to: 'md' }] },
};
const theme = { scheme: 'light' as const, tokens: { '--color-text-primary': '#112233' } };

describe('protocole v2 : page vendorisée ↔ pont vendorisé', () => {
  it('monte un bundle sans code, pose le thème, enregistre par saveBytes', async () => {
    const s = openSession();
    await s.bridge.init({
      mode: 'editor',
      code: buildNocodeBundle(config, { engineSource: engine }),
      editorId: 'liste-courses-editor',
      fileName: 'marché.courses',
      readOnly: false,
      bytes: enc('[ ] lait\n'),
      theme,
      locale: 'fr',
    });
    expect(s.root.style.getPropertyValue('--color-text-primary')).toBe('#112233');
    const box = s.root.querySelector('.nc-check') as HTMLInputElement;
    box.click();
    await tick();
    expect(s.dirty).toEqual([true]);
    (s.root.querySelector('.nc-btn-primary') as HTMLButtonElement).click();
    await tick(50);
    expect(s.saves.map(dec)).toEqual(['[x] lait\n']);
    expect(s.dirty).toEqual([true, false]);
    expect(dec(await s.bridge.requestBytes())).toBe('[x] lait\n');
    expect(s.fatals).toEqual([]);
  });

  it('un mauvais identifiant d’éditeur : sandbox_editor_not_found', async () => {
    const s = openSession();
    await expect(
      s.bridge.init({ mode: 'editor', code: buildNocodeBundle(config, { engineSource: engine }), editorId: 'autre-editor', fileName: 'a', readOnly: false, bytes: new Uint8Array(), theme, locale: 'fr' })
    ).rejects.toThrow();
    await tick();
    expect(s.fatals).toContain('sandbox_editor_not_found');
  });

  it('mode fonction : extractText et export passent par readCallValue', async () => {
    const s = openSession({ functions: { extractText: true, exports: [{ to: 'md', label: 'Markdown' }] } });
    await s.bridge.init({ mode: 'function', code: buildNocodeBundle(config, { engineSource: engine }), editorId: '', fileName: 'a.courses', readOnly: true, bytes: new Uint8Array(), theme, locale: 'fr' });
    expect(await s.bridge.call({ fn: 'extractText', fileName: 'a.courses', bytes: enc('[ ] pain\n[x] sel\n') })).toBe('pain\nsel');
    const md = await s.bridge.call({ fn: 'export', fileName: 'a.courses', bytes: enc('[ ] pain\n'), to: 'md' });
    expect(md).toBeInstanceOf(ArrayBuffer);
    expect(dec(new Uint8Array(md as ArrayBuffer))).toContain('- [ ] pain');
  });

  it('une capacité non accordée est refusée par le pont (capability_denied), une accordée passe', async () => {
    const code = `globalThis.filarrSandboxedPlugin = { editors: [{ id: 'x-editor', mount(host) {
      globalThis.__essai = { hasStorage: !!host.storage };
      if (host.storage) host.storage.set('cle', new Uint8Array([1,2,3])).then(() => host.storage.get('cle')).then((v) => { globalThis.__essai.lu = Array.from(v); }, (e) => { globalThis.__essai.erreur = e.message; });
      return { destroy() {}, getBytes() { return new Uint8Array(); } };
    } }] };`;
    const sans = openSession({});
    await sans.bridge.init({ mode: 'editor', code, editorId: 'x-editor', fileName: 'a', readOnly: false, bytes: new Uint8Array(), theme, locale: 'fr' });
    expect((globalThis as { __essai?: { hasStorage: boolean } }).__essai?.hasStorage).toBe(false);
    const avec = openSession({ storage: { quota: 1024 } });
    await avec.bridge.init({ mode: 'editor', code, editorId: 'x-editor', fileName: 'a', readOnly: false, bytes: new Uint8Array(), theme, locale: 'fr' });
    await tick(50);
    expect((globalThis as { __essai?: { lu?: number[] } }).__essai?.lu).toEqual([1, 2, 3]);
  });

  it('lecture seule : le moteur n’appelle jamais saveBytes', async () => {
    const s = openSession();
    await s.bridge.init({ mode: 'editor', code: buildNocodeBundle(config, { engineSource: engine }), editorId: 'liste-courses-editor', fileName: 'a', readOnly: true, bytes: enc('[ ] lait\n'), theme, locale: 'fr' });
    const box = s.root.querySelector('.nc-check') as HTMLInputElement;
    expect(box.disabled).toBe(true);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await tick(50);
    expect(s.saves).toEqual([]);
    expect(dec(await s.bridge.requestBytes())).toBe('[ ] lait\n');
  });
});
