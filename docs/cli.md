# `filarr-ext` — the command-line tool

`filarr-ext` (package `@filarr/extension-cli`) builds, simulates, checks, packages and hands over an
extension to Filarr, **with or without code**. It talks to no service: it asks for no password, no
key, no token. Signing happens in Filarr, on your device, after a full review of the package.

The tool's messages are currently in French.

```bash
npm create filarr-extension@latest my-extension   # a ready-made project (see below)
cd my-extension && npm install
npx filarr-ext dev        # the local simulator
npx filarr-ext check      # the server's and Filarr's checks
npx filarr-ext pack       # dist/<id>-<version>.filarrext
npx filarr-ext publish dist/<id>-<version>.filarrext
```

`npx filarr-ext` runs the `filarr-ext` binary that `npm install` puts in the project, so run
`npm install` first. No npm package is named `filarr-ext`: outside a project, use
`npx @filarr/extension-cli <command>`.

| Command                | What it does                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `dev`                  | The local simulator, rebuilt and reloaded on every change to the project            |
| `build`                | `dist/bundle.js`                                                                    |
| `check`                | All checks, output ✓ / ! / ✗                                                        |
| `pack`                 | The `.filarrext` package (format 1 of [`PACKAGE.md`](contract/PACKAGE.md)), read back before it is written |
| `verify <package>`     | Reads back and checks a package, without executing anything                         |
| `publish <package>`    | Opens Filarr Desktop on the Publish screen (`filarr://publish?file=…`)              |
| `seed <file>`          | The base64 of a starter template (`capabilities.newDocument[].seed`)                |

Common options: `-C, --dir <dir>` (the project; default: the current directory), `--json`
(`check`, `verify`, `pack`: the same output as JSON), `-h, --help`, `-v, --version`.

**Exit codes**: `0` success (warnings are allowed), `1` at least one check error, `2` malformed
command.

---

## The project file: `filarr.extension.json`

```json
{
  "manifest": {
    "id": "carnet-recettes",
    "name": "Carnet de recettes",
    "version": "1.2.0",
    "description": "Vos recettes en fiches.",
    "extensions": ["recette"],
    "icon": "🍲",
    "category": "productivity",
    "author": "Camille R.",
    "capabilities": { "functions": { "extractText": true } }
  },
  "listing": { "releaseNotes": "Champ « temps » en minutes.", "sourceUrl": "https://…", "license": "MIT" },
  "screenshots": ["captures/1.webp", "captures/2.png"],
  "build": { "kind": "nocode", "config": "nocode.json" },
  "samples": "exemples"
}
```

| Field         | Required    | Content                                                                                         |
| ------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `manifest`    | yes         | The **unsigned** manifest, exactly as it will go into the package (see `check`)                 |
| `listing`     | no          | The listing: `releaseNotes` (≤ 2000), `sourceUrl` (`https://`, ≤ 300), `license` (≤ 40)         |
| `screenshots` | no          | 0 to 4 PNG or WebP screenshots, 96 KiB each — paths **relative to the project**                 |
| `build`       | yes         | `{ "kind": "code", "entry": "src/index.ts" }` or `{ "kind": "nocode", "config": "nocode.json" }` |
| `samples`     | no          | The folder of the simulator's sample files (default: `exemples`)                                |
| `format`      | no          | `1`                                                                                             |

Every path stays **inside** the project: an absolute path, or one that climbs up (`../`), is
rejected. An unknown key is rejected.

**The icon** of an extension is the emoji `manifest.icon` (1 to 8 code points). The package carries
**no** icon image: an `icon.png` entry would be rejected by Filarr.

---

## `filarr-ext build`

Writes `dist/bundle.js`.

- **With code**: esbuild, `--format=iife`, target `es2020`, browser, minified (`--no-minify` to
  read the output), ASCII output, no comments and no source map. The sandbox page executes the
  bundle as a **function body** (`new Function('globalThis', code)`): a top-level
  `import`/`export` would be a syntax error there; the IIFE rules it out by construction. All
  dependencies are bundled (the page has no network).
