import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildEngineSourceSync, packageDir } from '../scripts/engine.mjs';

/**
 * Les garanties NON NÉGOCIABLES du moteur, relues dans le code qui voyage :
 * le bundle minifié (ce que Filarr exécute) et les sources (ce qu'on relit).
 */

const INTERDITS: [string, RegExp][] = [
  ['innerHTML', /\binnerHTML\b/],
  ['outerHTML', /\bouterHTML\b/],
  ['insertAdjacentHTML', /\binsertAdjacentHTML\b/],
  ['document.write', /\bdocument\.write(ln)?\b/],
  ['eval', /\beval\s*\(/],
  ['new Function', /\bnew\s+Function\b|\bFunction\s*\(/],
  ['setTimeout(chaîne)', /setTimeout\(\s*["'`]/],
  ['fetch', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['RTCPeerConnection', /\bRTCPeerConnection\b/],
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['indexedDB', /\bindexedDB\b/],
  ['importScripts', /\bimportScripts\b/],
  ['import()', /\bimport\s*\(/],
  ['window.open', /\.open\s*\(/],
];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** Le code sans ses commentaires (qui, eux, ont le droit de nommer ce qu'on s'interdit). */
function sansCommentaires(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

describe('le bundle du moteur', () => {
  const engine = buildEngineSourceSync() as string;

  it.each(INTERDITS)('ne contient pas %s', (_nom, re) => {
    expect(re.test(engine)).toBe(false);
  });

  it('est une IIFE ES2020 exécutable comme corps de fonction, en ASCII', () => {
    expect(() => new Function('globalThis', engine)).not.toThrow();
    expect(/^[\x00-\x7f]*$/.test(engine)).toBe(true);
  });
});

describe('les sources du moteur', () => {
  const fichiers = sources(join(packageDir as string, 'src'));
  it.each(fichiers.map((f) => [f.slice((packageDir as string).length + 1), f]))('%s : aucune API interdite', (_n, f) => {
    const code = sansCommentaires(readFileSync(f, 'utf8'));
    for (const [nom, re] of INTERDITS) {
      if (re.test(code)) throw new Error(`${nom} trouvé dans ${f}`);
    }
  });
});
