/**
 * style — une feuille CONSTANTE, branchée sur les variables du thème de Filarr.
 *
 * L'hôte pose ses jetons (`--color-*`, `--font-family-*`, `--radius-*`) sur
 * `host.container` : il suffit de les lire. Chaque `var()` a son repli
 * (`Canvas`, `CanvasText`…), qui suit le `color-scheme` que la page pose aussi —
 * l'extension reste lisible même si un jeton manque.
 */

export const CSS = `
.wc {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  background: var(--color-background, Canvas);
  color: var(--color-text-primary, CanvasText);
  font: 14px/1.5 var(--font-family-base, system-ui, sans-serif);
}
.wc-barre, .wc-pied {
  display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap;
  padding: 8px 12px; border-bottom: 1px solid var(--color-border, rgba(128,128,128,.35));
}
.wc-pied { border-bottom: 0; border-top: 1px solid var(--color-border, rgba(128,128,128,.35)); }
.wc-nom { font-weight: 600; }
.wc-stats, .wc-detail, .etat-statut { color: var(--color-text-secondary, GrayText); }
.etat-statut { margin-left: auto; }
.etat-alerte {
  margin: 8px 12px 0; padding: 8px 12px; border-radius: var(--radius-md, 6px);
  border: 1px solid var(--color-error-on-background, #b3261e);
  color: var(--color-error-on-background, #b3261e);
}
.wc-zone {
  flex: 1; min-height: 0; margin: 0; padding: 12px 16px; border: 0; resize: none;
  background: transparent; color: inherit; font: 15px/1.6 var(--font-family-base, system-ui, sans-serif);
}
.wc-zone:focus-visible { outline: 2px solid var(--color-focus-ring, Highlight); outline-offset: -2px; }
.wc-zone[readonly] { color: var(--color-text-secondary, GrayText); }
`;
