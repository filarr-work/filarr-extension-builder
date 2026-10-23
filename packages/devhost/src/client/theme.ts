/**
 * theme — les jetons que Filarr passe à la page (`SANDBOX_THEME_TOKENS`),
 * avec les valeurs de ses thèmes « Clair » et « Sombre » par défaut
 * (`src/renderer/styles/tokens/colors.css`, valeurs résolues).
 */

import { sanitizeSandboxTheme, type SandboxTheme } from '../vendor/sandbox/sandboxProtocol';

const LIGHT: Record<string, string> = {
  '--color-background': '#ffffff',
  '--color-background-secondary': '#f8fafc',
  '--color-background-elevated': '#ffffff',
  '--color-surface': '#ffffff',
  '--color-surface-hover': '#f8fafc',
  '--color-border': '#e2e8f0',
  '--color-border-light': '#f1f5f9',
  '--color-border-strong': '#cbd5e1',
  '--color-text-primary': '#1e293b',
  '--color-text-secondary': '#475569',
  '--color-text-tertiary': '#64748b',
  '--color-text-inverted': '#ffffff',
  '--color-text-on-primary': '#ffffff',
  '--color-link': '#3a6b94',
  '--color-focus-ring': '#4682b4',
  '--color-primary-fill': '#3a6b94',
  '--color-primary-fill-hover': '#2f5878',
  '--color-selected': '#f0f9ff',
  '--color-success-on-background': '#047857',
  '--color-warning-on-background': '#b45309',
  '--color-error-on-background': '#b91c1c',
  '--color-info-on-background': '#1d4ed8',
  '--font-family-base': 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  '--font-family-mono': 'ui-monospace, "Cascadia Code", Consolas, monospace',
  '--radius-sm': '4px',
  '--radius-md': '8px',
  '--radius-lg': '12px',
};

const DARK: Record<string, string> = {
  ...LIGHT,
  '--color-background': '#0a0e1a',
  '--color-background-secondary': '#10141f',
  '--color-background-elevated': '#1e2433',
  '--color-surface': '#10141f',
  '--color-surface-hover': '#1a1f2e',
  '--color-border': '#2a3142',
  '--color-border-light': '#1e2433',
  '--color-border-strong': '#3a4256',
  '--color-text-primary': '#f0f8ff',
  '--color-text-secondary': '#b8c5d6',
  '--color-text-tertiary': '#8b98ac',
  '--color-text-inverted': '#0f172a',
  '--color-text-on-primary': '#0f172a',
  '--color-link': '#7dd3fc',
  '--color-focus-ring': '#7dd3fc',
  '--color-primary-fill': '#87ceeb',
  '--color-primary-fill-hover': '#bae6fd',
  '--color-selected': 'rgba(135, 206, 235, 0.16)',
  '--color-success-on-background': '#6ee7b7',
  '--color-warning-on-background': '#fcd34d',
  '--color-error-on-background': '#fca5a5',
  '--color-info-on-background': '#93c5fd',
};

/** Le thème tel que l'hôte l'envoie : déjà filtré, comme `readHostSandboxTheme`. */
export function hostTheme(scheme: 'light' | 'dark'): SandboxTheme {
  return sanitizeSandboxTheme({ scheme, tokens: scheme === 'dark' ? DARK : LIGHT });
}
