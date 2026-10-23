/**
 * style — les variables du thème de Filarr (`--color-*` sur `host.container`) ;
 * la grille prend son nombre de colonnes dans `--colonnes`, un nombre validé.
 */

export const CSS = `
.pp {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  background: var(--color-background, Canvas); color: var(--color-text-primary, CanvasText);
  font: 14px/1.4 var(--font-family-base, system-ui, sans-serif);
}
.pp-outils {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 12px;
  border-bottom: 1px solid var(--color-border, rgba(128,128,128,.35));
}
.pp-titre {
  flex: 1; min-width: 200px; font: 600 16px var(--font-family-base, system-ui, sans-serif); color: inherit; padding: 4px 8px;
  background: var(--color-surface, Field); border: 1px solid var(--color-border, rgba(128,128,128,.5)); border-radius: var(--radius-sm, 4px);
}
.pp-titre[readonly], .pp-legende[readonly] { background: transparent; border-color: transparent; }
.pp-groupe { display: inline-flex; align-items: center; gap: 6px; color: var(--color-text-secondary, GrayText); }
.pp-colonnes, .pp-bouton, .pp-mini {
  font: inherit; color: inherit; padding: 4px 10px; cursor: pointer;
  border: 1px solid var(--color-border, rgba(128,128,128,.5)); border-radius: var(--radius-md, 6px);
  background: var(--color-surface, ButtonFace);
}
.pp-mini { padding: 2px 8px; }
.pp-principal { background: var(--color-primary-fill, Highlight); color: var(--color-text-on-primary, HighlightText); border-color: transparent; }
:is(.pp-colonnes, .pp-bouton, .pp-mini):disabled { opacity: .45; cursor: default; }
:is(.pp-titre, .pp-colonnes, .pp-bouton, .pp-mini, .pp-legende):focus-visible { outline: 2px solid var(--color-focus-ring, Highlight); outline-offset: 1px; }
.etat-statut { margin-left: auto; color: var(--color-text-secondary, GrayText); }
.etat-alerte, .pp-info {
  margin: 8px 12px 0; padding: 8px 12px; border-radius: var(--radius-md, 6px);
  border: 1px solid var(--color-error-on-background, #b3261e); color: var(--color-error-on-background, #b3261e);
}
.pp-info { border-color: var(--color-border, rgba(128,128,128,.5)); color: inherit; }
.pp-zone { flex: 1; min-height: 0; overflow: auto; padding: 10px 12px 16px; }
.pp-nouvelles:empty { display: none; }
.pp-grille { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; grid-template-columns: repeat(var(--colonnes, 3), minmax(0, 1fr)); }
.pp-photo { display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: var(--radius-lg, 10px); background: var(--color-background-secondary, rgba(128,128,128,.08)); }
.pp-photo figure { margin: 0; display: flex; flex-direction: column; gap: 6px; }
.pp-image { width: 100%; height: auto; aspect-ratio: auto; border-radius: var(--radius-sm, 4px); background: #fff; }
.pp-legende {
  font: inherit; color: inherit; padding: 4px 6px; resize: vertical;
  background: var(--color-surface, Field); border: 1px solid var(--color-border, rgba(128,128,128,.5)); border-radius: var(--radius-sm, 4px);
}
.pp-actions { display: flex; gap: 4px; flex-wrap: wrap; }
.pp-vide, .pp-note { color: var(--color-text-secondary, GrayText); }
.pp-note { font-size: 12px; margin-top: 16px; }
`;
