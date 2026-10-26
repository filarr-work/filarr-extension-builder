# ✅ Suivi d’habitudes (habit tracker) — no-code example

`.habitudes` files. One week per file, in CSV: one habit per row, one box per day. The summary computes itself.

## What it shows

Shows the **CSV** format: an **editable table** (one cell per day, written `x` or left empty), rows
you add and remove, and a section of **computed totals** (`count`, `countChecked`). A column the
configuration does not declare (here `note`) is kept; an untouched row is written back byte for
byte.

Declares `fields`: in a folder of weeks, Filarr’s table shows how many habits were kept each day,
week by week.

Not a single line of code: everything is in [`nocode.json`](nocode.json), read by Filarr’s no-code
engine (see [docs/nocode.md](../../../docs/nocode.md)). The files in [`exemples/`](exemples/) open in
the simulator.

## Building it

From the repository root:

```bash
npm install
npm run check -w @filarr-examples/suivi-habitudes   # the server’s and Filarr’s checks
npm run pack -w @filarr-examples/suivi-habitudes    # dist/suivi-habitudes-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/suivi-habitudes  # the simulator, at http://127.0.0.1:5199
```

You hand the package to Filarr by dropping it into **Marketplace › Publish**, or, with Filarr for
desktop: `npx filarr-ext publish examples/nocode/suivi-habitudes/dist/suivi-habitudes-1.0.0.filarrext`. Signing
happens in Filarr, after review.