- **Workers**: `import source from './calcul.worker.ts?worker'` builds that file **separately**, as
  an IIFE, and imports it as **text**. Make a `Blob` from it, then a `Worker` from its `blob:` URL —
  the only source the page's CSP allows (`worker-src blob:`); the worker inherits that CSP, and so
  has no network. (Same convention as the code examples in this repository.)
- **No-code**: the no-code engine, then the two final lines of the contract:

  ```js
  /* filarr-nocode engine=1.0.0 */
  globalThis.__filarrNocodeBoot({…});
  ```

  The configuration is validated first (see [nocode.md](nocode.md)); its JSON fits on one line, in
  ASCII, and nothing follows `);`.

```text
$ npx filarr-ext build
✓ dist/bundle.js — 79,1 Kio (moteur sans code 1.0.0)
```

## `filarr-ext check`

Builds the project, then replays the checks **of the server** (the worker's `validateManifest`,
[PUBLISHING.md](contract/PUBLISHING.md)) and **of Filarr** (capability validator, package reading,
sandbox page).

| Check | Error (✗) if… | Warning (!) if… |
| --- | --- | --- |
| Project file | unreadable, unknown key, path that leaves the project | — |
| `id` | outside `^[a-z][a-z0-9-]{1,63}$` | — |
| `version` | outside `^\d+\.\d+\.\d+$` (no `v`, no suffix) | — |
| `name` | empty or more than 100 characters (UTF-16 units, like the server) | — |
| `description` | missing or more than 2000 characters | empty |
| `extensions` | 0 or more than 10, or outside `^[a-z0-9]{1,10}$` | a duplicate file extension |
| `icon` | not an emoji of 1 to 8 code points | missing |
| `category` | not one of `editors`, `productivity`, `data`, `media`, `fun`, `other` | — |
| `author` | more than 80 code points, invisible or directional character | — |
| Computed fields | `bundleHash`, `publisherFingerprint`, `trust`, `previews` present (Filarr computes them) | — |
| Unknown manifest field | always | — |
| `capabilities` | rejected by Filarr's validator (**vendored** copy, identical): unknown key, limit, network exclusion… | — |
| Listing (`listing`) | out of bounds, unknown key | no license |
| Screenshots | more than 4, missing, neither PNG nor WebP (read from the bytes), JPEG (Filarr keeps only PNG and WebP as previews), more than 96 KiB | no screenshot |
| Signed manifest | more than 640 KiB once the screenshots are added as data URLs | — |
| Build | esbuild error, no-code configuration rejected (with its path: `view[2].field`) | esbuild warning |
| Bundle size | empty or more than 4 MiB | more than 1 MiB |
| Bundle shape | does not compile as a function body (ESM, `import`/`export`); does not set `filarrSandboxedPlugin` | — |
| Entry points | no `<id>-editor` editor; a declared function missing from `plugin.functions`; `noteBlock` / `homeWidget` without `plugin.block` / `plugin.widget` | an editor the host will never ask for; an undeclared function or block |
| No-code | `nocode.json` ≠ manifest (identifier, columns, types, exports); capability the engine does not need; unreadable starter template; bundle read back ≠ `nocode.json` | a function offered but not declared |
| APIs closed by the page | — | `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `localStorage`, `indexedDB`, `eval`, `new Function`, `innerHTML`, `import()`, embedded source map |

Entry points are read by **dry-running the bundle** in a `vm` context with no DOM and no network:
it is your own code, built a moment ago. If your bundle touches the DOM as soon as it loads, the run
fails and `check` falls back on reading the text (warning). `verify`, for its part, never executes
anything.

```text
$ npx filarr-ext check
filarr-ext check — carnet-recettes 1.0.0
  ✓ filarr.extension.json lu (sans code)
  ✓ manifeste : carnet-recettes 1.0.0, .recette, capacités functions
  ✓ fiche : notes, sources et licence conformes
  ! aucune capture : la fiche n’aura rien à montrer [screenshots]
  ✓ manifeste signé estimé à 1,2 Kio (≤ 640 Kio)
  ✓ configuration sans code valide, moteur 1.0.0
  ✓ taille du bundle : 79,7 Kio (≤ 4 Mio)
  ✓ se compile comme corps de fonction : IIFE, sans import ni export au niveau haut
  ✓ nocode.json et le manifeste disent la même chose
  ✓ relu comme Filarr le relira : deux lignes finales, JSON identique à nocode.json
  ✓ éditeur « carnet-recettes-editor » posé
