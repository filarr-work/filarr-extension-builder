# 📇 Fiche contact (contact card) — no-code example

`.contact` files. One card per person, in plain “key: value” text: name, email, website, phone, address, birthday and tags.

## What it shows

Shows the **key: value** format (one value per line, readable and editable anywhere): a title,
**safe links** (`mailto:` and `https:` only — never `javascript:`), a form of fields, a date and
tags. Lines the configuration does not know (here `rencontre`) and `#` comments stay in place, word
for word; a modified line keeps its original prefix.

Declares `extractText`: Filarr’s search finds a contact by their company or tags.

Not a single line of code: everything is in [`nocode.json`](nocode.json), read by Filarr’s no-code
engine (see [docs/nocode.md](../../../docs/nocode.md)). The files in [`exemples/`](exemples/) open in
the simulator.

## Building it

From the repository root:

```bash
npm install
npm run check -w @filarr-examples/fiche-contact   # the server’s and Filarr’s checks
npm run pack -w @filarr-examples/fiche-contact    # dist/fiche-contact-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/fiche-contact  # the simulator, at http://127.0.0.1:5199
```

You hand the package to Filarr by dropping it into **Marketplace › Publish**, or, with Filarr for
desktop: `npx filarr-ext publish examples/nocode/fiche-contact/dist/fiche-contact-1.0.0.filarrext`. Signing
happens in Filarr, after review.
