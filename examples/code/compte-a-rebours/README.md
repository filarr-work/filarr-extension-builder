# Compte à rebours (countdown, `.rebours` and note block)

A list of dated events, each with its own countdown ticking every second — and a
**block to drop into a note**, which shows the time left before a chosen
moment.

## What the example shows

**One bundle, two entry points.** `editors` mounts the editor for `.rebours`
files (`src/editeur.ts`); `block` mounts the note block (`src/bloc.ts`). The
host picks which one (`host.mode` is `'editor'` or `'block'`), and each one
receives **its own** bytes: the open file, or the block's data.

**The `noteBlock` capability: data as bytes, through `saveBytes`.** The block
sees nothing of the note that hosts it — only its own data
(`host.initialBytes`, here `{ "v": 1, "titre": "…", "date": "…" }`). Changing
them calls `host.saveBytes(…)`, which writes them back into the block's node; the
note is what stores them (as base64 in its HTML), encrypts them and syncs them,
like the rest of its content. They must fit in **256 KiB** once decoded. The
same rules as for an editor apply:

- 0 bytes = new (empty) block: the form opens so it can be set up;
- read-only (note not editable, vault viewer): display only;
- saving debounced at 2 s, rejection codes displayed (`read_only`, `too_large`…);
- unreadable data is **not** overwritten automatically: the block says so, and
  only replaces it if the user sets the block up;
- `destroy()` stops the clock and releases everything.

Without the extension, the note keeps the block intact and shows an "extension
not installed" frame: a block is never emptied just because it cannot be
displayed.

> ⚠ State of Filarr as of October 23, 2026: the `filarrExtensionBlock` node exists,
> but inserting an extension block is still **closed** on desktop
> (`EXTENSION_BLOCK_INSERTION_OPEN = false`), until the mobile app can preserve
> this node. The block mounts and is tested here (`npm run smoke`); it cannot yet
> be inserted from a Filarr menu.

**One clock, not one per event** (`src/affichage.ts`): a single timer rewrites
the text of the countdowns every second, and `destroy()` stops it. The countdowns
are not in an `aria-live` region — a screen reader announcing every second would
make the page unusable; the exact date is in `<time datetime>`.

**Instants, not wall-clock times.** Dates are stored in UTC
(`2026-12-19T17:42:00.000Z`): two people in two time zones wait for the same
moment. The interface shows and accepts them in local time
(`<input type="datetime-local">`), validated when the field loses focus.

## Capabilities

```json
"capabilities": { "noteBlock": { "label": "Compte à rebours" } }
```

The label is what Filarr will show in the notes' insert menu.

## The formats

```json
{ "format": "filarr-rebours", "version": 1,
  "evenements": [{ "id": "e-7b33d4", "titre": "Départ en vacances", "date": "2026-12-19T17:42:00.000Z", "note": "…" }] }
```

Canonical output (a file written by the extension reads back byte for byte),
list kept in chronological order. A block's data: `{ "v": 1, "titre", "date" }`.

## Build and check

```bash
npm run build && npm run check && npm run smoke && npm test
```

The test harness also mounts the block (`smoke.json`, key `bloc`): new, set up,
and read-only.

## The files

```
src/index.ts      the two entry points
src/editeur.ts    the .rebours file editor
src/bloc.ts       the note block
src/rebours.ts    the formats, the countdown computation, local dates (pure)
src/affichage.ts  a countdown's text, the single clock
exemples/         a year of events, a product launch, a block's data
```
