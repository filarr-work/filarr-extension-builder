# Pense-bête (sticky notes, `.postit`)

A board of colored notes that you move with the mouse **and** the keyboard.

## What the example shows

**The `storage` capability, for what it is made for: preferences.** The board's
zoom and the collapsed notes are kept in the extension's storage
(`host.storage`), on this device. The content (position, color and text of the
notes) goes into the file, through `saveBytes`, as for any editor.

Why this split:

- **yours, not the file's.** Two people sharing a board do not collapse each
  other's notes, and collapsing a note does not cost a version of the document;
- **allowed in read-only mode.** Zooming or collapsing does not touch the
  document: a viewer can do it, nothing is saved to the file;
- **nothing sensitive.** Only randomly drawn note identifiers and a zoom level
  are stored (`src/preferences.ts`). The storage is encrypted by Filarr, local to
  the device and erased on uninstall — but here it has nothing to protect, and
  that is intentional: **never any content in storage.**

`host.storage` only exists if the capability was declared and accepted. The code
tests for its presence (`src/memoire.ts`): without it (a local test without an
account, for example), the preferences last for the session. A storage refusal
(`storage_locked`, `quota_exceeded`…) is displayed discreetly, without getting in
the way of editing. Only one write is in flight at a time: the bridge
rate-limits requests, and the latest value is the one that goes out.

**The keyboard as much as the mouse.** Each note is a focusable group: arrow keys
to move it (Shift: faster), Enter to write, Escape to go back to the note, Delete
to remove it. Every move is announced in an `aria-live` region. With the mouse,
you grab the note by its header; the move takes the zoom into account.

And, like any editor: new (empty) document, read-only, `onDirty`, autosave at
2 s, rejection codes, total `getBytes`, `destroy` that releases everything, the
host's theme and language (see `compteur-mots` for the details of each).

## Capabilities

```json
"capabilities": { "storage": { "quota": 65536 } }
```

64 KiB is more than enough: a list of identifiers and a number (the minimum
allowed is 1 KiB, the maximum 16 MiB).

## The format

```json
{ "format": "filarr-postit", "version": 1,
  "notes": [{ "id": "n-3f9a21", "x": 40, "y": 32, "couleur": "jaune", "texte": "Lundi…" }] }
```

Written canonically (fixed key order, two-space indentation, final newline): a
file written by the extension reads back and rewrites byte for byte. Every field
read is bounded (positions, one color out of six, text of 10,000 characters, 500
notes); a file from a future version is rejected with a message, never rewritten
in the old format.

## Build and check

From this folder (the tools are installed at the repository root):

```bash
npm run build   # dist/bundle.js
npm run check   # manifest, capabilities (Filarr's validator), type checking, bundle
npm run smoke   # the editor mounted in a simulated page
npm test        # tests of the pure modules
```

## The files

```
src/index.ts        mount(), the wiring: content → saveBytes, display → storage
src/postit.ts       the format and its operations (pure)
src/preferences.ts  the display preferences (pure)
src/memoire.ts      the preferences wired to host.storage
src/vue.ts          the board, the mouse, the keyboard
src/sauvegarde.ts   autosave and rejection codes (pure)
exemples/           a week, a workshop retrospective
```
