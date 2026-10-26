# 🍲 Carnet de recettes (recipe book) — no-code example

`.recette` files. Your recipes as cards: category, servings, time, ingredients to tick off while shopping, numbered steps and notes.

## What it shows

Shows a complete **JSON** record: a title, badges (colored category, servings and time with − / +),
a shopping progress bar, an ingredient **checklist** (add, remove, reorder), **numbered steps** and
free-form notes. Keys the view does not display (here `source`) are kept as they are on save.

It also declares two **pure functions**: `extractText` (Filarr’s local search finds a recipe by its
ingredients) and `fields` (servings, time, category — the columns of Filarr’s folder table).

Not a single line of code: everything is in [`nocode.json`](nocode.json), read by Filarr’s no-code
engine (see [docs/nocode.md](../../../docs/nocode.md)). The files in [`exemples/`](exemples/) open in
the simulator.

## Building it

From the repository root:

```bash
npm install
npm run check -w @filarr-examples/carnet-recettes   # the server’s and Filarr’s checks
npm run pack -w @filarr-examples/carnet-recettes    # dist/carnet-recettes-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/carnet-recettes  # the simulator, at http://127.0.0.1:5199
```

You hand the package to Filarr by dropping it into **Marketplace › Publish**, or, with Filarr for
desktop: `npx filarr-ext publish examples/nocode/carnet-recettes/dist/carnet-recettes-1.0.0.filarrext`. Signing
happens in Filarr, after review.
