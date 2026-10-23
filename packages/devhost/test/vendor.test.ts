import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — module JS sans déclarations
import { inspectVendor } from '../scripts/vendor-lib.mjs';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface VendorState {
  to: string;
  filarg: string | null;
  present: boolean;
  matchesHash: boolean;
  matchesSource: boolean | null;
  sourceMissing: boolean;
}

describe('copies vendorisées de filarg', () => {
  const etats = inspectVendor(packageDir) as VendorState[];

  it.each(etats.map((e) => [e.to, e] as const))('%s : présente et conforme à son empreinte', (_nom, e) => {
    expect(e.present).toBe(true);
    // Une retouche locale de la copie casse l'empreinte, même sans filarg.
    expect(e.matchesHash).toBe(true);
  });

  const filarg = etats[0]?.filarg ?? null;
  it.skipIf(!filarg).each(etats.map((e) => [e.to, e] as const))(
    '%s : identique à la source de filarg (sinon : npm run sync)',
    (_nom, e) => {
      expect(e.sourceMissing).toBe(false);
      expect(e.matchesSource).toBe(true);
    }
  );
});
