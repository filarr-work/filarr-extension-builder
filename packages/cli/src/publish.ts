/**
 * publish — remettre un paquet à Filarr pour bureau (PACKAGE.md §5, chemin 2).
 *
 * On n'envoie RIEN nulle part : on ouvre `filarr://publish?file=<chemin
 * absolu, encodé>`, et Filarr lit le fichier, le relit en entier, le montre, et
 * signe sur l'appareil après « J'ai tout relu ». Ni mot de passe, ni clé, ni
 * jeton ne passent par cet outil — il n'en demande aucun.
 */

import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_ARCHIVE_BYTES, PACKAGE_EXTENSION } from '@filarr/extension-api';
import { verifyPackage } from './package';
import { Report } from './report';

export function publishUrl(absPath: string): string {
  return `filarr://publish?file=${encodeURIComponent(absPath)}`;
}

export interface PublishPlan {
  report: Report;
  url?: string;
  path?: string;
}

/** Les mêmes refus que Filarr : extension, fichier régulier, 8 Mio, puis la relecture complète. */
export function planPublish(file: string, engineSource?: string): PublishPlan {
  const report = new Report();
  const path = resolve(file);
  if (!path.toLowerCase().endsWith(PACKAGE_EXTENSION)) {
    report.error('publish_extension', `Filarr n’accepte qu’un chemin qui finit par ${PACKAGE_EXTENSION}`);
    return { report };
  }
  let size: number;
  try {
    const st = statSync(path);
    if (!st.isFile()) {
      report.error('publish_not_file', `${path} n’est pas un fichier régulier`);
      return { report };
    }
    size = st.size;
  } catch {
    report.error('publish_missing', `${path} introuvable`);
    return { report };
  }
  if (size > MAX_ARCHIVE_BYTES) {
    report.error('publish_too_large', 'le paquet dépasse 8 Mio');
    return { report };
  }
  const v = verifyPackage(new Uint8Array(readFileSync(path)), { engineSource });
  report.merge(v.report);
  if (!report.passed) return { report };
  return { report, url: publishUrl(path), path };
}

/** Ouvre une adresse avec le gestionnaire du système, sans passer par un interpréteur de commandes. */
export function openUrl(url: string): Promise<void> {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  return new Promise((ok, ko) => {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, shell: false });
    child.on('error', ko);
    child.on('spawn', () => {
      child.unref();
      ok();
    });
  });
}
