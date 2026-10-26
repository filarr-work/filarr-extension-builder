# Design note — real-time collaboration for sandboxed extensions

> **Status: IMPLEMENTED on 2026-10-23, behind the `collab` capability** (signed manifest +
> consent; contract: [CAPABILITIES.md](CAPABILITIES.md), tier 1b). Without it, everything
> in §1 below still holds: `host.collab` is `undefined` and the document is mounted solo.
> What was adopted, criterion by criterion, is in §6. §1 to §5 keep the original
> reasoning.

---

## 1. What is true today

A sandboxed extension has **no** access to the collaboration room, and two independent
locks ensure it:

- `registerSandboxedPlugin` deliberately ignores `host.collab` when building the
  synthetic provider (in Filarr, `pluginRegistry.ts`, `registerSandboxedPlugin`) — the
  field is never passed to the bridge, and the `init` message has no slot for it
  (`sandboxProtocol.ts`);
- the host does not even open the room: `collabEligible` requires
  `trustOfProvider(provider) !== 'sandboxed'` (`PluginEditorModal.tsx`, `collabEligible`).
  A document opened by a sandboxed extension is mounted **solo**, and the interface never
  pretends otherwise.

The mechanism does exist, though, and it works — for `builtin` extensions: the host passes
them a `PluginCollabHandle` (`pluginTypes.ts`, `PluginCollabHandle`) carrying a `Y.Doc`
already transported and encrypted by the core (one room per item, key epoch included), an
`Awareness`, a `phase`, and a `responsible` flag. Filarr's document editor uses it. So
this is not a missing feature: it is a door that is **locked**, with the reason written
on it.

## 2. Why the room stays closed

### A CRDT stream is an arbitrary write, replicated on trusting peers

Saving a document means writing to **one** object, under a version lock, for the user who
has already agreed to open this file with this extension. The possible damage is bounded:
that one document, reversible through revisions.

Emitting into a room is something else: every update goes to **all connected peers**,
who apply it to their local copy **without any human intervention**, in the tab of an
E2EE application. An extension that emits gets a remote write primitive — on the devices
of people whose only action was to open the same file.

### No cryptographic check on the peer side can make up for it

