/**
 * style — les variables du thème de Filarr (`--color-*` sur `host.container`).
 */

export const CSS = `
.st {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  background: var(--color-background, Canvas); color: var(--color-text-primary, CanvasText);
  font: 14px/1.4 var(--font-family-base, system-ui, sans-serif);
}
.st-outils {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 12px;
  border-bottom: 1px solid var(--color-border, rgba(128,128,128,.35));
}
.st-groupe { display: inline-flex; align-items: center; gap: 6px; color: var(--color-text-secondary, GrayText); }
.st-bouton, .st-supprimer {
  font: inherit; padding: 4px 10px; cursor: pointer; color: inherit;
  border: 1px solid var(--color-border, rgba(128,128,128,.5)); border-radius: var(--radius-md, 6px);
  background: var(--color-surface, ButtonFace);
}
.st-principal { background: var(--color-primary-fill, Highlight); color: var(--color-text-on-primary, HighlightText); border-color: transparent; }
.st-bouton:disabled, .st-supprimer:disabled { opacity: .45; cursor: default; }
.st-decalage, .st-temps, .st-texte {
  font: inherit; color: inherit; padding: 4px 6px;
  background: var(--color-surface, Field); border: 1px solid var(--color-border, rgba(128,128,128,.5)); border-radius: var(--radius-sm, 4px);
}
.st-decalage { width: 7em; }
.st-temps { width: 9.5em; font-family: var(--font-family-mono, ui-monospace, monospace); font-variant-numeric: tabular-nums; }
.st-temps[aria-invalid="true"] { border-color: var(--color-error-on-background, #b3261e); }
.st-texte { flex: 1; min-width: 200px; resize: vertical; }
.st-temps[readonly], .st-texte[readonly], .st-decalage[readonly] { background: transparent; }
:is(.st-bouton, .st-supprimer, .st-decalage, .st-temps, .st-texte):focus-visible { outline: 2px solid var(--color-focus-ring, Highlight); outline-offset: 1px; }
.st-resume, .etat-statut, .st-aide { color: var(--color-text-secondary, GrayText); }
.etat-statut { margin-left: auto; }
.etat-alerte, .st-info, .st-desordre {
  margin: 8px 12px 0; padding: 8px 12px; border-radius: var(--radius-md, 6px);
  border: 1px solid var(--color-error-on-background, #b3261e); color: var(--color-error-on-background, #b3261e);
}
.st-info { border-color: var(--color-border, rgba(128,128,128,.5)); color: inherit; }
.st-zone { flex: 1; min-height: 0; overflow: auto; padding: 0 12px 16px; }
.st-liste { list-style: none; margin: 8px 0 0; padding: 0; }
.st-ligne {
  display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; padding: 8px 0;
  border-bottom: 1px solid var(--color-border, rgba(128,128,128,.2));
}
.st-num { width: 3em; text-align: right; padding-top: 5px; color: var(--color-text-secondary, GrayText); font-variant-numeric: tabular-nums; }
.st-temps-groupe { display: inline-flex; align-items: center; gap: 4px; }
.st-note { flex-basis: 100%; margin: 0 0 0 3.5em; font-size: 12px; color: var(--color-error-on-background, #b3261e); }
.st-note:empty { display: none; }
.st-vide { color: var(--color-text-secondary, GrayText); }
.st-aide { font-size: 12px; margin-top: 12px; }
.st-cache { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;
