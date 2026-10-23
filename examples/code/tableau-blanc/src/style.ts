/**
 * style — l'interface suit le thème de Filarr (`--color-*` sur `host.container`) ;
 * la surface du tableau reste blanche (c'est du contenu, le même pour tous les
 * participants, quel que soit leur thème).
 */

export const CSS = `
.tb {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  background: var(--color-background-secondary, var(--color-background, Canvas));
  color: var(--color-text-primary, CanvasText);
  font: 14px/1.4 var(--font-family-base, system-ui, sans-serif);
}
.tb-outils {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 12px;
  background: var(--color-background, Canvas); border-bottom: 1px solid var(--color-border, rgba(128,128,128,.35));
}
.tb-groupe { display: inline-flex; gap: 4px; }
.tb-bouton {
  font: inherit; padding: 4px 10px; cursor: pointer; color: inherit;
  border: 1px solid var(--color-border, rgba(128,128,128,.5)); border-radius: var(--radius-md, 6px);
  background: var(--color-surface, ButtonFace);
}
.tb-bouton[aria-pressed="true"] { background: var(--color-selected, var(--color-primary-fill, Highlight)); color: var(--color-text-on-primary, HighlightText); }
.tb-pastille {
  width: 24px; height: 24px; padding: 0; border-radius: 50%; cursor: pointer;
  background: var(--pastille); border: 2px solid var(--color-border, rgba(128,128,128,.6));
}
.tb-pastille[aria-pressed="true"] { outline: 3px solid var(--color-primary-fill, Highlight); outline-offset: 1px; }
:is(.tb-bouton, .tb-pastille, .tb-champ):disabled { opacity: .45; cursor: default; }
.tb-champ {
  font: inherit; color: inherit; padding: 4px 6px; min-width: 180px;
  background: var(--color-surface, Field); border: 1px solid var(--color-border, rgba(128,128,128,.5)); border-radius: var(--radius-sm, 4px);
}
.tb-badge { margin-left: auto; font-size: 12px; color: var(--color-text-secondary, GrayText); }
.tb-etat { padding: 2px 12px; min-height: 1.4em; }
.etat-statut { color: var(--color-text-secondary, GrayText); font-size: 12px; }
.etat-alerte, .tb-refus, .tb-info {
  margin: 4px 12px; padding: 8px 12px; border-radius: var(--radius-md, 6px);
  border: 1px solid var(--color-error-on-background, #b3261e); color: var(--color-error-on-background, #b3261e);
}
.tb-info { border-color: var(--color-border, rgba(128,128,128,.5)); color: inherit; }
.tb-zone { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 8px 12px 12px; }
.tb-surface { flex: 1; min-height: 0; touch-action: none; cursor: crosshair; border-radius: var(--radius-md, 6px); box-shadow: 0 1px 4px rgba(0,0,0,.2); }
.tb-surface.tb-mode-selection { cursor: default; }
.tb-fond { fill: #ffffff; }
.tb-element:focus { outline: none; }
.tb-element:focus-visible path, .tb-element:focus-visible text, .tb-choisi path, .tb-choisi text {
  filter: drop-shadow(0 0 2px var(--color-focus-ring, #2563eb)) drop-shadow(0 0 2px var(--color-focus-ring, #2563eb));
}
.tb-texte { font: 28px var(--font-family-base, system-ui, sans-serif); dominant-baseline: hanging; }
.tb-aide { margin: 6px 0 0; font-size: 12px; color: var(--color-text-secondary, GrayText); }
.tb-cache { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
:is(.tb-bouton, .tb-pastille, .tb-champ):focus-visible { outline: 2px solid var(--color-focus-ring, Highlight); outline-offset: 2px; }
`;
