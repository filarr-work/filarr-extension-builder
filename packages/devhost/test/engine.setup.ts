/**
 * Le moteur sans code, construit UNE fois dans le processus principal (Node) :
 * esbuild ne se charge pas dans un environnement jsdom.
 */
import type { GlobalSetupContext } from 'vitest/node';
import { buildEngineSource } from '../../nocode-engine/scripts/engine.mjs';

declare module 'vitest' {
  export interface ProvidedContext {
    engineSource: string;
  }
}

export default async function setup({ provide }: GlobalSetupContext): Promise<void> {
  provide('engineSource', (await buildEngineSource()) as string);
}
