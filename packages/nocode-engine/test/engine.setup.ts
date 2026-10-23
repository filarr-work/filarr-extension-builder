/**
 * Le moteur, construit UNE fois dans le processus principal (Node) : esbuild
 * ne se charge pas sous l'environnement jsdom (il y vérifie que TextEncoder
 * rend un Uint8Array du même domaine, ce que jsdom ne garantit pas).
 */
import type { GlobalSetupContext } from 'vitest/node';
import { buildEngineSource } from '../scripts/engine.mjs';

declare module 'vitest' {
  export interface ProvidedContext {
    engineSource: string;
  }
}

export default async function setup({ provide }: GlobalSetupContext): Promise<void> {
  provide('engineSource', await buildEngineSource());
}
