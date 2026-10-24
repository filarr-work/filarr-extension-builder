/**
 * CodeEditor — CodeMirror 6, embarqué (aucun chargement distant). Les couleurs
 * sont les jetons de l'atelier : l'éditeur suit le thème clair ou sombre sans
 * se reconstruire. Ctrl/Cmd+S demande une construction.
 */

import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

function languageFor(path: string): Extension {
  const ext = (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? '').toLowerCase();
  if (ext === 'ts' || ext === 'mts' || ext === 'cts') return javascript({ typescript: true });
  if (ext === 'tsx') return javascript({ typescript: true, jsx: true });
  if (ext === 'jsx') return javascript({ jsx: true });
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return javascript();
  if (ext === 'json' || ext === 'recette') return json();
  if (ext === 'css') return css();
  if (ext === 'md') return markdown();
  return [];
}

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: 'var(--syn-kw)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--syn-str)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--syn-fn)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--syn-num)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--syn-com)', fontStyle: 'italic' },
  { tag: [t.propertyName], color: 'var(--syn-fn)' },
  { tag: [t.typeName, t.className], color: 'var(--syn-num)' },
]);

const theme = EditorView.theme({
  '&': { color: 'var(--code-ink)', backgroundColor: 'var(--bg)', fontSize: '13.5px', height: '100%' },
  '.cm-content': { fontFamily: 'var(--mono)', lineHeight: '1.75', caretColor: 'var(--accent)' },
  '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--fainter)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--surface-3) 60%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--faint)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--pressed) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '.cm-scroller': { fontFamily: 'var(--mono)' },
  '.cm-tooltip': { backgroundColor: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border-strong)' },
  '.cm-panels': { backgroundColor: 'var(--surface-2)', color: 'var(--text)' },
  '.cm-searchMatch': { backgroundColor: 'var(--warn-bg)' },
});

export function CodeEditor({ path, value, onChange, onSave, label }: { path: string; value: string; onChange(v: string): void; onSave?(): void; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const lang = useRef(new Compartment());
  const cb = useRef({ onChange, onSave });
  cb.current = { onChange, onSave };

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          lang.current.of(languageFor(path)),
          syntaxHighlighting(highlight),
          theme,
          EditorView.contentAttributes.of({ 'aria-label': label }),
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                cb.current.onSave?.();
                return true;
              },
            },
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // Un éditeur par fichier : la clé du composant change avec le chemin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Une modification venue d'ailleurs (un autre écran) : on remplace le texte sans recréer l'éditeur.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={host} className="editor-host" />;
}