This is already true for humans, and the core draws the consequence: a `viewer` holds the
vault key (they **need** it to read), so they can craft perfectly valid encrypted frames
that their peers would decrypt without blinking. Only the **relay** can stop them, by
refusing to circulate their document frames (in Filarr's worker, `collab.ts`).

But the relay cannot tell “update emitted by the extension” from “update emitted by the
core”: it only sees encrypted bytes, and that is exactly what is asked of it. Arbitration
would therefore have to happen **in the bridge, on the emitting client** — that is, in
code that today has no way of judging what it relays.

### The content of an update cannot be validated

A Yjs update is an opaque binary delta, which only makes sense to the document type that
receives it. The host cannot answer “does this update insert a paragraph or empty the
document?” without instantiating the **extension's** model — that is, without running the
extension's logic in the host, which is exactly what the sandbox forbids.

So no “schema validation” is possible in transit. This is the crux of the problem, and
none of the avenues below untangles it.

## 3. The considered path

The sketch below is consistent with the existing code, and the hooks are already in place.

### Relaying opaque updates through the bridge

`sandboxProtocol.ts` explicitly reserves a `kind: 'yjs-update'`: “relay of encoded Yjs
updates for a future sandboxed collaboration. NOT implemented in v1 — giving unreviewed
code a direct write stream into a shared room is a security decision to be investigated,
not a field to add.”

The minimal form would be symmetric:

```ts
// host → guest: a remote update to apply
{
  kind: 'yjs-update';
  bytes: ArrayBuffer;
}
// guest → host: a local update to broadcast
{
  kind: 'yjs-update';
  bytes: ArrayBuffer;
}
// host → guest: the room state, computed by the host ALONE
{
  kind: 'collab-state';
  phase: 'live' | 'pending' | 'off';
  responsible: boolean;
}
```

The extension would ship **its own copy of Yjs** in its bundle (a `Y.Doc` does not cross
an iframe boundary; only encoded bytes do). Cost: a few dozen kilobytes out of the 4 MiB
allowed — acceptable.

On the `host` side, this would give a much poorer handle than the builtins get:

```ts
host.collab = {
  onRemoteUpdate(cb: (bytes: Uint8Array) => void): () => void,
  sendUpdate(bytes: Uint8Array): void,
  phase: 'live' | 'pending' | 'off',
  responsible: boolean,
};
```

No shared `Y.Doc`, no shared `Awareness`: **bytes, in both directions**, like the rest of
the contract.

### What the host keeps, and does not give up

- **The room key** — derived from the vault's sealing, never passed to the bridge. The
  extension neither encrypts nor decrypts: it receives plaintext already decrypted by the
  core, and returns plaintext that the core will encrypt. Exactly the `saveBytes` model.
- **The room token, the `itemId`, the epoch** — still absent from the `init` message.
- **Electing the peer responsible for saving** — see §4, this is an open point.
- **The revocation window**, unchanged: it equals a token's lifetime, i.e. at most
  `ROOM_TOKEN_TTL_SECONDS = 300` s (`collab.ts`) after a member is removed. The room
  closes the channel at the first frame that crosses it after that, incoming or outgoing,
  and a token is no longer issued to a removed member (`collab.ts`). Nothing in this
  design would touch that mechanism — which is precisely the argument for doing it _in the
  bridge_ rather than by giving the extension a channel.

### Inherited limits

| Constraint                | Value     | Origin                                                                                                                                                                         |
| ------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Size of a sent frame      | **8 MiB** | `COLLAB_MAX_SEND_BYTES` (`collabProtocol.ts`), aligned with the relay's limit — beyond it, the room closes the channel; an EXTENSION update is capped at 1 MiB by the bridge |
| Size of a received frame  | 8 MiB     | `COLLAB_MAX_FRAME_BYTES` (`collabProtocol.ts`)                                                                                                                                 |
| Document eligibility      | 5 MiB     | `PLUGIN_DOC_COLLAB_MAX_BYTES` (`PluginEditorModal.tsx`) — a margin below the seed frame: beyond it, the room **does not open**, and the interface says so                      |

An extension update over 1 MiB would therefore be rejected **by the bridge**, not
silently dropped by the relay — the difference matters: a seed frame lost silently leaves
the peers on an empty room that a save would then overwrite under version.

## 4. Open questions

None of them is rhetorical; these are the ones that block.

1. **Validation is impossible.** See §2. Any implementation will have to accept, in
   writing, that the bridge relays bytes it does not understand to peers that will apply
   them. The only credible countermeasure is to **bound the damage** (quotas, size,
   revocation) and to **make it reversible** (revisions), not to prevent it.
2. **Arbitrating who is responsible for saving.** The current rule is deterministic and
   involves no negotiation: the peer allowed to write whose Yjs `clientId` is the smallest
   (`saveElection.ts`). But that `clientId` would come from the **extension's** `Y.Doc`,
   in the iframe: an extension could pick a tiny `clientId` to always be elected, or a
   huge one to never save. The election must therefore stay **entirely on the host
   side**, on an identity the host controls, and `responsible` must be information
   _pushed_ to the extension — never a value it declares.
3. **Quotas.** An extension can emit updates as fast as the event loop allows, and each
   update costs CPU on **all** peers. The bridge needs a token bucket (update rate, bytes
   per second, per-room cap), with the same philosophy as the invalid-message counter:
   past the limit, we cut off.
4. **Presence (awareness).** The host's presence interface displays member labels. If an
   extension could write into the shared awareness, it would be writing text **rendered by
   the host**. Either the extension's awareness lives in a separate namespace that the host
   never displays, or it does not exist. The second option is the safer one.
5. **Divergent versions.** Two peers may run two different versions of the same extension
   on the same `Y.Doc`. The CRDT will converge on structures that one of the two versions
   cannot read. Who arbitrates? Today the question does not arise (one editor, one
   moment).
6. **Key epoch and unmounting.** A vault reseal changes the room key. The host remounts
   the editor — the extension loses its unsaved state. Acceptable? To be decided.

## 5. Acceptance criteria for a future implementation

An implementation should only be considered if **every one** of these lines is checked.

- [ ] The extension receives **no** new secret: no room key, no token, no `itemId`, no
      epoch. The `init` message stays as it is; `collab-state` carries only `phase` and
      `responsible`.
- [ ] Updates cross the bridge as **opaque bytes**, validated in shape and size by
      `parseGuestMessage` like everything else, capped at 1 MiB per frame.
- [ ] A **token bucket** bounds the emission rate; exceeding it cuts off the bridge, with
      the same bluntness as `sandbox_protocol_abuse`.
- [ ] Electing the peer responsible for saving stays **entirely on the host side**; the
      extension can neither claim the role nor escape it.
- [ ] The extension's awareness **never** reaches the host's presence interface.
- [ ] The revocation window stays **unchanged** and is verified by a test: a removed
      member stops emitting and receiving at most `ROOM_TOKEN_TTL_SECONDS` afterwards.
- [ ] An extension that does not implement collaboration keeps working exactly as
      before — `host.collab` stays `undefined` for it, and solo mounting remains the
      default path.
- [ ] The user is told, **at install**, that an extension asks for collaboration: it is
      an additional capability, and it must be visible.
- [ ] The document states in black and white what is **not** guaranteed — starting with
      the impossibility of validating an update's content.

Without the `collab` capability: write your extensions as single-user editors. That is
the actual semantics.

## 6. What was done (2026-10-23)

One fundamental difference from §3: the extension's updates are **never applied** to the
room's `Y.Doc`. The host stores them, as opaque bytes, in a root of its own —
`filarr:ext:<identifier>`, a `Y.Array` of bytes (in Filarr, `extensionCollab.ts`). The
rule “an update that touches `content`, `filarr:room` or `filarr:comments` is refused”
therefore holds by construction, without decoding the updates (which cannot be done
reliably: a Yjs update does not always indicate its root).

- [x] No new secret: `init.collab` carries only `seed`, `responsible` and the updates
      already stored; `collab-state` carries only `responsible`.
- [x] Opaque bytes validated by `parseGuestMessage`: `collab-send` non-empty, 1 MiB at
      most; received, 8 MiB at most.
- [x] Token buckets in the bridge: 60 updates/s (burst 120) and 2 MiB/s (burst 8 MiB);
      beyond that, `sandbox_collab_abuse`. Outside a room, in read-only mode or without
      the capability: invalid message.
- [x] Election of the responsible peer entirely on the host side (the session's
      `isResponsible`), pushed to the page; the extension's `clientId` plays no part in it.
- [x] No awareness for the extension: it writes nothing that the host displays.
- [x] Revocation window unchanged: the core's transport is not touched.
- [x] Without the capability, `host.collab` stays `undefined` and solo mounting remains
      the default path (Chromium test in Filarr, `pluginSandbox.spec.ts`).
- [x] Consent: “Live co-editing in a shared vault” is shown at install.
- [x] What is not guaranteed is written here and in `extensionCollab.ts`: the content of
      an update cannot be validated; a malicious extension in a room can empty its peers'
      document, just as it can overwrite it through `saveBytes`. The damage is bounded
      (size, rate) and reversible (revisions).

Seeding: a room that already carries updates is not seeded; an empty room is seeded by
the host's elected seeder (`maySeed`), and the others wait at most 3 s and then seed
(a safety net, as for the builtins). The root is compacted by the elected peer alone once
it exceeds 256 entries (`Y.mergeUpdates`, a function of the bytes).

Questions still open: divergent extension versions between peers (§4.5) and remounting on
an epoch change (§4.6) — unchanged, and left to the author.

---

**See also**: `ARCHITECTURE.md` §1 (what the extension receives, and nothing else),
`API.md` §3 (`host.collab`).
