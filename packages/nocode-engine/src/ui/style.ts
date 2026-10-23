/**
 * style — la feuille du moteur, posée par `textContent` dans un `<style>`.
 *
 * Elle suit le thème de l'hôte : la page bac à sable pose les variables
 * `--color-*` de Filarr sur `host.container` (`#plugin-root`), et chaque
 * couleur d'ici les lit, avec un repli clair ou sombre selon `data-scheme`
 * (que le moteur tient à jour par `host.onThemeChange`). L'accent de la
 * configuration (`--nc-accent`, une couleur `#rrggbb` validée) teinte les
 * boutons, les cases, les étoiles et les barres.
 *
 * Aucun réseau : polices du système, icônes en caractères. Tout est préfixé
 * `nc-` et descend de `.nc-root`.
 */

export const STYLESHEET = `
.nc-root, .nc-root * { box-sizing: border-box; }
.nc-root {
  --nc-bg: var(--color-background, #ffffff);
  --nc-bg-2: var(--color-background-secondary, #f6f7f9);
  --nc-surface: var(--color-surface, #ffffff);
  --nc-surface-hover: var(--color-surface-hover, #f1f3f6);
  --nc-border: var(--color-border, #dde1e7);
  --nc-border-strong: var(--color-border-strong, #c3c9d2);
  --nc-text: var(--color-text-primary, #1e293b);
  --nc-muted: var(--color-text-secondary, #5b6576);
  --nc-faint: var(--color-text-tertiary, #8a93a3);
  --nc-link: var(--color-link, #2f5f8a);
  --nc-focus: var(--color-focus-ring, #3b77b0);
  --nc-on-accent: var(--color-text-on-primary, #ffffff);
  --nc-danger: var(--color-error-on-background, #b42318);
  --nc-warn: var(--color-warning-on-background, #9a5b00);
  --nc-success: var(--color-success-on-background, #18794e);
  --nc-radius: var(--radius-md, 8px);
  --nc-radius-sm: var(--radius-sm, 5px);
  --nc-font: var(--font-family-base, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  --nc-accent: var(--color-primary-fill, #2f6fa8);
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--nc-bg);
  color: var(--nc-text);
  font: 14px/1.5 var(--nc-font);
  color-scheme: light;
}
.nc-root[data-scheme="dark"] {
  --nc-bg: var(--color-background, #0f141c);
  --nc-bg-2: var(--color-background-secondary, #151b25);
  --nc-surface: var(--color-surface, #161d28);
  --nc-surface-hover: var(--color-surface-hover, #1d2633);
  --nc-border: var(--color-border, #2a3342);
  --nc-border-strong: var(--color-border-strong, #3a4558);
  --nc-text: var(--color-text-primary, #eef3fa);
  --nc-muted: var(--color-text-secondary, #b4c0d0);
  --nc-faint: var(--color-text-tertiary, #8794a7);
  --nc-link: var(--color-link, #8cc7ef);
  --nc-focus: var(--color-focus-ring, #8cc7ef);
  --nc-danger: var(--color-error-on-background, #fca5a5);
  --nc-warn: var(--color-warning-on-background, #fcd34d);
  --nc-success: var(--color-success-on-background, #6ee7b7);
  color-scheme: dark;
}
.nc-root button, .nc-root input, .nc-root select, .nc-root textarea { font: inherit; color: inherit; }
.nc-root :focus-visible { outline: 2px solid var(--nc-focus); outline-offset: 1px; }
.nc-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px; border-bottom: 1px solid var(--nc-border);
  background: var(--nc-bg-2); flex: none;
}
.nc-file { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.nc-status { color: var(--nc-muted); font-size: 12px; white-space: nowrap; }
.nc-status[data-type="error"] { color: var(--nc-danger); }
.nc-status[data-type="warn"] { color: var(--nc-warn); }
.nc-pill-ro { font-size: 12px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--nc-border-strong); color: var(--nc-muted); }
.nc-banner { margin: 12px 16px 0; padding: 10px 12px; border-radius: var(--nc-radius); border: 1px solid var(--nc-border-strong); background: var(--nc-surface); }
.nc-banner[data-type="error"] { border-color: var(--nc-danger); color: var(--nc-danger); }
.nc-banner[data-type="warn"] { border-color: var(--nc-warn); }
.nc-scroll { flex: 1; overflow: auto; }
.nc-view { max-width: 860px; margin: 0 auto; padding: 18px 20px 48px; display: flex; flex-direction: column; gap: 16px; }
.nc-block { display: flex; flex-direction: column; gap: 6px; }
.nc-label { font-size: 12px; font-weight: 600; letter-spacing: .02em; color: var(--nc-muted); text-transform: uppercase; }
.nc-hint { color: var(--nc-faint); font-size: 13px; }
.nc-input, .nc-textarea, .nc-select {
  width: 100%; padding: 6px 9px; border: 1px solid var(--nc-border); border-radius: var(--nc-radius-sm);
  background: var(--nc-surface); min-width: 0;
}
.nc-input:hover, .nc-textarea:hover, .nc-select:hover { border-color: var(--nc-border-strong); }
.nc-input[readonly], .nc-textarea[readonly], .nc-select:disabled { background: transparent; border-color: transparent; padding-left: 0; }
.nc-textarea { resize: vertical; line-height: 1.5; }
.nc-title {
  font-size: 26px; font-weight: 700; line-height: 1.2; border: 0; border-bottom: 2px solid transparent;
  background: transparent; padding: 4px 0; width: 100%;
}
.nc-title:not([readonly]):hover { border-bottom-color: var(--nc-border); }
.nc-title:focus { border-bottom-color: var(--nc-accent); outline: none; }
.nc-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  padding: 5px 12px; border-radius: var(--nc-radius-sm); border: 1px solid var(--nc-border-strong);
  background: var(--nc-surface); cursor: pointer; white-space: nowrap;
}
.nc-btn:hover:not(:disabled) { background: var(--nc-surface-hover); }
.nc-btn:disabled { opacity: .5; cursor: default; }
.nc-btn-primary { background: var(--nc-accent); border-color: var(--nc-accent); color: var(--nc-on-accent); }
.nc-btn-primary:hover:not(:disabled) { background: var(--nc-accent); filter: brightness(1.08); }
.nc-icon { width: 28px; height: 28px; padding: 0; border-radius: 6px; border: 1px solid transparent; background: transparent; cursor: pointer; color: var(--nc-muted); flex: none; }
.nc-icon:hover:not(:disabled) { background: var(--nc-surface-hover); color: var(--nc-text); }
.nc-icon:disabled { opacity: .35; cursor: default; }
.nc-badges { display: flex; flex-wrap: wrap; gap: 8px; }
.nc-badge {
  --nc-pill: var(--nc-accent);
  display: inline-flex; align-items: center; gap: 6px; padding: 3px 4px 3px 10px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--nc-pill) 45%, transparent);
  background: color-mix(in srgb, var(--nc-pill) 12%, transparent);
}
.nc-badge-label { font-size: 12px; color: var(--nc-muted); }
.nc-badge .nc-input, .nc-badge .nc-select { width: auto; min-width: 4ch; max-width: 22ch; padding: 1px 6px; border-color: transparent; background: transparent; }
.nc-badge .nc-num { width: 7ch; }
.nc-stepper { display: inline-flex; align-items: center; gap: 2px; }
.nc-stepper .nc-icon { width: 24px; height: 24px; }
.nc-check { width: 18px; height: 18px; accent-color: var(--nc-accent); flex: none; margin: 0; }
.nc-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.nc-row { display: flex; align-items: center; gap: 8px; padding: 2px 4px; border-radius: var(--nc-radius-sm); }
.nc-row:hover { background: var(--nc-surface-hover); }
.nc-row .nc-input { border-color: transparent; background: transparent; }
.nc-row .nc-input:focus { border-color: var(--nc-border-strong); background: var(--nc-surface); }
.nc-row[data-type="done"] .nc-input { text-decoration: line-through; color: var(--nc-faint); }
.nc-row-tools { display: inline-flex; gap: 2px; opacity: 0; }
.nc-row:hover .nc-row-tools, .nc-row:focus-within .nc-row-tools { opacity: 1; }
.nc-add { display: flex; gap: 8px; margin-top: 4px; }
.nc-steps { counter-reset: nc-step; display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.nc-step { display: flex; gap: 10px; align-items: flex-start; }
.nc-step-num {
  flex: none; width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  background: var(--nc-accent); color: var(--nc-on-accent); font-size: 13px; font-weight: 700; margin-top: 4px;
}
.nc-step .nc-textarea { flex: 1; }
.nc-section { border: 1px solid var(--nc-border); border-radius: var(--nc-radius); background: var(--nc-surface); }
.nc-section > summary { cursor: pointer; padding: 10px 14px; font-weight: 600; font-size: 15px; list-style-position: inside; }
.nc-section-body { padding: 4px 14px 14px; display: flex; flex-direction: column; gap: 14px; }
.nc-cards { display: flex; flex-direction: column; gap: 10px; }
.nc-card { border: 1px solid var(--nc-border); border-radius: var(--nc-radius); background: var(--nc-surface); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.nc-card-tools { display: flex; justify-content: flex-end; gap: 2px; margin: -6px -8px -4px 0; }
.nc-card .nc-title { font-size: 18px; }
.nc-table-wrap { overflow-x: auto; border: 1px solid var(--nc-border); border-radius: var(--nc-radius); }
.nc-table { width: 100%; border-collapse: collapse; }
.nc-table th { text-align: left; font-size: 12px; font-weight: 600; color: var(--nc-muted); padding: 6px 8px; border-bottom: 1px solid var(--nc-border); background: var(--nc-bg-2); white-space: nowrap; }
.nc-table td { padding: 2px 4px; border-bottom: 1px solid var(--nc-border); vertical-align: middle; }
.nc-table tr:last-child td { border-bottom: 0; }
.nc-table .nc-input, .nc-table .nc-select { border-color: transparent; background: transparent; }
.nc-table .nc-input:focus { border-color: var(--nc-border-strong); background: var(--nc-surface); }
.nc-table td[data-type="boolean"], .nc-table th[data-type="boolean"] { text-align: center; width: 1%; }
.nc-table td[data-type="number"] .nc-input { text-align: right; }
.nc-tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.nc-tag { display: inline-flex; align-items: center; gap: 2px; padding: 1px 4px 1px 10px; border-radius: 999px; background: color-mix(in srgb, var(--nc-accent) 14%, transparent); border: 1px solid color-mix(in srgb, var(--nc-accent) 35%, transparent); }
.nc-tag .nc-icon { width: 20px; height: 20px; }
.nc-tags .nc-input { width: 16ch; }
.nc-stars { display: inline-flex; gap: 2px; }
.nc-star { border: 0; background: transparent; padding: 0 1px; font-size: 22px; line-height: 1; cursor: pointer; color: var(--nc-border-strong); }
.nc-star[aria-pressed="true"] { color: var(--nc-accent); }
.nc-star:disabled { cursor: default; }
.nc-progress { display: flex; align-items: center; gap: 10px; }
.nc-progress-track { flex: 1; height: 10px; border-radius: 999px; background: var(--nc-bg-2); border: 1px solid var(--nc-border); overflow: hidden; }
.nc-progress-fill { height: 100%; width: var(--nc-pct, 0%); background: var(--nc-accent); border-radius: 999px; transition: width .2s; }
.nc-progress-text { font-size: 13px; color: var(--nc-muted); min-width: 6ch; text-align: right; }
.nc-total { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 10px 14px; border-radius: var(--nc-radius); background: color-mix(in srgb, var(--nc-accent) 10%, var(--nc-surface)); border: 1px solid color-mix(in srgb, var(--nc-accent) 30%, transparent); }
.nc-total-value { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.nc-form { display: grid; grid-template-columns: minmax(110px, max-content) 1fr; gap: 8px 14px; align-items: center; }
.nc-form > .nc-label { text-transform: none; font-size: 13px; letter-spacing: 0; }
.nc-number { display: flex; align-items: center; gap: 6px; }
.nc-number .nc-input { width: 10ch; text-align: right; }
.nc-unit { color: var(--nc-muted); }
.nc-linkline { display: flex; gap: 8px; align-items: center; }
.nc-link { color: var(--nc-link); white-space: nowrap; }
.nc-error { margin: auto; max-width: 520px; padding: 24px; text-align: center; display: flex; flex-direction: column; gap: 8px; }
.nc-error-title { font-size: 17px; font-weight: 700; }
.nc-error-detail { color: var(--nc-danger); overflow-wrap: anywhere; }
.nc-empty { color: var(--nc-faint); font-size: 13px; padding: 4px; }
.nc-unknown { color: var(--nc-faint); font-style: italic; font-size: 13px; }
@media (max-width: 560px) {
  .nc-form { grid-template-columns: 1fr; }
  .nc-view { padding: 14px 12px 40px; }
}
`;
