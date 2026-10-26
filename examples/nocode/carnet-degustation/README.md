# 🍷 Carnet de dégustation (tasting notebook) — no-code example

`.degust` files. One entry per tasting — wine, tea, coffee, cheese: star rating, aromas as tags, date, place and comment.

## What it shows

`.degust` files, not `.degustation`: a file extension is at most 10 characters
(`^[a-z0-9]{1,10}$`, a server limit), and `filarr-ext check` rejects the long version.

Shows a short, dense record: badges (colored type and **date**), a **star rating**, aroma **tags**
(Enter or comma to add, × to remove), a small form and a comment. The `infusions` field in the second
sample, which the view ignores, is kept.

Declares `fields` (rating, date, type): a folder of tastings becomes a sortable table in Filarr.

Not a single line of code: everything is in [`nocode.json`](nocode.json), read by Filarr’s no-code
engine (see [docs/nocode.md](../../../docs/nocode.md)). The files in [`exemples/`](exemples/) open in
the simulator.

## Building it

From the repository root:

```bash
npm install
npm run check -w @filarr-examples/carnet-degustation   # the server’s and Filarr’s checks
npm run pack -w @filarr-examples/carnet-degustation    # dist/carnet-degustation-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/carnet-degustation  # the simulator, at http://127.0.0.1:5199
```

You hand the package to Filarr by dropping it into **Marketplace › Publish**, or, with Filarr for
desktop: `npx filarr-ext publish examples/nocode/carnet-degustation/dist/carnet-degustation-1.0.0.filarrext`. Signing
happens in Filarr, after review.
