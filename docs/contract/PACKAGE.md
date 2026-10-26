# The `.filarrext` package and how it reaches Filarr

> **Contract frozen on 2026-10-23.** Producers: Filarr Builder, `filarr-ext pack`
> ([this repository](../../), `filarr-extension-builder`). Consumer: Filarr, the
> Marketplace › Publish screen. Any change goes through a new `format` number, never
> through an edit of this one.

A package gathers everything needed to publish a version: the bundle, the **unsigned**
manifest, the listing page and the screenshots. It contains **no** key, no signature, no
token: signing happens in Filarr, on the device, after a complete review. The Builder
never sees the key.

## 1. The container

A ZIP archive (_store_ or _deflate_ methods), readable by `fflate`.

| Bound                   | Value                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Archive size            | 8 MiB at most                                                                                                             |
| Entries                 | 16 at most, no empty folder                                                                                               |
| Entry name              | `^[a-z0-9][a-z0-9._-]{0,63}(/[a-z0-9][a-z0-9._-]{0,63})?$` — one folder level at most, never `..`, never an absolute path |
| Total uncompressed size | 12 MiB at most (a decompression bomb is refused)                                                                          |

An unknown entry is **refused** (the whole package), not ignored: what is not reviewed
must not be able to travel.

## 2. The entries

| Entry                                       | Required                   | Content                                                                                                                                          |
| ------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `filarr-package.json`                       | yes                        | The package description (§3), UTF-8, 64 KiB at most                                                                                              |
| `bundle.js`                                 | yes                        | The IIFE bundle, 1 byte to 4 MiB                                                                                                                 |
| `nocode.json`                               | if `build.kind = "nocode"` | The no-code engine configuration, 256 KiB at most                                                                                                |
| `screenshots/1.webp` … `screenshots/4.webp` | no                         | PNG or WebP screenshots (identified by their bytes; JPEG is refused, since the manifest does not accept it as a preview), 96 KiB each, 4 at most |

## 3. `filarr-package.json`

```json
{
  "format": 1,
  "manifest": {
    "id": "carnet-recettes",
    "name": "Carnet de recettes",
    "version": "1.2.0",
    "description": "Vos recettes en fiches : portions, ingrédients à cocher, étapes.",
    "extensions": ["recette"],
    "icon": "🍲",
    "category": "productivity",
    "author": "Camille R.",
    "capabilities": { "functions": { "extractText": true } }
  },
  "listing": {
    "releaseNotes": "Champ « temps » en minutes.",
    "sourceUrl": "https://github.com/exemple/carnet-recettes",
    "license": "MIT"
  },
  "screenshots": ["screenshots/1.webp"],
  "build": { "kind": "nocode", "tool": "filarr-ext 1.0.0", "engine": "1.0.0" }
}
```

- An extension's icon is the `manifest.icon` emoji (1 to 8 code points,
  [PUBLISHING.md](PUBLISHING.md)): format 1 carries NO icon image, and an `icon.*` entry
  is refused like any other unknown entry.
- `manifest` carries **exactly** the fields the author decides, within the bounds of
  [PUBLISHING.md](PUBLISHING.md) §2 and [CAPABILITIES.md](CAPABILITIES.md). It **never**
  carries `bundleHash`, `publisherFingerprint`, `trust` or `previews`: Filarr computes
  them (bundle hash, account key, `"sandboxed"`, screenshots as data URLs) and refuses a
  package that contains them.
- `listing`: `releaseNotes` ≤ 2000 characters, `sourceUrl` `https://` ≤ 300,
  `license` ≤ 40. Everything is optional, plain text. Filarr copies them into the
  version's SIGNED manifest (optional fields `releaseNotes`, `sourceUrl`, `license`,
  validated by the worker): the server cannot rewrite them after the fact.
- `screenshots`: the entry names, in display order.
- `build`: `kind` is `"code"` or `"nocode"`, `tool` ≤ 60 characters, `engine` (semver)
  for no-code only. **Declarative**: Filarr shows it as "declared by the tool"; it proves
  nothing.

## 4. The no-code bundle

A no-code bundle is the engine, identical for every no-code extension, followed by its
configuration. Its **last two lines** are exactly:

```js
/* filarr-nocode engine=1.0.0 */
globalThis.__filarrNocodeBoot({ …the configuration as JSON… });
```

Filarr reads the configuration between `__filarrNocodeBoot(` and the final `);` with
`JSON.parse`, **without ever evaluating it**, in order to show it during the review and
compare it with the previous version's (downloaded and verified as for any update). It
must be identical to `nocode.json`. Any mismatch refuses the package.

## 5. Handing the package to Filarr

Three paths, and all of them lead to the **same complete review** before any signature.
None of them signs, none skips a step: the handoff fills in the wizard, nothing more.

1. **Drop the file** into Marketplace › Publish (desktop and web).
2. **Desktop**: `filarr://publish?file=<absolute path, encoded>`. Filarr only accepts a
   path that ends in `.filarrext`, pointing to a regular file of 8 MiB at most; it reads
   it once and opens Publish. This is what `filarr-ext publish` does.
3. **Web**: the Builder opens `https://app.filarr.com/?filarr-publish=builder` in a new
   window. Once ready, Filarr sends `{ type: "filarr-publish-ready", version: 1 }` to
   `window.opener`, with the Builder's origin as `targetOrigin`. The Builder replies with
   `{ type: "filarr-publish-package", version: 1, bytes: ArrayBuffer }`. Filarr accepts
   this message only from an origin on its list (`https://builder.filarr.com`, and
   `http://localhost:5173` in a development build only), once, within 60 s.

The review screen states where the package came from ("Package received from
builder.filarr.com", "Package opened from the file …") and offers **Abandon** first. The
"I have reviewed everything." checkbox is required before "Sign and publish".
