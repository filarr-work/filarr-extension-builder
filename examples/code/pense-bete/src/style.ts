/**
 * style — la feuille du tableau. Les couleurs de l'INTERFACE viennent du thème
 * de Filarr (`--color-*`, posées sur `host.container`) ; celles des NOTES sont
 * du contenu, déclinées pour un fond clair et un fond sombre (`data-schema`,
 * suivi par `onThemeChange`).
 */

export const CSS = `
.pb {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  background: var(--color-background-secondary, var(--color-background, Canvas));
  color: var(--color-text-primary, CanvasText);
  font: 14px/1.4 var(--font-family-base, system-ui, sans-serif);
}
.pb-outils {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 8px 12px;
  background: var(--color-background, Canvas);
  border-bottom: 1px solid var(--color-border, rgba(128,128,128,.35));
}
.pb-groupe { display: inline-flex; align-items: center; gap: 4px; }
.pb-zoom { min-width: 3.5em; text-align: center; color: var(--color-text-secondary, GrayText); }
.pb-bouton {
  font: inherit; padding: 4px 10px; cursor: pointer;
  border: 1px solid var(--color-border, rgba(128,128,128,.5)); border-radius: var(--radius-md, 6px);
  background: var(--color-surface, ButtonFace); color: inherit;
}
.pb-bouton[data-action="ajouter"] {
  background: var(--color-primary-fill, Highlight); color: var(--color-text-on-primary, HighlightText); border-color: transparent;
}
.pb-bouton:disabled { opacity: .5; cursor: default; }
.etat-statut { margin-left: auto; color: var(--color-text-secondary, GrayText); }
.pb-prefs { color: var(--color-warning-on-background, GrayText); font-size: 12px; }
.etat-alerte, .pb-info {
  margin: 8px 12px 0; padding: 8px 12px; border-radius: var(--radius-md, 6px);
  border: 1px solid var(--color-error-on-background, #b3261e); color: var(--color-error-on-background, #b3261e);
}
.pb-info { border-color: var(--color-border, rgba(128,128,128,.5)); color: inherit; }
.pb-defilement { position: relative; flex: 1; min-height: 0; overflow: auto; }
.pb-dimension { position: relative; }
.pb-surface { position: absolute; left: 0; top: 0; width: 4000px; height: 4000px; transform-origin: 0 0; }
.pb-vide { position: absolute; left: 24px; top: 16px; margin: 0; color: var(--color-text-secondary, GrayText); }
.pb-note {
  position: absolute; width: 200px; height: 150px; display: flex; flex-direction: column;
  border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,.25); color: #1f1d1a; background: #fff3a6;
}
.pb-note.pb-repliee { height: auto; }
.pb-note.pb-glisse { z-index: 10; box-shadow: 0 6px 16px rgba(0,0,0,.3); }
.pb-note:focus-visible, .pb-texte:focus-visible, .pb-bouton:focus-visible, .pb-mini:focus-visible, .pb-pastille:focus-visible {
  outline: 2px solid var(--color-focus-ring, Highlight); outline-offset: 2px;
}
.pb-note[data-couleur="rose"] { background: #ffd1e1; }
.pb-note[data-couleur="bleu"] { background: #cfe6ff; }
.pb-note[data-couleur="vert"] { background: #d4f5c9; }
.pb-note[data-couleur="orange"] { background: #ffd9b0; }
.pb-note[data-couleur="violet"] { background: #e4d6ff; }
[data-schema="dark"] .pb-note { color: #f3f1ea; background: #6b5d12; }
[data-schema="dark"] .pb-note[data-couleur="rose"] { background: #74304a; }
[data-schema="dark"] .pb-note[data-couleur="bleu"] { background: #1f4a75; }
[data-schema="dark"] .pb-note[data-couleur="vert"] { background: #2f5e2a; }
[data-schema="dark"] .pb-note[data-couleur="orange"] { background: #7a4718; }
[data-schema="dark"] .pb-note[data-couleur="violet"] { background: #4b3577; }
.pb-entete { display: flex; align-items: center; gap: 2px; padding: 2px 4px; cursor: grab; touch-action: none; }
.pb-poignee { flex: 1; opacity: .55; user-select: none; }
.pb-mini, .pb-pastille {
  font: inherit; line-height: 1; width: 24px; height: 24px; border: 0; border-radius: 4px;
  background: transparent; color: inherit; cursor: pointer;
}
.pb-pastille::before { content: ""; display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: currentColor; opacity: .45; }
.pb-mini:disabled, .pb-pastille:disabled { opacity: .35; cursor: default; }
.pb-texte {
  flex: 1; margin: 0; padding: 4px 8px 8px; border: 0; resize: none; background: transparent; color: inherit;
  font: 14px/1.4 var(--font-family-base, system-ui, sans-serif);
}
.pb-cache { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;
