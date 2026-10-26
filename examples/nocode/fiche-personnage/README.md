# 🧙 Fiche de personnage (character sheet) — no-code example

`.perso` files. A role-playing game character sheet: class, level, hit points, ability scores as bars, traits, inventory and backstory.

## What it shows

Shows **nested fields** (`caracteristiques.force`…), each as a **number** with − / + and as a
**bar** out of 20, a health bar whose maximum is another field (`maxField`), tags, an inventory
table with its total, and the **`newDocument`** capability: Filarr offers “Nouveau personnage”
(New character) and creates the file from a **starter template** (`modeles/nouveau.perso`, base64-encoded
in `manifest.capabilities.newDocument[0].seed` — `npx filarr-ext seed modeles/nouveau.perso`
recomputes it; `check` verifies that it opens with the configuration).

Not a single line of code: everything is in [`nocode.json`](nocode.json), read by Filarr’s no-code
engine (see [docs/nocode.md](../../../docs/nocode.md)). The files in [`exemples/`](exemples/) open in
the simulator.

## Building it

From the repository root:

```bash
npm install
npm run check -w @filarr-examples/fiche-personnage   # the server’s and Filarr’s checks
npm run pack -w @filarr-examples/fiche-personnage    # dist/fiche-personnage-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/fiche-personnage  # the simulator, at http://127.0.0.1:5199
```

You hand the package to Filarr by dropping it into **Marketplace › Publish**, or, with Filarr for
desktop: `npx filarr-ext publish examples/nocode/fiche-personnage/dist/fiche-personnage-1.0.0.filarrext`. Signing
happens in Filarr, after review.
