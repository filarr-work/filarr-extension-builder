/**
 * style — l'éditeur (`.mt`) et le widget (`.mtw`) suivent le thème de Filarr
 * (`--color-*` sur `host.container`) ; le widget, posé sur l'accueil, garde un
 * fond transparent pour se fondre dans sa case.
 */

export const CSS = `
.mt, .mtw {
  position: absolute; inset: 0; color: var(--color-text-primary, CanvasText);
  font: 14px/1.4 var(--font-family-base, system-ui, sans-serif);
}
.mt { display: flex; flex-direction: column; background: var(--color-background, Canvas); }
.mt-outils {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  border-bottom: 1px solid var(--color-border, rgba(128,128,128,.35));
}
.mt-bouton, .mt-resultat {
  font: inherit; padding: 4px 10px; cursor: pointer; color: inherit;
  border: 1px solid var(--color-border, rgba(128,128,128,.5)); border-radius: var(--radius-md, 6px);
  background: var(--color-surface, ButtonFace);
}
.mt-bouton:disabled { opacity: .45; cursor: default; }
.mt-champ {
  font: inherit; color: inherit; padding: 4px 6px; border-radius: var(--radius-sm, 4px);
  background: var(--color-surface, Field); border: 1px solid var(--color-border, rgba(128,128,128,.5));
}
.mt-champ[readonly]:not(.mt-reglage) { background: transparent; }
.mt-coord { width: 8em; }
.mt-nom { flex: 1; min-width: 140px; }
.mt-reglage { flex: 1; font-family: var(--font-family-mono, ui-monospace, monospace); }
:is(.mt-bouton, .mt-resultat, .mt-champ):focus-visible { outline: 2px solid var(--color-focus-ring, Highlight); outline-offset: 1px; }
.etat-statut { margin-left: auto; color: var(--color-text-secondary, GrayText); }
.etat-alerte, .mt-info {
  margin: 8px 12px 0; padding: 8px 12px; border-radius: var(--radius-md, 6px);
  border: 1px solid var(--color-error-on-background, #b3261e); color: var(--color-error-on-background, #b3261e);
}
.mt-info { border-color: var(--color-border, rgba(128,128,128,.5)); color: inherit; }
.mt-zone { flex: 1; min-height: 0; overflow: auto; padding: 10px 12px 16px; }
.mt-ajout { display: grid; gap: 6px; margin-bottom: 12px; }
.mt-ligne { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mt-resultats { list-style: none; margin: 0; padding: 0; display: flex; gap: 6px; flex-wrap: wrap; }
.mt-liste { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.mt-lieu { padding: 10px 12px; border-radius: var(--radius-lg, 10px); background: var(--color-background-secondary, rgba(128,128,128,.08)); }
.mt-coords, .mt-note, .mt-vide, .mt-reglage-ligne span { color: var(--color-text-secondary, GrayText); font-size: 12px; }
.mt-mesure { margin: 6px 0; min-height: 1.2em; }
.mt-mesure:empty { display: none; }
.mt-echec, .mtw-echec { color: var(--color-error-on-background, #b3261e); }
.mtw { display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 12px 14px; overflow: hidden; }
.mtw-lieu { margin: 0; font-weight: 600; color: var(--color-text-secondary, GrayText); }
.mtw-ligne { margin: 0; display: flex; align-items: center; gap: 8px; }
.mtw-picto { font-size: 30px; }
.mtw-temp { font-size: 32px; font-variant-numeric: tabular-nums; }
.mtw-detail, .mtw-echec { margin: 0; font-size: 12px; }
.mtw .mt-bouton { align-self: flex-start; margin-top: 4px; }
`;
