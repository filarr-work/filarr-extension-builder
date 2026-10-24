/**
 * ChecksPanel — « Contrôles avant publication » : les lignes de `filarr-ext
 * check` (mêmes messages), puis celles du simulateur et du Builder. Le résumé
 * dit d'un coup d'œil si l'on peut publier.
 */

import { usePrefs } from '../state/prefs';
import { useProject } from '../state/project';
import { ago, ReportList, summaryOf, useNow } from './chrome';

export function ChecksPanel({ onlyProblems = false }: { onlyProblems?: boolean }) {
  const { tr } = usePrefs();
  const { check, build, building, mode } = useProject();
  const now = useNow(1000);
  const s = summaryOf(check.report.lines, tr);
  const color = s.level === 'error' ? 'var(--danger)' : s.level === 'warning' ? 'var(--warn)' : 'var(--ok)';
  return (
    <section aria-labelledby="chk-t" className="checks">
      <div className="checks-head">
        <h2 id="chk-t">{tr('Contrôles avant publication', 'Pre-publication checks')}</h2>
        <span style={{ fontSize: 12, color }} aria-live="polite">{s.text}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--faint)' }}>
          {building
            ? tr('construction…', 'building…')
            : build
              ? `${tr('construit', 'built')} ${ago(build.at, now, tr)} · ${mode === 'nocode' ? tr('moteur sans code', 'no-code engine') : 'esbuild'} (${build.ms} ms)`
              : tr('pas encore construit', 'not built yet')}
        </span>
      </div>
      <ReportList lines={check.report.lines} onlyProblems={onlyProblems} />
      <span className="hint" style={{ fontSize: 12 }}>
        {tr('Les mêmes que « npx filarr-ext check » ; Filarr et son serveur revérifieront tout après la signature.', 'The same as “npx filarr-ext check”; Filarr and its server will check everything again after signing.')}
      </span>
    </section>
  );
}
