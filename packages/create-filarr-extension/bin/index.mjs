#!/usr/bin/env node
/** `npm create filarr-extension@latest <nom>` — voir src/create.mjs. */
import { create } from '../src/create.mjs';

try {
  await create(process.argv.slice(2));
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
