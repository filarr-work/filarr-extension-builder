# 📚 Journal de lecture (reading log) — no-code example

`.lecture` files. The year’s books as cards: author, status (to read, reading, read), star rating, dates and review.

## What it shows

Shows a **list of objects as cards**: each book is a card with its title, its badges (colored status,
author), its **star rating** (clicking the star already set clears it), its date and its review.
Cards can be added, removed and reordered; two totals are recomputed (number of books, average
rating). An unknown field in a card (here `pretePar`) is kept.

Not a single line of code: everything is in [`nocode.json`](nocode.json), read by Filarr’s no-code
engine (see [docs/nocode.md](../../../docs/nocode.md)). The files in [`exemples/`](exemples/) open in
the simulator.

## Building it

From the repository root:

```bash
npm install
npm run check -w @filarr-examples/journal-lecture   # the server’s and Filarr’s checks
npm run pack -w @filarr-examples/journal-lecture    # dist/journal-lecture-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/journal-lecture  # the simulator, at http://127.0.0.1:5199
```

You hand the package to Filarr by dropping it into **Marketplace › Publish**, or, with Filarr for
desktop: `npx filarr-ext publish examples/nocode/journal-lecture/dist/journal-lecture-1.0.0.filarrext`. Signing
happens in Filarr, after review.
