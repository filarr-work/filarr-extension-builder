/**
 * style — les variables du thème de Filarr (`--color-*` sur `host.container`).
 */

export const CSS = `
.gh {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  background: var(--color-background, Canvas); color: var(--color-text-primary, CanvasText);
  font: 14px/1.4 var(--font-family-base, system-ui, sans-serif);
}
.gh-outils {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 12px;
  border-bottom: 1px solid var(--color-border, rgba(128,128,128,.35));
}
.gh-champ {
  font: 14px var(--font-family-mono, ui-monospace, monospace); color: inherit; padding: 4px 8px; min-width: 220px;
  background: var(--color-surface, Field); border: 1px solid var(--color-border, rgba(128,128,128,.5)); border-radius: var(--radius-sm, 4px);
}
.gh-champ[readonly] { background: transparent; }
.gh-bouton {
  font: inherit; padding: 4px 10px; cursor: pointer; color: inherit;
  border: 1px solid var(--color-border, rgba(128,128,128,.5)); border-radius: var(--radius-md, 6px);
  background: var(--color-surface, ButtonFace);
}
.gh-principal { background: var(--color-primary-fill, Highlight); color: var(--color-text-on-primary, HighlightText); border-color: transparent; }
.gh-bouton:disabled { opacity: .45; cursor: default; }
:is(.gh-bouton, .gh-champ, .gh-jeton summary):focus-visible { outline: 2px solid var(--color-focus-ring, Highlight); outline-offset: 1px; }
.etat-statut { margin-left: auto; color: var(--color-text-secondary, GrayText); }
.etat-alerte, .gh-info {
  margin: 8px 12px 0; padding: 8px 12px; border-radius: var(--radius-md, 6px);
  border: 1px solid var(--color-error-on-background, #b3261e); color: var(--color-error-on-background, #b3261e);
}
.gh-info { border-color: var(--color-border, rgba(128,128,128,.5)); color: inherit; }
.gh-zone { flex: 1; min-height: 0; overflow: auto; padding: 10px 12px 16px; }
.gh-liste { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.gh-depot { padding: 10px 12px; border-radius: var(--radius-lg, 10px); background: var(--color-background-secondary, rgba(128,128,128,.08)); }
.gh-ligne { display: flex; align-items: center; gap: 8px; }
.gh-nom { flex: 1; font-family: var(--font-family-mono, ui-monospace, monospace); overflow-wrap: anywhere; }
.gh-chiffres { display: flex; gap: 16px; flex-wrap: wrap; margin: 8px 0 4px; }
.gh-chiffres dt { font-size: 12px; color: var(--color-text-secondary, GrayText); }
.gh-chiffres dd { margin: 0; font-size: 16px; font-variant-numeric: tabular-nums; }
.gh-note, .gh-vide, .gh-remarque { margin: 4px 0; font-size: 12px; color: var(--color-text-secondary, GrayText); }
.gh-note:empty, .gh-echec:empty { display: none; }
.gh-echec { margin: 4px 0; font-size: 12px; color: var(--color-error-on-background, #b3261e); }
.gh-nouvelle { margin: 4px 0; font-weight: 600; color: var(--color-success-on-background, var(--color-primary-fill, Highlight)); }
.gh-jeton { margin-top: 16px; padding: 8px 12px; border-radius: var(--radius-md, 6px); border: 1px dashed var(--color-border, rgba(128,128,128,.5)); }
.gh-jeton summary { cursor: pointer; font-weight: 600; }
.gh-jeton p { color: var(--color-text-secondary, GrayText); }
`;
