/**
 * ProjectHeader — la barre du haut d'un projet, sous ses deux formes :
 *  · étapes (Données, Vue, Fiche, Publier…) comme les maquettes « sans code »,
 *    « Fiche » et « Publier » ;
 *  · atelier (identifiant, version, « Enregistré dans ce navigateur », Exporter,
 *    Construire, Publier…) comme la maquette « Code et essai ».
 */

import type { ReactNode } from 'react';
import { exportProjectZip } from '../lib/zip';
import { usePrefs } from '../state/prefs';
import { useProject } from '../state/project';
import { href, type Screen } from '../state/router';
import { download, InlineSteps, TopBar } from './chrome';

export function SavedStatus() {
  const { tr } = usePrefs();
  const { saveError } = useProject();
  return saveError ? (
    <span className="saved" style={{ color: 'var(--danger)' }} role="alert">
      {tr(`Non enregistré : ${saveError}`, `Not saved: ${saveError}`)}
    </span>
  ) : (
    <span className="saved">{tr('Enregistré dans ce navigateur', 'Saved in this browser')}</span>
  );
}

export function exportCurrent(files: Record<string, Uint8Array>, id: string): void {
  download(exportProjectZip(files, id), `${id}.zip`, 'application/zip');
}

export function ProjectHeader({ screen, end, workshop = false }: { screen: Screen; end?: ReactNode; workshop?: boolean }) {
  const { tr } = usePrefs();
  const { key, mode, project, files, rebuild, building } = useProject();
  const id = project?.manifest.id ?? '?';
  if (workshop) {
    return (
      <TopBar
        end={
          <>
            {end}
            <button type="button" className="btn" onClick={() => exportCurrent(files, id)}>{tr('Exporter le projet', 'Export the project')}</button>
            <button type="button" className="btn btn-soft" onClick={rebuild} aria-busy={building}>{building ? tr('Construction…', 'Building…') : tr('Construire', 'Build')}</button>
            <a className="btn btn-primary" href={href(key, 'publier')}>{tr('Publier…', 'Publish…')}</a>
          </>
        }
      >
        <span aria-hidden="true" className="vsep" />
        <span className="row" style={{ gap: 10, fontSize: 14 }}>
          <span className="mono" style={{ fontWeight: 500 }}>{id}</span>
          <span className="version">{String(project?.manifest.version ?? '')}</span>
          {mode === 'nocode' ? <span className="pill">{tr('Sans code', 'No code')}</span> : null}
          <SavedStatus />
        </span>
      </TopBar>
    );
  }
  return (
    <TopBar end={end}>
      {mode === 'nocode' ? <span className="pill">{tr('Sans code', 'No code')}</span> : <span aria-hidden="true" className="vsep" />}
      <InlineSteps storeKey={key} mode={mode} current={screen} numbered={mode === 'nocode'} />
    </TopBar>
  );
}

export function Skip() {
  const { tr } = usePrefs();
  return (
    <a className="skip" href="#contenu">
      {tr('Aller au contenu', 'Skip to content')}
    </a>
  );
}
