/**
 * style — les variables du thème de Filarr (`--color-*` sur `host.container`),
 * pour l'éditeur (`.cr`) comme pour le bloc de note (`.crb`), qui doit se fondre
 * dans la note qui l'accueille.
 */

export const CSS = `
.cr, .crb {
  position: absolute; inset: 0; color: var(--color-text-primary, CanvasText);
  font: 14px/1.4 var(--font-family-base, system-ui, sans-serif);
}
.cr { display: flex; flex-direction: column; background: var(--color-background, Canvas); }
.cr-outils {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  border-bottom: 1px solid var(--color-border, rgba(128,128,128,.35));
}
.cr-bouton, .cr-supprimer, .crb-regler {
  font: inherit; padding: 4px 10px; cursor: pointer; color: inherit;
  border: 1px solid var(--color-border, rgba(128,128,128,.5)); border-radius: var(--radius-md, 6px);
  background: var(--color-surface, ButtonFace);
}
.cr-principal { background: var(--color-primary-fill, Highlight); color: var(--color-text-on-primary, HighlightText); border-color: transparent; }
:is(.cr-bouton, .cr-supprimer):disabled { opacity: .45; cursor: default; }
.etat-statut { margin-left: auto; color: var(--color-text-secondary, GrayText); }
.etat-alerte, .cr-info, .crb-info {
  margin: 8px 12px 0; padding: 8px 12px; border-radius: var(--radius-md, 6px);
  border: 1px solid var(--color-error-on-background, #b3261e); color: var(--color-error-on-background, #b3261e);
}
.cr-info, .crb-info { border-color: var(--color-border, rgba(128,128,128,.5)); color: inherit; }
.cr-zone { flex: 1; min-height: 0; overflow: auto; padding: 8px 12px 16px; }
.cr-liste { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.cr-carte {
  display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: var(--radius-lg, 10px);
  background: var(--color-background-secondary, rgba(128,128,128,.08)); border: 1px solid transparent;
}
.cr-carte.cr-prochain { border-color: var(--color-primary-fill, Highlight); }
.cr-carte.cr-passe { opacity: .65; }
.cr-ligne { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cr-titre, .cr-date, .cr-note, .crb-titre, .crb-date {
  font: inherit; color: inherit; padding: 4px 6px; border-radius: var(--radius-sm, 4px);
  background: var(--color-surface, Field); border: 1px solid var(--color-border, rgba(128,128,128,.5));
}
.cr-titre { flex: 1; font-weight: 600; }
.cr-note { resize: vertical; }
:is(.cr-titre, .cr-date, .cr-note)[readonly] { background: transparent; border-color: transparent; }
.cr-compte { font-variant-numeric: tabular-nums; color: var(--color-text-secondary, GrayText); }
.cr-prochain .cr-compte { color: var(--color-primary-fill, Highlight); font-weight: 600; }
.cr-vide { color: var(--color-text-secondary, GrayText); }
:is(.cr-bouton, .cr-supprimer, .cr-titre, .cr-date, .cr-note, .crb-regler, .crb-titre, .crb-date):focus-visible {
  outline: 2px solid var(--color-focus-ring, Highlight); outline-offset: 1px;
}
.cr-cache { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.crb { display: flex; flex-direction: column; justify-content: center; gap: 8px; padding: 12px 16px; overflow: auto; }
.crb-vue { text-align: center; }
.crb-nom { margin: 0; font-weight: 600; color: var(--color-text-secondary, GrayText); }
.crb-compte { margin: 4px 0; font-size: 26px; font-variant-numeric: tabular-nums; }
.crb-quand { color: var(--color-text-secondary, GrayText); font-size: 12px; }
.crb-barre { display: flex; justify-content: center; align-items: center; gap: 10px; }
.crb-barre .etat-statut { margin-left: 0; }
.crb-formulaire { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
`;
