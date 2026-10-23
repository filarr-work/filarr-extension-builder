/**
 * page — monter UNE page bac à sable, comme `sandboxHost.ts` le fait dans
 * Filarr : iframe `sandbox="allow-scripts"` (jamais `allow-same-origin`), un
 * seul message de bootstrap portant un MessagePort, puis le pont vendorisé
 * (`sandboxBridgeCore.ts`) branché sur ce port.
 *
 * Entre le pont et le port, une ÉCOUTE : chaque message, dans chaque sens, est
 * résumé dans le journal avant de partir (le transfert détache les octets, on
 * les mesure avant).
 */

import { SANDBOX_BOOTSTRAP_TYPE, type SandboxMode, type SandboxTheme } from '../vendor/sandbox/sandboxProtocol';
import {
  createSandboxBridgeCore,
  type SandboxBridgeCore,
  type SandboxCollabLink,
  type SandboxServices,
} from '../vendor/sandbox/sandboxBridgeCore';
import type { ExtensionCapabilities } from '../vendor/capabilities/extensionCapabilities';
import { summarize } from './util';

export interface PageParams {
  container: HTMLElement;
  title: string;
  hidden?: boolean;
  grants: ExtensionCapabilities;
  services?: SandboxServices;
  collab?: SandboxCollabLink;
  onDirty(dirty: boolean): void;
  saveBytes(bytes: Uint8Array): Promise<void>;
  onFatal(message: string): void;
  log(dir: 'out' | 'in', text: string): void;
}

export interface MountedPage {
  iframe: HTMLIFrameElement;
  bridge: SandboxBridgeCore;
  destroy(): void;
}

export async function openPage(p: PageParams): Promise<MountedPage> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.title = p.title;
  if (p.hidden) {
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  }
  iframe.src = '/plugin-sandbox.html';
  let bridge: SandboxBridgeCore | null = null;
  let channel: MessageChannel | null = null;
  await new Promise<void>((ok, ko) => {
    const timer = setTimeout(() => ko(new Error('sandbox_page_timeout')), 10_000);
    iframe.addEventListener(
      'load',
      () => {
        clearTimeout(timer);
        const win = iframe.contentWindow;
        if (!win) {
          ko(new Error('sandbox_page_unavailable'));
          return;
        }
        channel = new MessageChannel();
        // '*' obligatoire (origine opaque) : ce message ne porte RIEN d'autre que le type et le port.
        win.postMessage({ type: SANDBOX_BOOTSTRAP_TYPE }, '*', [channel.port2]);
        const port1 = channel.port1;
        const ecoute = {
          postMessage(data: unknown, transfer?: Transferable[]) {
            p.log('out', summarize(data));
            port1.postMessage(data, transfer ?? []);
          },
          close() {
            port1.close();
          },
        };
        bridge = createSandboxBridgeCore({
          port: ecoute,
          callbacks: { onDirty: p.onDirty, saveBytes: p.saveBytes, onFatal: p.onFatal },
          grants: p.grants,
          services: p.services,
          collab: p.collab,
        });
        port1.onmessage = (ev) => {
          p.log('in', summarize(ev.data));
          bridge?.handleMessage(ev.data);
        };
        ok();
      },
      { once: true }
    );
    p.container.append(iframe);
  });
  const b = bridge as unknown as SandboxBridgeCore;
  return {
    iframe,
    bridge: b,
    destroy() {
      try {
        b.dispose();
      } catch {
        /* déjà fermé */
      }
      iframe.remove();
    },
  };
}

export async function initPage(
  page: MountedPage,
  params: {
    mode: SandboxMode;
    code: string;
    editorId: string;
    fileName: string;
    readOnly: boolean;
    bytes: Uint8Array;
    theme: SandboxTheme;
    locale: string;
    collab?: { seed: boolean; responsible: boolean; updates: Uint8Array[] };
  }
): Promise<void> {
  await page.bridge.init(params);
}
