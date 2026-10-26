# 📦 Inventaire (inventory) — no-code example

`.inventaire` files. An inventory in CSV: items, quantities, unit prices, locations; computed quantities and stock value. CSV export.

## What it shows

Shows a **semicolon-separated CSV** (comma as the decimal separator, the way a spreadsheet set to
French saves it): an editable table, quantities with − / +, and two **computed totals** — the sum of
the quantities and the stock value (`sumProduct`: quantity × price). The `fournisseur` column, which
the view does not display, is kept.

Declares the **CSV** export: “Export as CSV” in the file’s menu, in Filarr.

Not a single line of code: everything is in [`nocode.json`](nocode.json), read by Filarr’s no-code
engine (see [docs/nocode.md](../../../docs/nocode.md)). The files in [`exemples/`](exemples/) open in
the simulator.

## Building it

From the repository root:

```bash
npm install
npm run check -w @filarr-examples/inventaire   # the server’s and Filarr’s checks
npm run pack -w @filarr-examples/inventaire    # dist/inventaire-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/inventaire  # the simulator, at http://127.0.0.1:5199
```

You hand the package to Filarr by dropping it into **Marketplace › Publish**, or, with Filarr for
desktop: `npx filarr-ext publish examples/nocode/inventaire/dist/inventaire-1.0.0.filarrext`. Signing
happens in Filarr, after review.
