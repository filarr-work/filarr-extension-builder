# Croquis (sketch, `.croquis`)

Freehand drawing — mouse, stylus, finger or keyboard — with undo and redo.

## What the example shows

A complete editor (new (empty) document, read-only, `onDirty`, autosave at 2 s,
rejection codes, `getBytes`, `destroy`, theme, language), and above all four
**tier 1 and 2** capabilities, which give the extension **no additional access**
to your data:

| Capability | What it brings | Where |
| --- | --- | --- |
| `newDocument` | "New document › Croquis vierge" creates the file from a **seed** (the JSON of an empty sketch, in base64) rather than a 0-byte file | `filarr.extension.json`; a test checks that the seed is exactly `ecrireCroquis(croquisVide())` |
| `maxBytes` | raised to 64 MiB (the bridge's ceiling): a rich drawing exceeds an editor's ordinary ceiling (50 MiB) | `filarr.extension.json` |
| `functions.thumbnail` | the file's card shows the drawing, computed **without opening the editor** | `src/fonctions.ts`, `src/png.ts` |
| `functions.exports` | "Export as web page" (embedded SVG) and "as JSON" in the file's menu | `src/fonctions.ts` |

**The pure functions** run in a page that Filarr opens without displaying
anything, with no storage, no picker and no network, on a file that **Filarr**
chose. Hence a thumbnail produced without `<canvas>`: a small PNG encoder
(`src/png.ts`, indexed colors, stored deflate blocks), tested by reading its
bytes back with `zlib`. A thumbnail weighs 15 to 20 KiB, under the host's 96 KiB
ceiling; the host recognizes it by its header bytes.

⚠ The manifest declares `exports`, but the bundle exposes **`functions.export`**
(singular), with the target in `ctx.to`.

**The HTML export interprets nothing** from the file: the file name is escaped,
colors are validated (`#rrggbb`), paths contain only numbers.

**The keyboard draws too.** The sheet is focusable: arrow keys move the pencil
(Shift: faster, Alt: pixel by pixel), Enter puts it down then lifts it, Escape
abandons the stroke. The color is picked in a radio group (arrow keys), the
thickness from a list. Ctrl+Z undoes, Ctrl+Shift+Z or Ctrl+Y redoes — the
history lives in memory, it is not written to the file.

## Capabilities

```json
"capabilities": {
  "newDocument": [{ "ext": "croquis", "label": "Croquis vierge", "seed": "eyJmb3JtYXQi…" }],
  "maxBytes": 67108864,
  "functions": {
    "thumbnail": true,
    "exports": [{ "to": "html", "label": "Page web (dessin SVG)" }, { "to": "json", "label": "Traits en JSON" }]
  }
}
```

## The format

```
{"format":"filarr-croquis","version":1,"largeur":1200,"hauteur":800,"fond":"#ffffff","traits":[
{"couleur":"#1f2937","epaisseur":4,"points":[120.5,80,131,92.5]}
]}
```

One stroke per line (so drawings can be diffed stroke by stroke), flat point
lists rounded to one decimal place. Canonical output: a file written by the
extension reads back and rewrites byte for byte. Everything read is bounded
(colors, thicknesses 1 to 64, 20,000 strokes of 20,000 points).

## Build and check

```bash
npm run build && npm run check && npm run smoke && npm test
```

The test harness (`npm run smoke`) also calls the pure functions on each sample
file and checks what the host would check: PNG signature, 96 KiB, valid JSON,
complete HTML page.

## The files

```
src/index.ts       mount(), the history wired to autosave
src/croquis.ts     the format (pure)
src/historique.ts  undo, redo (pure)
src/fonctions.ts   thumbnail and exports — the pure functions
src/png.ts         the PNG encoder and the pixel canvas (pure)
src/vue.ts         the SVG sheet, the pointer, the keyboard
exemples/          a house, a spiral
```
