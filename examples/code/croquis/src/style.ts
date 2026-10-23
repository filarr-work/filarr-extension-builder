/**
 * style — l'interface suit le thème de Filarr (`--color-*` sur `host.container`) ;
 * la FEUILLE, elle, est du contenu : elle garde la couleur de fond du fichier,
 * en clair comme en sombre, pour que le dessin ressemble à son export.
 */

export const CSS = `
.cq {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  background: var(--color-background-secondary, var(--color-background, Canvas));
  color: var(--color-text-primary, CanvasText);
  font: 14px/1.4 var(--font-family-base, system-ui, sans-serif);
}
.cq-outils {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 12px;
  background: var(--color-background, Canvas); border-bottom: 1px solid var(--color-border, rgba(128,128,128,.35));
}
.cq-couleurs { display: inline-flex; gap: 4px; }
.cq-pastille {
  width: 26px; height: 26px; border-radius: 50%; cursor: pointer; padding: 0;
  background: var(--pastille); border: 2px solid var(--color-border, rgba(128,128,128,.6));
}
.cq-pastille[aria-checked="true"] { outline: 3px solid var(--color-primary-fill, Highlight); outline-offset: 1px; }
.cq-pastille:disabled, .cq-bouton:disabled, .cq-epaisseur:disabled { opacity: .45; cursor: default; }
.cq-bouton, .cq-epaisseur {
  font: inherit; padding: 4px 10px; border-radius: var(--radius-md, 6px); cursor: pointer;
  border: 1px solid var(--color-border, rgba(128,128,128,.5)); background: var(--color-surface, ButtonFace); color: inherit;
}
.cq-bouton:focus-visible, .cq-pastille:focus-visible, .cq-epaisseur:focus-visible, .cq-toile:focus-visible {
  outline: 2px solid var(--color-focus-ring, Highlight); outline-offset: 2px;
}
.etat-statut { margin-left: auto; color: var(--color-text-secondary, GrayText); }
.etat-alerte, .cq-info {
  margin: 8px 12px 0; padding: 8px 12px; border-radius: var(--radius-md, 6px);
  border: 1px solid var(--color-error-on-background, #b3261e); color: var(--color-error-on-background, #b3261e);
}
.cq-info { border-color: var(--color-border, rgba(128,128,128,.5)); color: inherit; }
.cq-feuille { flex: 1; min-height: 0; padding: 12px; display: flex; }
.cq-toile {
  flex: 1; min-width: 0; min-height: 0; touch-action: none; cursor: crosshair;
  border-radius: var(--radius-md, 6px); box-shadow: 0 1px 4px rgba(0,0,0,.2);
}
.cq-curseur { fill: none; stroke-width: 2; opacity: 0; pointer-events: none; }
.cq-toile:focus .cq-curseur { opacity: .9; }
.cq-curseur.cq-pose { stroke-dasharray: 3 2; }
.cq-cache { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;
