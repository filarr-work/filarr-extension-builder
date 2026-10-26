# 📖 Glossaire (glossary) — no-code example

`.glossaire` files. A plain-text glossary, one definition per line: “term: definition”. Add, remove and rename terms.

## What it shows

Shows the **key: value format in `entries` mode**: ALL lines form a list you edit in a table — you
rename a term, change its definition, add some, remove some. `#` comments stay in place. Declares
`extractText`: Filarr’s search finds a glossary by its definitions.

Not a single line of code: everything is in [`nocode.json`](nocode.json), read by Filarr’s no-code
engine (see [docs/nocode.md](../../../docs/nocode.md)). The files in [`exemples/`](exemples/) open in
the simulator.

## Building it

From the repository root:

```bash
npm install
npm run check -w @filarr-examples/glossaire   # the server’s and Filarr’s checks
npm run pack -w @filarr-examples/glossaire    # dist/glossaire-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/glossaire  # the simulator, at http://127.0.0.1:5199
```

You hand the package to Filarr by dropping it into **Marketplace › Publish**, or, with Filarr for
desktop: `npx filarr-ext publish examples/nocode/glossaire/dist/glossaire-1.0.0.filarrext`. Signing
happens in Filarr, after review.
