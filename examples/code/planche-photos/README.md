# Planche photos (photo sheet, `.planche`)

Lay out a sheet of photos from images you pick in Filarr: title, captions,
order, number of columns.

## What the example shows

**The `picker` capability: the extension never chooses what it sees.**
"Add photos…" calls `host.pick({ multiple: true })`. Filarr opens **its own**
picker — limited to the declared file extensions (`png`, `jpg`, `jpeg`,
`webp`) —, the user picks, and the extension receives **handles**:

```js
[{ handle: 'Zk3…', name: 'phare.jpg' }]   // never an identifier, a folder or a path
```

`host.readPicked(handle)` reads their bytes. There is no "read all images"
capability: only the picked files become accessible. Cancelling the picker
returns an empty list.

**Handles are only valid for the session.** They are drawn at random, bound to
this extension (a handle stolen by another extension is worthless there) and
forgotten when Filarr reloads. Hence the choice of format: the sheet **embeds a
reduced copy** of each image (480 px at most, as a data URL), and keeps **no**
handle. It reopens, is shared and is read elsewhere without the originals — and
never tells where they were. During the session, the "Re-read original" button
rebuilds a finer thumbnail (1,200 px) from the handle; after reopening, it no
longer appears. If a handle has expired, Filarr answers `unknown_handle` and the
extension asks for the image to be picked again.

**The type is read from the bytes, not the name** (`src/images.ts`). A ".png"
that is not one is set aside and reported by name. And a data URL read from a
`.planche` file is only accepted if its declared type is the type of its bytes
(PNG, JPEG or WebP): that is what makes it safe in a `src` (`img-src data:` is
allowed by the page's CSP). A `data:image/svg+xml` or a `javascript:` never gets
in.

**The reduction** (`src/reduction.ts`) happens in the page: `createImageBitmap`
then `<canvas>`, JPEG output on a white background. Without a usable canvas, an
image that is already small (≤ 256 KiB) is embedded as is; a large one is
refused rather than weighing the document down.

**The keyboard**: Alt+← / Alt+→ from a caption moves the photo; each photo has
its own labelled buttons (move forward, move back, remove).

## Capabilities

```json
"capabilities": { "picker": { "access": "read", "extensions": ["png", "jpg", "jpeg", "webp"] } }
```

`read` is enough: the extension never writes to the picked files (`readwrite`
would open up `host.writePicked`, which does not exist here). `picker` is
mutually exclusive with `network`: an extension that reads your images does not
talk to the Internet.

## The format

```json
{ "format": "filarr-planche", "version": 1, "titre": "…", "colonnes": 3,
  "photos": [{ "id": "p-0a1b2c", "nom": "phare.png", "legende": "…", "largeur": 96, "hauteur": 64,
               "image": "data:image/png;base64,…" }] }
```

60 photos at most, 600 KiB of data URL per photo. Canonical output: a sheet
written by the extension reads back and rewrites byte for byte.

## Build and check

```bash
npm run build && npm run check && npm run smoke && npm test
```

The test harness simulates the picker with `exemples/photos/` (`smoke.json`, key
`selection`): three real images, and a fake `.png` that must be set aside.

## The files

```
src/index.ts      mount(), the picker, the session's handles
src/planche.ts    the format (pure)
src/images.ts     type from the bytes, header dimensions, verified data URLs (pure)
src/reduction.ts  the thumbnail, via canvas, and its fallback
exemples/         a sheet of Brittany, a WebP sheet, and the photos for the simulated picker
```
