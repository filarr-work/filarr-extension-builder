/**
 * La version de l'outil, lue dans son `package.json` — le même chemin relatif
 * depuis `src/` (tests) et depuis `dist/` (paquet publié).
 */
import { readFileSync } from 'node:fs';

let cached: string | null = null;

export function toolVersion(): string {
  if (cached) return cached;
  try {
    cached = String(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
  } catch {
    cached = '0.0.0';
  }
  return cached;
}
