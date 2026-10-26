# Tableau blanc (whiteboard, `.tableau`) — live co-editing

A whiteboard for several people, live, in a shared vault: freehand strokes and
texts, which anyone can move, erase or undo. Outside a shared vault, it works the
same way for a single user.

## What the example shows

**The `collab` capability, following the pattern in [`API.md`](../../../docs/contract/API.md) §3**
(`src/salle.ts`). The extension never receives the room's document, nor any key,
token or presence: it holds **its own** `Y.Doc` (Yjs is bundled, ~100 KiB) and
exchanges **bytes** with the host.

1. `const doc = new Y.Doc()`;
2. apply `host.collab.initialUpdates` — what the room already contains;
3. if `host.collab.seed`: build the document from `initialBytes`, then
   `seeded()`, once;
4. `doc.on('update', (u, origin) => origin !== 'remote' && host.collab.sendUpdate(u))`;
5. `host.collab.onRemoteUpdate((u) => Y.applyUpdate(doc, u, 'remote'))`;
6. only save through `saveBytes` if `host.collab.isResponsible()`.

One ordering detail that the text of API.md leaves open: the listener of step 4
is set up **before** the seeding of step 3. Set up afterwards, the seeding update
would never go out and the other pages would see an empty room. Seeding is done
in batches, each under the ceiling of **1 MiB per update** (beyond it, the page
throws `collab_update_too_large`).

**Only the elected peer saves — for the whole room.** The elected peer (chosen by
the host, never by the extension) also saves the **others'** changes: they are in
its `Y.Doc`. The other pages report nothing to the host and show "Saved by
another participant". When the elected peer changes (`onResponsibleChange`), the
new one picks up whatever has not been saved yet.

**The file stays JSON** (`src/tableau.ts`); the `Y.Doc` is only a working state.
Its shape is chosen for co-editing:

- a `Y.Map` from identifier to plain object: modifying an element means replacing
  it (last writer wins, element by element);
- the display order is carried by `z` then `id`, not by the map's order: two
  peers that have received the same updates write **the same bytes**;
- seeding the same file twice (the host's safety net when the first seeder is
  slow) sets the same keys to the same values: **no duplicates**.

**Undo only undoes your own actions**: `Y.UndoManager` only tracks the local
origin. You do not erase the stroke someone else has just drawn.

**Updates are not validated** — the host writes them itself: a malicious peer can
empty the board, just as it could overwrite it through `saveBytes` (the damage is
bounded in size and rate, and reversible through revisions). So the extension
revalidates every element it receives as if it came from an unknown file
(`lireElement`): `#rrggbb` colors, bounded numbers, texts without line breaks.

**Read-only**: a viewer sees the room live, but sends nothing (`sendUpdate`
would throw `read_only`) and saves nothing.

**The keyboard**: Tab goes through the elements, arrow keys move them (Shift:
faster), Delete erases them, Enter on a text opens its field; "Add text" needs no
pointer. Drawing a stroke, however, is done with the pointer.

## Capabilities

```json
"capabilities": { "collab": true }
```

Three conditions for `host.collab` to exist: the capability declared and
accepted at install time ("Live co-editing in a shared vault"), a document open
in a shared vault, and a document of 5 MiB at most. Otherwise `host.collab` is
`undefined`: that is the default path, and the editor handles it.

Rate: 60 updates per second (burst of 120) and 2 MiB/s; beyond that, the bridge
cuts off (`sandbox_collab_abuse`). A stroke emits only **one** update, on
release; so does a move.

## What remains up to the author

Two peers can run two different versions of the extension in the same room
([`COLLAB-DESIGN.md`](../../../docs/contract/COLLAB-DESIGN.md), §4.5): keep the
shape of the `Y.Doc` compatible from one version to the next, or switch to a new
root.

## Build and check

```bash
npm run build && npm run check && npm run smoke && npm test
```

The test harness plays the room with three pages (one that seeds, one that
joins, a viewer), relays the updates the way the host does, and checks: a single
`seeded()`, convergence of the bytes, only the elected peer saves, handover to a
newly elected peer, double seeding without duplicates, and single-user mode.

## The files

```
src/index.ts     mount(), the elected peer, the local history, autosave
src/salle.ts     the API.md §3 pattern (and single-user mode)
src/tableau.ts   the JSON format and its shape in the Y.Doc
src/vue.ts       the SVG surface, the pen, the selection, the keyboard
exemples/        a brainstorming workshop, a living-room plan
```
