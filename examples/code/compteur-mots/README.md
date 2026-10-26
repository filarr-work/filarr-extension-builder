# Compteur de mots (word counter, `.wc`)

Filarr's [quickstart](../../../docs/contract/QUICKSTART.md), in TypeScript and
tested: a text area, with a live count of words, characters and reading time.

This is the example to read first. It does almost nothing, but it does
everything an editor must do to be accepted by the host:

| The contract ([`API.md`](../../../docs/contract/API.md))                        | Where to see it                                |
| ------------------------------------------------------------------------------- | ---------------------------------------------- |
| The editor is named exactly `<id>-editor`                                       | `src/index.ts`, `EDITOR_ID`                    |
| 0 bytes = new (empty) document                                                  | `lireTexte` returns an empty text              |
| Unknown format: error displayed, bytes returned untouched                       | `!lu.ok` branch of `mount`                     |
| `readOnly` freezes the interface                                                | `zone.readOnly = host.readOnly`                |
| `onDirty(true)` on every keystroke, `false` only on success                     | `src/sauvegarde.ts`                            |
| Autosave debounced at 2 s, Ctrl+S to force it                                   | `src/sauvegarde.ts`, `estRaccourciEnregistrer` |
| Rejection codes: `item_version_conflict`, `read_only`, `save_in_flight`, others | `src/sauvegarde.ts`, `src/etat.ts`             |
| `getBytes()` total and synchronous                                              | `ecrireTexte(zone.value, …)`                   |
| `destroy()` releases everything, saves nothing                                  | end of `mount`                                 |
| Host theme (`--color-*`) and `onThemeChange`                                    | `src/style.ts`, `data-schema`                  |
| French or English depending on `host.locale`                                    | `src/i18n.ts`                                  |
| Never `innerHTML`                                                               | `src/dom.ts`                                   |

Two courtesies a text editor owes its files: the byte order mark (BOM) and
`\r\n` line endings are kept as they are. Without them, merely opening a file
for the first time would rewrite a file nobody has touched.

## Capabilities

**None.** The extension only receives the open document, and that is all it
needs. This is the default, and the best case: nothing to accept at install
time, nothing to explain.

## The format

Plain UTF-8 text. A file that is not valid UTF-8 is rejected with a message,
never "repaired": decoding it with the invalid bytes replaced and then saving it
would destroy its content.

## Build and check

From this folder (the tools are installed at the repository root):

```bash
npm run build   # dist/bundle.js — IIFE, es2020, minified
npm run check   # manifest, publishing limits, type checking, bundle shape
npm run smoke   # mounts the editor in a simulated page and plays through the contract
npm test        # tests of the pure modules (count, text, save)
```

## Try it in Filarr

Marketplace › Publish › **Test without publishing**: choose `dist/bundle.js`,
file extension `wc`. The local test asks for a `dev-local-<n>-editor` editor:
the bundle exposes these aliases in addition to `compteur-mots-editor` (see the
end of `src/index.ts`).

## The files

```
src/index.ts       mount(), the wiring to the host
src/compte.ts      words, characters, reading time (pure)
src/texte.ts       the format: UTF-8, BOM, line endings (pure)
src/sauvegarde.ts  autosave and rejection codes (pure)
src/etat.ts        the status bar: role="status" and role="alert"
src/dom.ts         createElement, never HTML
exemples/          a letter, notes with CRLF line endings, a file with a BOM
smoke.json         what the test harness types to test saving
```
