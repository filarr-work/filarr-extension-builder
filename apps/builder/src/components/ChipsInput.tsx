/**
 * ChipsInput — les types de fichiers : de 1 à 10 extensions `^[a-z0-9]{1,10}$`,
 * saisies au clavier (Entrée, virgule ou espace pour valider, Retour arrière
 * pour retirer la dernière), le point de tête accepté et retiré.
 */

import { useState } from 'react';
import { EXTENSION_RE, MAX_EXTENSIONS } from '@filarr/extension-api';
import { usePrefs } from '../state/prefs';

export function normalizeExt(raw: string): string {
  return raw.trim().replace(/^\.+/, '').toLowerCase();
}

export function ChipsInput({ id, value, onChange, describedBy }: { id: string; value: string[]; onChange(v: string[]): void; describedBy?: string }) {
  const { tr } = usePrefs();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const commit = (raw: string) => {
    const parts = raw.split(/[\s,;]+/).map(normalizeExt).filter(Boolean);
    if (parts.length === 0) return true;
    const next = [...value];
    for (const p of parts) {
      if (!EXTENSION_RE.test(p)) {
        setError(tr(`« .${p} » refusé : minuscules et chiffres, 10 au plus, sans point`, `“.${p}” refused: lowercase letters and digits, at most 10, no dot`));
        return false;
      }
      if (next.includes(p)) continue;
      if (next.length >= MAX_EXTENSIONS) {
        setError(tr('10 types de fichiers au plus', 'At most 10 file types'));
        return false;
      }
      next.push(p);
    }
    setError(null);
    onChange(next);
    return true;
  };
  return (
    <div className="stack" style={{ ['--gap' as string]: '6px' }}>
      <div className="chips">
        {value.map((e) => (
          <span key={e} className="chip">
            .{e}
            <button type="button" aria-label={tr(`Retirer .${e}`, `Remove .${e}`)} onClick={() => onChange(value.filter((x) => x !== e))}>
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={draft}
          placeholder={tr('Ajouter…', 'Add…')}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value;
            if (/[\s,;]$/.test(v)) {
              if (commit(v)) setDraft('');
              else setDraft(v.replace(/[\s,;]+$/, ''));
            } else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (commit(draft)) setDraft('');
            } else if (e.key === 'Backspace' && draft === '' && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => {
            if (draft && commit(draft)) setDraft('');
          }}
        />
      </div>
      {error ? (
        <span className="err" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
