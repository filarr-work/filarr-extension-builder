/**
 * report — la sortie lisible des contrôles : ✓ réussi, ! avertissement, ✗ erreur.
 *
 * Un contrôle d'outil n'a de valeur que s'il se lit d'un coup d'œil ET se lit
 * par une machine : chaque ligne a un niveau, un code stable et un message en
 * français ; `--json` rend la même chose en JSON.
 */

import type { Issue } from '@filarr/extension-api';

export type Level = 'ok' | 'warning' | 'error';

export interface ReportLine {
  level: Level;
  code: string;
  message: string;
  field?: string;
}

export class Report {
  readonly lines: ReportLine[] = [];

  ok(code: string, message: string): void {
    this.lines.push({ level: 'ok', code, message });
  }

  warn(code: string, message: string, field?: string): void {
    this.lines.push({ level: 'warning', code, message, ...(field ? { field } : {}) });
  }

  error(code: string, message: string, field?: string): void {
    this.lines.push({ level: 'error', code, message, ...(field ? { field } : {}) });
  }

  /** Les constats d'un validateur ; `okMessage` quand il n'a trouvé aucune erreur. */
  issues(issues: Issue[], okCode?: string, okMessage?: string): boolean {
    for (const i of issues) {
      if (i.level === 'error') this.error(i.code, i.message, i.field);
      else this.warn(i.code, i.message, i.field);
    }
    const sansErreur = !issues.some((i) => i.level === 'error');
    if (sansErreur && okCode && okMessage) this.ok(okCode, okMessage);
    return sansErreur;
  }

  merge(other: Report): void {
    this.lines.push(...other.lines);
  }

  get errors(): number {
    return this.lines.filter((l) => l.level === 'error').length;
  }

  get warnings(): number {
    return this.lines.filter((l) => l.level === 'warning').length;
  }

  get passed(): boolean {
    return this.errors === 0;
  }

  toJSON(): { ok: boolean; errors: number; warnings: number; lines: ReportLine[] } {
    return { ok: this.passed, errors: this.errors, warnings: this.warnings, lines: this.lines };
  }
}

const useColor = () => process.stdout.isTTY === true && !process.env.NO_COLOR;
const paint = (code: string, s: string) => (useColor() ? `\u001b[${code}m${s}\u001b[0m` : s);
const SYMBOL: Record<Level, string> = { ok: '✓', warning: '!', error: '✗' };
const COLOR: Record<Level, string> = { ok: '32', warning: '33', error: '31' };

export function formatReport(report: Report, title: string): string {
  const out = [paint('1', title)];
  for (const l of report.lines) {
    const where = l.field ? paint('2', ` [${l.field}]`) : '';
    out.push(`  ${paint(COLOR[l.level], SYMBOL[l.level])} ${l.message}${where}`);
  }
  const bilan = `${report.lines.filter((l) => l.level === 'ok').length} réussi(s), ${report.warnings} avertissement(s), ${report.errors} erreur(s)`;
  out.push(report.passed ? paint('32', bilan) : paint('31', bilan));
  return out.join('\n');
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} Kio`;
  return `${(n / 1024 / 1024).toFixed(2).replace('.', ',')} Mio`;
}
