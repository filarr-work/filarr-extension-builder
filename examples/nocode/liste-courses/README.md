# 🛒 Liste de courses (shopping list) — no-code example

`.courses` files. A plain-text checklist, one line per item: “[ ] lait”, “[x] pain”. Headings and notes are kept.

## What it shows

Shows the **lines** format: each `[ ] …` or `[x] …` line is an item (a leading `-` or `*` bullet is
allowed and written back). The list can be checked off, extended (Enter in the add field) and
reordered; the progress bar follows. Headings, notes and blank lines stay in place: the file
remains pleasant to read in a text editor.

Not a single line of code: everything is in [`nocode.json`](nocode.json), read by Filarr’s no-code
engine (see [docs/nocode.md](../../../docs/nocode.md)). The files in [`exemples/`](exemples/) open in
the simulator.

## Building it

From the repository root:

```bash
npm install
npm run check -w @filarr-examples/liste-courses   # the server’s and Filarr’s checks
npm run pack -w @filarr-examples/liste-courses    # dist/liste-courses-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/liste-courses  # the simulator, at http://127.0.0.1:5199
```

You hand the package to Filarr by dropping it into **Marketplace › Publish**, or, with Filarr for
desktop: `npx filarr-ext publish examples/nocode/liste-courses/dist/liste-courses-1.0.0.filarrext`. Signing
happens in Filarr, after review.
