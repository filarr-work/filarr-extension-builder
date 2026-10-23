/**
 * Les dix exemples sans code du dépôt passent `check`, et leur paquet passe
 * `verify` : ce qu'on montre aux auteurs est ce que Filarr accepterait.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCheck } from '../src/check';
import { assemblePackage, verifyPackage } from '../src/package';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'examples', 'nocode');
const ids = existsSync(ROOT) ? readdirSync(ROOT).filter((n) => existsSync(join(ROOT, n, 'filarr.extension.json'))).sort() : [];

describe('les exemples sans code', () => {
  it('sont dix', () => {
    expect(ids).toHaveLength(10);
  });

  it.each(ids)('%s : check sans erreur, paquet relu sans erreur', async (id) => {
    const r = await runCheck(join(ROOT, id));
    expect(r.report.lines.filter((l) => l.level === 'error')).toEqual([]);
    const { bytes } = assemblePackage(r, '1.0.0');
    const v = verifyPackage(bytes);
    expect(v.report.lines.filter((l) => l.level !== 'ok')).toEqual([]);
  });
});