10 réussi(s), 1 avertissement(s), 0 erreur(s)
```

## `filarr-ext pack`

Runs `check`, then assembles the package defined by [`PACKAGE.md`](contract/PACKAGE.md) (format 1):

| Entry                                       | Content                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `filarr-package.json`                       | `{ format: 1, manifest, listing?, screenshots?, build: { kind, tool, engine? } }` |
| `bundle.js`                                 | The bundle                                                              |
| `nocode.json`                               | No-code: **exactly** the JSON of the bundle's last line                 |
| `screenshots/1.webp` … `screenshots/4.webp` | The screenshots, in order (the type is read from the bytes, not from the name) |

`build.tool` is `filarr-ext <version>`; `build.engine`, the no-code engine version. The package's
`build` carries only `kind`, `tool` and `engine`: neither the project file's `entry` nor its
`config`, nor its `format`. Nothing else goes into the archive: no key, no signature, no token, no
icon image, no folder. `pack` writes only the package (not `dist/bundle.js`).
The archive is reproducible (fixed dates): two `pack` runs on the same project give the same bytes.

**`pack` rejects what Filarr would reject.** The assembled package is read back through the same
path as `verify` before it is written; at the slightest error, nothing reaches the disk.

```text
$ npx filarr-ext pack
…
  ✓ paquet écrit : dist/carnet-recettes-1.0.0.filarrext (27,4 Kio)
```

Option: `--out <path.filarrext>`.

## `filarr-ext verify <package>`

Reads a package back as Filarr will, **without executing anything** (the bundle is compiled, never
called):

1. the archive: 8 MiB at most; the central directory is read **before** any decompression — 16
   entries at most, names `^[a-z0-9][a-z0-9._-]{0,63}(/[a-z0-9][a-z0-9._-]{0,63})?$` (one folder
   level, never `..`), no folder entry, no unknown entry, no duplicate, *store* or *deflate*
   methods, 12 MiB of declared uncompressed size at most;
2. decompression **as a stream**, cut off as soon as an entry exceeds its limit (64 KiB, 4 MiB,
   256 KiB, 96 KiB) or the total exceeds 12 MiB — a declared size can lie, a zip bomb does not get
   through; the local headers must say the same thing as the central directory;
3. `filarr-package.json`: UTF-8, JSON with no forbidden key, format 1, manifest, listing,
   screenshots, `build`;
4. the declared screenshots (present, type and size) and no undeclared screenshot;
5. the bundle (size, function body, global, closed APIs); no-code: `nocode.json` identical to the
   bundle's configuration, configuration accepted by the engine, agreement with the manifest,
   declared engine = the bundle's engine (and a warning if it differs from the one `filarr-ext`
   produces for this version).

```bash
npx filarr-ext verify dist/carnet-recettes-1.0.0.filarrext
npx filarr-ext verify paquet.filarrext --json
npx @filarr/extension-cli verify paquet.filarrext   # outside a project
```

## `filarr-ext publish <package>`

For **Filarr Desktop**: checks the package (the same refusals as Filarr — a path ending in
`.filarrext`, a regular file of 8 MiB at most, then `verify`), then opens:

```text
filarr://publish?file=<absolute path, encoded with encodeURIComponent>
```

Filarr reads the file once, opens **Marketplace › Publish**, shows the whole package (“Package
handed over by the filarr-ext command”), offers **Abandon** first, and signs only after “I have
reviewed everything.” `--print` prints the URL without opening it. Without Filarr Desktop: drop the
file into Publish (desktop or web).

```text
$ npx filarr-ext publish dist/carnet-recettes-1.0.0.filarrext --print
…
Remise à Filarr pour bureau : filarr://publish?file=C%3A%5CUsers%5C…%5Ccarnet-recettes-1.0.0.filarrext
```

## `filarr-ext dev`

The local simulator (`@filarr/extension-devhost`), on `http://127.0.0.1:5199` (`--port`,
`--no-open`). It serves **Filarr's sandbox page**, copied verbatim and served with the same CSP,
and a **host** that replays protocol v2 with **Filarr's bridge**, also copied verbatim.

