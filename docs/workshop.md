# Filarr Builder, the in-browser workshop

Filarr Builder (`apps/builder`) composes a Filarr extension without installing anything:
no-code, with the mouse, or with code, in an editor. It builds the bundle,
runs the `filarr-ext check` checks, produces the `.filarrext` package and hands it
to Filarr. It never signs: signing happens in Filarr, on your device.

The workshop is not online yet. To run it from a clone of this repository:

```bash
npm install
npm run dev -w @filarr/builder        # http://localhost:5173
npm run build -w @filarr/builder      # apps/builder/dist, with _headers and the CSP
```

Port 5173 is the one a development build of Filarr accepts for receiving a package.

## What the workshop never does

- It never asks for a password, a token or a Filarr key.
- It calls no server: not Filarr's API, no telemetry, no CDN. The fonts and
  the compiler (esbuild-wasm) are bundled.
- Your code only runs in a `sandbox="allow-scripts"` iframe, on Filarr's sandbox
  page (the same one, byte for byte, served with its headers).
- The workshop itself runs under a CSP without `unsafe-eval`: only `wasm-unsafe-eval`, for
  esbuild. The bundle's syntax is checked there by a parser (acorn), not by
  `new Function`.
- Projects stay in this browser (IndexedDB) until you export them.

## New extension

No-code or with code, the name, the identifier (derived from the name, permanent once
published), the file types it opens, then a starting template: the one from
`create-filarr-extension`, a blank template, or one of the twenty examples in the repository. An
exported `.zip` project can be imported here, with the same layout as
`create-filarr-extension`.

![New extension: no-code or with code, starting templates and examples from the repository](assets/screenshots/01-nouvelle-extension.webp)

## No-code

Five steps: **Data**, **View and style**, **Try**, **Listing**, **Publish**.

**Data**: the format (JSON, CSV/TSV, line by line, `key: value`) and its options.
Load a sample file: the workshop guesses the fields, and you correct the type, the
label, the default value and the sub-fields. Whatever is not displayed is written back as
it is.

![Data: a sample loaded, the fields guessed and correctable](assets/screenshots/02-donnees.webp)

**View and style**: the engine's sixteen blocks, composed by click or drag and drop (from the
keyboard too), with their real options and an accent color. The preview is the real
engine, in the sandbox page, in light or dark mode. **See the generated code** shows the
configuration, and **Switch to code** turns a no-code project into a project with code.

![View and style: the composition on the left, the real engine's preview in the center](assets/screenshots/03-vue-et-style.webp)

![The same step in dark theme](assets/screenshots/07-vue-sombre.webp)

**Try**: Filarr's simulator, with the theme, read-only mode, a simulated conflict and
the log of exchanges with the host. It reloads on every build.

![Try: the configuration and the simulator](assets/screenshots/04-essai.webp)

## With code

Four steps: **Template**, **Listing**, **Code and try**, **Publish**. The file
tree, tabs and CodeMirror; the build runs in the browser
(esbuild-wasm, including the `?worker` convention). The **Pre-publication checks** are
those of `filarr-ext check`, and the simulator also calls the pure functions
(`extractText`, `thumbnail`, `fields`) in a page with no API.

![Code and try: Traces GPX built in the browser, mounted in the simulator, checks at the bottom](assets/screenshots/08-essai-code-sombre.webp)

The workshop stays usable at 390 px wide and from the keyboard.

![Try at a narrow width](assets/screenshots/09-essai-etroit.webp)

## The listing

Icon (an emoji: the package does not carry an icon image), name, category, published
name, description, up to four screenshots (PNG or WebP, JPEG refused, re-encoded as
WebP of 96 KiB at most), version, release notes, `https://` link to the source code,
license. On the right, the catalog card and the top of the listing as people
will see them.

![The listing: what will be signed with the extension and become public](assets/screenshots/05-fiche.webp)

## Publish

Build, check (including a real mount in the sandbox page), package, then
hand the package to Filarr:

- **Open in Filarr**: Filarr opens in a new tab, on Publish, and receives the
  package from this workshop only ([PACKAGE.md](contract/PACKAGE.md) §5);
- **Download the package**, to drop into Marketplace → Publish;
- `npx @filarr/extension-cli publish <package>` from the terminal, for the desktop app
  (in an installed project, `npx filarr-ext publish` is enough).

In Filarr, you review everything that will become public, then Filarr signs on your
device.

![Publish: the steps, the three ways to hand over the package, what will become public](assets/screenshots/06-publier.webp)

## What stays outside the workshop

- Preact, Svelte and Lit: nothing is downloaded; only `@filarr/extension-api`,
  `@filarr/nocode-engine` and `yjs` are bundled.
- The `network` capability: the simulator has no relay; it points you to
  `filarr-ext dev`.
- The check messages are in French, even in the English interface: they come from the packages.

## Tests

```bash
npm test -w @filarr/builder           # vitest: bundles and packages identical to filarr-ext
npm run test:e2e -w @filarr/builder   # Chromium, against the built site and its CSP
```

If Windows reserves the default port range (listening refused with `EACCES`),
`BUILDER_E2E_PORT` and `BUILDER_E2E_FAKE_PORT` select other ports.
