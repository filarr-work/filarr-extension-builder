/**
 * services — ce que le simulateur met DERRIÈRE chaque capacité accordée, avec
 * les mêmes codes de refus que Filarr (`hostServices.ts`, `extensionStorage.ts`,
 * `extensionPicker.ts`, `extensionNetwork.ts`).
 *
 *  · stockage : en mémoire, 256 clés, quota compté en clair (`quota_exceeded`,
 *    `storage_too_many_keys`) ;
 *  · sélecteur : une boîte qui propose les fichiers d'exemple du projet ; des
 *    poignées opaques de 24 caractères ; `unknown_handle`, `read_only`, `busy` ;
 *  · réseau : chaque envoi MONTRÉ (Envoyer / Refuser / Bloquer), une requête
 *    identique déjà acceptée passe sans redemander, puis le serveur de
 *    développement l'émet vers les seuls domaines déclarés.
 *
 * Le pont (copie vendorisée de `sandboxBridgeCore.ts`) a déjà vérifié que la
 * capacité est accordée avant d'appeler ici — exactement comme dans Filarr.
 */

import type { GuestRequest } from '../vendor/sandbox/sandboxProtocol';
import type { SandboxServices } from '../vendor/sandbox/sandboxBridgeCore';
import type { ExtensionCapabilities } from '../vendor/capabilities/extensionCapabilities';
import { randomHandle } from './util';

export const STORAGE_MAX_KEYS = 256;

export interface PickedEntry {
  name: string;
  readwrite: boolean;
  /** Ce que l'extension y a écrit (le fichier d'exemple, lui, n'est jamais touché). */
  written?: Uint8Array;
}

export type NetRequest = Extract<GuestRequest, { op: 'net-request' }>;
export type NetDecision = 'send' | 'refuse' | 'block';

export interface ServiceDeps {
  grants: ExtensionCapabilities;
  storage: Map<string, Uint8Array>;
  picked: Map<string, PickedEntry>;
  /** La boîte du sélecteur : les noms choisis, ou `null` pour « Annuler ». */
  askPick(opts: { multiple: boolean; extensions?: string[]; access: 'read' | 'readwrite' }): Promise<string[] | null>;
  readSample(name: string): Promise<Uint8Array>;
  /** La boîte de consentement réseau. */
  askNet(req: NetRequest): Promise<NetDecision>;
  /** L'envoi par le serveur de développement. */
  sendNet(req: NetRequest): Promise<{ status: number; contentType: string; body: Uint8Array }>;
  onChange(): void;
  log(kind: 'info' | 'warn' | 'error', text: string): void;
}

const own = (b: Uint8Array) => b.slice().buffer as ArrayBuffer;

export function createServices(d: ServiceDeps): SandboxServices {
  let pickBusy = false;
  let blocked = false;
  const accepted = new Set<string>();

  return {
    async handle(req) {
      switch (req.op) {
        case 'storage-get': {
          const v = d.storage.get(req.key);
          if (!v) return { value: null };
          const buf = own(v);
          return { value: buf, transfer: [buf] };
        }
        case 'storage-set': {
          const bytes = new Uint8Array(req.bytes);
          if (!d.storage.has(req.key) && d.storage.size >= STORAGE_MAX_KEYS) throw new Error('storage_too_many_keys');
          let total = bytes.byteLength;
          for (const [k, v] of d.storage) if (k !== req.key) total += v.byteLength;
          if (total > (d.grants.storage?.quota ?? 0)) {
            d.log('warn', `stockage : quota dépassé (${total} > ${d.grants.storage?.quota} octets)`);
            throw new Error('quota_exceeded');
          }
          d.storage.set(req.key, bytes);
          d.onChange();
          return { value: null };
        }
        case 'storage-delete':
          d.storage.delete(req.key);
          d.onChange();
          return { value: null };
        case 'storage-list':
          return { value: [...d.storage.keys()].sort() };
        case 'pick': {
          if (pickBusy) throw new Error('busy');
          pickBusy = true;
          try {
            const access = d.grants.picker?.access ?? 'read';
            const names = await d.askPick({ multiple: req.multiple, extensions: d.grants.picker?.extensions, access });
            if (!names) return { value: [] };
            const choisis = req.multiple ? names : names.slice(0, 1);
            const value = choisis.map((name) => {
              const handle = randomHandle();
              d.picked.set(handle, { name, readwrite: access === 'readwrite' });
              return { handle, name };
            });
            d.onChange();
            return { value };
          } finally {
            pickBusy = false;
          }
        }
        case 'picked-read': {
          const p = d.picked.get(req.handle);
          if (!p) throw new Error('unknown_handle');
          const bytes = p.written ?? (await d.readSample(p.name));
          const buf = own(bytes);
          return { value: buf, transfer: [buf] };
        }
        case 'picked-write': {
          const p = d.picked.get(req.handle);
          if (!p) throw new Error('unknown_handle');
          if (!p.readwrite || d.grants.picker?.access !== 'readwrite') throw new Error('read_only');
          p.written = new Uint8Array(req.bytes);
          d.log('info', `sélecteur : « ${p.name} » réécrit (${p.written.byteLength} octets, en mémoire seulement)`);
          d.onChange();
          return { value: null };
        }
        case 'net-request': {
          if (blocked) throw new Error('net_refused');
          const key = JSON.stringify([req.method, req.url, Object.entries(req.headers).sort(), req.body ? Array.from(new Uint8Array(req.body)).join(',') : '']);
          if (!accepted.has(key)) {
            const decision = await d.askNet(req);
            if (decision === 'block') {
              blocked = true;
              d.log('warn', 'réseau : extension bloquée jusqu’au rechargement');
            }
            if (decision !== 'send') throw new Error('net_refused');
            accepted.add(key);
          }
          const r = await d.sendNet(req);
          const body = own(r.body);
          return { value: { status: r.status, contentType: r.contentType, body }, transfer: [body] };
        }
        default:
          throw new Error('unsupported');
      }
    },
  };
}