- **File**: one of the files in `exemples/`, or a new (empty) document of 0 bytes.
- **Modes**: editor; note block and home widget if the manifest declares them; a “Fonctions”
  (Functions) tab calls `extractText`, `thumbnail`, `fields` and each export on the current
  document, in a page with no API, and passes the value through `readCallValue` like Filarr.
- **Controls**: light / dark (the theme is pushed to the page, as when Filarr changes theme),
  English, read-only, **“Simuler un conflit”** (simulate a conflict: `saveBytes` rejects
  `item_version_conflict`), **“Co-édition”** (co-editing: two pages linked like a room — updates as
  bytes, seeding by the first page, “Changer d’élu” (switch the elected peer)), **“Enregistrer
  (getBytes)”** (Save: the button of Filarr's window, which deliberately overwrites a conflict).
- **Services**: in-memory storage (quota and 256 keys, like Filarr), a picker over the sample files
  (opaque handles), network: each request is shown (“Envoyer” / “Refuser” / “Bloquer”: send /
  refuse / block) then sent **by the development server** to the `network.domains` domains only,
  with the desktop relay's guards (HTTPS, exact host, no IP and no port, public addresses,
  same-origin redirects, 8 s, 1 MiB); secrets are entered in the “Construction” (Build) tab.
- **Log** (the “Journal” tab): each host ↔ page message, summarized (type, fields, byte size).
- Every change to the project (source, `nocode.json`, `filarr.extension.json`, samples) rebuilds the
  extension and reloads the pages, keeping the document.

The server listens only on `127.0.0.1`, rejects a foreign `Host`, and its network relay requires the
page's token and its origin.

> The simulator is not Filarr: no encryption, no vault, no versions. What it guarantees is the page,
> the protocol and the refusals. Also test in Filarr (“Test without publishing”), then publish.

## `filarr-ext seed <file>`

Prints the base64 of a file of 64 KiB at most, to paste into
`manifest.capabilities.newDocument[].seed`. `check` then verifies that this template opens
(no-code) and that the offer is valid (file extension among `extensions`, 1 to 4 offers).

```bash
npx filarr-ext seed modeles/nouveau.perso
```

---

## `npm create filarr-extension`

```bash
npm create filarr-extension@latest my-extension
npm create filarr-extension@latest my-extension -- --yes --template nocode
npm create filarr-extension@latest notes -- --yes --template texte --lang js --ext note
```

Questions (or options, with `--yes`): the display name (`--name`), the file type (`--ext`, without
the dot), the template (`--template texte | json | binaire | nocode`), the language
(`--lang ts | js`). The created project contains `filarr.extension.json`, `src/index.ts` (or `.js`,
with `defineExtension`) or `nocode.json`, `exemples/`, a `package.json` with `dev`, `build`,
`check`, `pack`, and a `README.md`. It passes `filarr-ext check` as is. An existing, non-empty
folder is rejected.

Then `cd` into the project and run `npm install` before any `npx filarr-ext …` command.

## In the Builder repository

```bash
npm install
npm test                                       # all packages
npm run check -w @filarr-examples/inventaire   # one example
npm run sync -w @filarr/extension-api          # copy Filarr's files (../filarg)
npm run sync -w @filarr/extension-devhost
```

The vendored copies (the capability validator, the sandbox page, the protocol and the bridge) record
the source they copy; their test fails if they drift from their fingerprint (`vendor.json`), and,
when `../filarg` is present (or `FILARG_DIR`), if they drift from Filarr.
