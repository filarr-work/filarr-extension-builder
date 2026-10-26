# Extension API reference

The complete guest contract. The source of truth is Filarr's sandbox page
(`plugin-sandbox.html`): if that page and this document ever disagree, the page is right.

Everything below concerns a **`sandboxed`** extension (the only trust level a third party
can publish — see [ARCHITECTURE.md](ARCHITECTURE.md), §2).

---

## 1. The entry point

Your bundle is executed like this, inside the iframe:

```js
new Function('globalThis', data.code)(globalThis);
```

Three consequences that dictate your build:

- the code is a **function body**, not a module: `import` / `export` are syntax errors.
  Build as an **IIFE** (`--format=iife`);
- your `var`, `function` and other top-level declarations stay in that scope: they do
  not "leak" into `globalThis`. The only link with the host is the explicit assignment
  below;
- `globalThis` is passed as a parameter: you can write to it directly.

```js
globalThis.filarrSandboxedPlugin = {
  editors: [
    {
      id: 'kanban-editor',
      mount(host) {
        /* … */
        return instance;
      },
    },
  ],
};
```

`editors` must be an array; the page looks for **the element whose `id` is exactly the
one requested**. No matching `id` ⇒ `fatal('sandbox_editor_not_found')`, and nothing
mounts.

### Which `id` does the host request?

For a **marketplace** extension, the host synthesizes the registry manifest from the
signed manifest (in Filarr, `toRegistryManifest`):

```ts
editors: [{ id: `${m.id}-editor`, extensions: m.extensions, displayName: m.name }];
```

So: **`id` = `<slug>-editor`**. The slug `kanban` ⇒ the editor **must** be called
`kanban-editor`. This is not a style convention: it is the `editorId` the host will send
in `init`.

Corollary: a marketplace extension exposes **a single** editor, which receives **all**
the file extensions declared in the manifest. An extension that claims `['kanban', 'kb']`
mounts the same editor for both.

> **When testing locally**, the "Test without publishing" area of the Publish tab mounts
> a synthetic manifest with the id `dev-local-<n>`: the requested editor is therefore
> `dev-local-<n>-editor`. If the error banner shows `sandbox_editor_not_found`, that is
> exactly why. The workaround during development is to expose several entries wired to
> the **same** `mount`:
>
> ```js
> const ids = ['wc-editor'];
> for (let i = 1; i <= 8; i++) ids.push('dev-local-' + i + '-editor');
> globalThis.filarrSandboxedPlugin = { editors: ids.map((id) => ({ id, mount })) };
> ```

## 2. `mount(host)`

```ts
mount(host: EditorHost): EditorInstance | Promise<EditorInstance>
```

Called **once**, when the document opens. May be `async`. Must return the instance (or a
promise of an instance).

- resolution ⇒ `{kind:'mounted'}`: the host considers the editor live;
- synchronous exception, or rejected promise ⇒ `{kind:'mount-error', message}`. The
  message is truncated to 2000 characters, and **it is shown to the user** by the host
  (banner, plain text). Write it to be read: "unrecognized .kanban format (version 7)"
  beats `TypeError: undefined`;
- no resolution at all ⇒ after **15 s**, the host gives up with `sandbox_init_timeout`.

Do not block `mount` on long work: return an empty but mounted UI, then fill it. Fifteen
seconds is a ceiling, not a budget.

## 3. `host` — field by field

What the guest page builds:

| Field           | Type                                   | Semantics                                                         |
| --------------- | -------------------------------------- | ----------------------------------------------------------------- |
| `container`     | `HTMLElement`                          | The node to mount into. Owned by the host                         |
| `fileName`      | `string`                               | The file name, for your UI                                        |
| `readOnly`      | `boolean`                              | Write permission — an **enforced obligation**, not a hint         |
| `initialBytes`  | `Uint8Array`                           | The decrypted bytes, **snapshot taken at mount time**             |
| `saveBytes`     | `(bytes: Uint8Array) => Promise<void>` | The only write path                                               |
| `onDirty`       | `(dirty: boolean) => void`             | Signals unsaved input                                             |
| `mode`          | `'editor'`, `'block'` or `'widget'`    | The entry point that was mounted (see §3 bis)                     |
| `locale`        | `string`                               | Filarr's language (`fr`, `en`…)                                   |
| `theme`         | `{ scheme, tokens }`                   | The host theme, already applied as CSS variables on `container`   |
| `onThemeChange` | `(cb) => () => void`                   | Notifies you when the theme changes; returns the unsubscribe call |
| `collab`        | object or `undefined`                  | Present **only** with the `collab` capability, in a room (§3)     |

The `storage`, `pick`/`readPicked`/`writePicked` and `network` fields exist only if the
corresponding capability was declared in the signed manifest **and** accepted by the user
(§3 bis). Check that they are present before using them.

### `container`

It is `#plugin-root`, a `<div style="position:fixed;inset:0">` that fills the whole guest
page. The page background is **transparent**: you paint your own, or you visually inherit
the modal's.

The host owns this node and destroys it along with the iframe. Clear it with
`container.textContent = ''` if you need to. **Never** use `innerHTML` with content that
comes from the document: a shared vault can contain a file crafted by someone else. Build
with `createElement`.

Filarr's theme is already applied as CSS variables (`--color-*`) on this node: use them,
and `host.onThemeChange` to react to a change. `host.theme.scheme` tells you light or
dark; `prefers-color-scheme` follows the system, not necessarily Filarr.

### `fileName`

The file's display name, as the vault knows it. Use it for the title, for an export, for
an error message. Infer nothing else from it: it is not a path, it tells you neither the
vault nor the folder, and two different documents can have the same name.

### `readOnly`

`true` when the user is not allowed to write to this vault (viewer role, read-only vault,
expired plan…).

Since the host was hardened, this is an **enforced obligation**: if `readOnly` is true,
`saveBytes` **rejects** with the code `read_only` — the host no longer simply trusts you.

You must still disable your editing UI. Ignoring `readOnly` does not cause a leak; in
practice it causes something worse: a user who types for twenty minutes a text that
nobody will ever save.

### `initialBytes`

The decrypted bytes of the document, **at mount time**. It is a copy that belongs to you
(see [ARCHITECTURE.md](ARCHITECTURE.md), §4): no defensive `slice()` to write, nobody will
modify it behind your back.

After mount, **your internal model is the source of truth**. There is no "reload": if the
document changes on the server while you are open, you are not notified — the next save
will bounce with `item_version_conflict`, and that is how you will find out.

A 0-byte file is a **normal** case, not an error: it is what the "New document" menu
creates. Treat it as a "new (empty) document" and build your initial state.

### `saveBytes(bytes)`

```js
host.saveBytes(new TextEncoder().encode(texte)).then(
  () => {
    host.onDirty(false); /* saved */
  },
  (e) => {
    /* e.message is a CODE — see the table below */
  }
);
```

What the host does when you call it: re-encrypt the bytes, push them to the vault under
`expectedVersion`, update its local version, then reply. Calls are correlated by
`requestId`: several calls do not get mixed up, and each promise waits for **its own**
reply.

Four things to know, all verifiable:

1. **The rejection carries a stable CODE**, not a translated sentence. Your extension has
   its own i18n: it maps the code, it does not redisplay a host string.
2. **Saves are serialized on the host side.** A save in flight makes the next one reject
   with `save_in_flight`. This is not an error: it means "try again in a moment".
3. **There is no timeout on a save.** The bridge arms no timer for `save-request`. If the
   modal closes while a save is in flight, the port closes and your promise **never
   settles**. Never make `destroy()` depend on an `await saveBytes(…)`.
4. **It is expensive.** Each call = encryption + network request + versioned write, plus
   a UI refresh on the host side. **Do not go below a 2-second debounce** for autosave.
   An editor that saves on every keystroke is an editor people uninstall.

#### Rejection codes

| Code (`e.message`)      | Meaning                                                                                                                                                                                                                                                   | What the extension must do                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `item_version_conflict` | Someone (or another device) has saved since you opened the document. The host **does not** adopt the server version automatically: until the user has confirmed the overwrite with the modal's "Save" button, subsequent saves reject with this same code | Explicit banner ("conflict — save again to overwrite deliberately, or reopen the document"), **stay `dirty`**, stop autosave until the user takes action |
| `read_only`             | `host.readOnly` is true. The host refuses structurally                                                                                                                                                                                                    | Should not happen if you respect `readOnly` — treat it as a bug in your UI, show "read-only"                                                             |
| `save_in_flight`        | A save is already in progress                                                                                                                                                                                                                             | Show nothing alarming; retry at the next debounce, stay `dirty`                                                                                          |
| Any other value         | A host error key (quota exceeded, offline, session expired, server refusal…)                                                                                                                                                                              | A generic message of your own + the code shown as is, so that the user can report it. Stay `dirty`                                                       |

A rejection **never** loses data: the document stays as it was in the vault, and your
state stays as it is in the extension. The only thing you must not do is lower the
`dirty` flag.

### `onDirty(dirty)`

`onDirty(true)` on **every** mutation — not just the first one.

The reason is concrete: the host lowers the flag when a save succeeds, including a save
the user triggered themselves with the modal's button. If you announce that you are dirty
only once, you will end up in a state where the user has unsaved changes and the host
believes the opposite — and therefore closes the modal without asking for confirmation.

The host, for its part, no longer overrides you: a successful save lowers the flag only
if no `onDirty(true)` arrived during the round trip. Keystrokes made while the save is in
progress therefore still count as unsaved — provided you reported them.

`onDirty(false)`: only after a successful `saveBytes`. Never "just to be safe".

### `collab`

`undefined` unless your manifest declares `"collab": true`, the user accepted it, **and**
the document is open in a shared-vault room. Without all three conditions, you are a
single-user editor — and that is the default path.

In a room, you do **not** receive a shared document: you hold your own `Y.Doc` (ship Yjs
inside your bundle) and you exchange **bytes**:

```ts
host.collab = {
  seed: boolean;                       // true: the room is empty, pour initialBytes into it
  initialUpdates: Uint8Array[];        // what the room already contains: apply it first
  sendUpdate(bytes: Uint8Array): void; // your Yjs updates (1 MiB at most each)
  onRemoteUpdate(cb: (bytes: Uint8Array) => void): () => void; // everyone else's
  seeded(): void;                      // call ONCE, right after seeding
  isResponsible(): boolean;            // the elected participant who saves for the room
  onResponsibleChange(cb: (r: boolean) => void): () => void;
};
```

The pattern, **in this order**: `const doc = new Y.Doc()`; apply `initialUpdates` with
the origin `'remote'`; wire
`doc.on('update', (u, origin) => origin !== 'remote' && host.collab.sendUpdate(u))`
**before** seeding — otherwise the seed update is never sent; if `seed`, build the
document from `initialBytes` (in batches, so that no update exceeds 1 MiB), then call
`seeded()` once; finally `onRemoteUpdate((u) => Y.applyUpdate(doc, u, 'remote'))`. Save
through `saveBytes` only if `isResponsible()`. The
[`tableau-blanc` example](../../examples/code/tableau-blanc/) in this repository follows
exactly this pattern.

What the host keeps: the key, the token and the room identifier, the election of the
participant who saves, presence. Your updates are stored under a root of your own,
`filarr:ext:<id>`, and are never applied to the host's document. Throughput is capped
(§7): beyond that, the bridge cuts you off (`sandbox_collab_abuse`). The reasoning is in
[COLLAB-DESIGN.md](COLLAB-DESIGN.md).

### Note block and home widget

In `block` or `widget` mode, `host.fileName` carries the NAME of the extension (there is
no file), `initialBytes` the block's data (or the widget's setting, in UTF-8), and a
widget is always read-only.

## 3 bis. Capabilities

An extension receives nothing other than its document, **except** what its manifest
declares in `capabilities` (signed with the rest) and the user accepts at install. The
full contract: [CAPABILITIES.md](CAPABILITIES.md). A missing capability = a missing API;
a call that was not granted is refused by the host (`capability_denied`) and counts as
an invalid message.

| Capability (manifest)                                    | What it unlocks                                                                                                                                                                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `newDocument`, `maxBytes`, `imports`                     | Nothing in the page: the host offers "New document", opens larger files, imports other formats                                                                                                                         |
| `storage: { quota }`                                     | `host.storage.get(key)`, `.set(key, bytes)`, `.delete(key)`, `.keys()` — encrypted, on the device, keys `^[a-z0-9._-]{1,64}$`                                                                                          |
| `picker: { access, extensions? }`                        | `host.pick({ multiple })` → `[{ handle, name }]`; `host.readPicked(handle)`; `host.writePicked(handle, bytes)` with `readwrite`                                                                                        |
| `network: { domains, secrets? }`                         | `host.network.request({ method, url, headers, body })` → `{ status, contentType, body }` — **desktop only**, every request shown to the user                                                                           |
| `collab: true`                                           | `host.collab` in a room (§3)                                                                                                                                                                                           |
| `functions: { extractText, thumbnail, fields, exports }` | A page **with no API at all** calls `plugin.functions.<name>(bytes, ctx)`: `extractText`, `thumbnail`, `fields`, and `export` — SINGULAR, with the target in `ctx.to` — for what the manifest declares under `exports` |
| `noteBlock: { label }`                                   | `plugin.block.mount(host)` in notes (`host.mode === 'block'`)                                                                                                                                                          |
| `homeWidget: { label }`                                  | `plugin.widget.mount(host)` on the home screen (`host.mode === 'widget'`, read-only)                                                                                                                                   |

`network` excludes `picker`, `storage`, `functions` and `noteBlock`: an extension never
reads your files AND talks to the Internet without you. Secrets (`network.secrets`) are
entered in Filarr and added by the host to the declared header: your code never sees
them.

## 4. `instance` — what `mount` returns

```ts
interface EditorInstance {
  destroy(): void;
  getBytes(): Uint8Array | Promise<Uint8Array>;
}
```

### `destroy()`

Called on close, **synchronously**. Release everything: listeners, timers (`clearTimeout`
your debounce!), observers, `URL.revokeObjectURL`, views.

Right after your `destroy()`, the port is closed: no further message goes out, and the
whole iframe is removed from the DOM. So do not start a "last save" there — it would
never be sent. An exception thrown by `destroy()` is swallowed by the page (unmounting
continues), but it leaves your leaks in place: do not count on it.

### `getBytes()`

Returns the current state of the document, as a `Uint8Array` — synchronously or as a
promise, both are accepted.

Called by **the host** when the user clicks "Save" in the modal. You do not control the
timing. Three rules:

- **≤ 10 s**, otherwise the host gives up with `sandbox_request_timeout` and tells the
  user that the extension is no longer responding;
- **it must be total**: an exception or a rejection does not become a polite save error
  but a **`fatal`** — the host stops trusting the iframe. Always serialize what you have;
- return a fresh array or one of your own, it does not matter: the bridge copies it before
  transferring.

## 5. The full lifecycle

```
document opened
  ├─ the host downloads and decrypts the bytes      ("Loading sandboxed plugin…")
  ├─ the iframe loads the sandbox page              (≤ 10 s)
  ├─ bootstrap: a MessagePort changes hands
  ├─ init: your bundle is executed                  ← fresh globalThis, on every open
  ├─ editor.mount(host)                             ← your code starts
  │    ├─ success → "mounted", the editor is live
  │    └─ failure → mount-error banner, nothing is mounted
  ├─ life: onDirty / saveBytes / getBytes, in any order
  │    └─ uncaught crash → fatal → banner, the editor is no longer reliable
  └─ close: destroy() → port.close() → iframe.remove()
```

Two properties follow from this:

- **no state survives** closing. A new `globalThis`, a new iframe, a new bundle executed
  on every open. There is no "warm cache" to hope for, and no session leak between two
  documents;
- **one document at a time** per mounted editor. The host only pushes the one that is
  open and has no message for requesting another.

## 6. Errors: who sees what

Two families, and the difference matters.

|                    | `mount-error`                                  | `fatal`                                                                                     |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Emitted when       | `mount()` throws or rejects                    | Uncaught error, unhandled rejection, inconsistent `init`, failed `getBytes`, protocol abuse |
| Effect on the host | The mount fails; error banner + your message   | "The editor stopped working" banner + your message; the host no longer trusts the iframe    |
| The user sees it   | Yes, as plain text (never interpreted as HTML) | Yes, as plain text                                                                          |
| Recoverable        | No — close and reopen                          | No — close and reopen                                                                       |

Vault data is **never** at risk in either case: it lives elsewhere, encrypted, and the
bridge has written nothing.

### Codes you will see during development

| Code                                                                                                         | Emitted by | Cause                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `sandbox_page_timeout`                                                                                       | Host       | The sandbox page did not load within 10 s                                                                              |
| `sandbox_version_mismatch`                                                                                   | Guest page | Protocol version ≠ 2                                                                                                   |
| `sandbox_bad_init`                                                                                           | Guest page | `code` is not a string or `bytes` is not an `ArrayBuffer`                                                              |
| `sandbox_bytes_too_large`                                                                                    | Guest page | Document > 64 MiB                                                                                                      |
| `sandbox_no_plugin`                                                                                          | Guest page | `globalThis.filarrSandboxedPlugin` missing or without `editors` — **the #1 case**: bundle built as ESM instead of IIFE |
| `sandbox_editor_not_found`                                                                                   | Guest page | No editor with the requested `id` (see §1)                                                                             |
| `mount_failed`                                                                                               | Guest page | `mount()` threw without a usable message                                                                               |
| `sandbox_no_instance`                                                                                        | Guest page | `get-bytes` received while `mount` never returned an instance                                                          |
| `get_bytes_failed`                                                                                           | Guest page | `getBytes()` threw or rejected                                                                                         |
| `sandbox_init_timeout`                                                                                       | Host       | No `mounted` within 15 s                                                                                               |
| `sandbox_request_timeout`                                                                                    | Host       | No `bytes-result` within 10 s                                                                                          |
| `sandbox_protocol_abuse`                                                                                     | Host       | 20 invalid messages — the bridge cut off                                                                               |
| `sandbox_collab_abuse`                                                                                       | Host       | Too many co-editing updates (throughput, §7) — the bridge cut off                                                      |
| `capability_denied`                                                                                          | Host       | Rejection of a `host.*` call whose capability is not granted (counts as invalid)                                       |
| `rate_limited`, `too_many_requests`                                                                          | Host       | More than 20 calls/s (burst 40) or 16 in flight — try again later                                                      |
| `net_refused`, `net_domain`, `net_header`, `net_redirect`, `net_unreachable`, `net_too_large`, `unavailable` | Host       | Rejections from `host.network.request` ([CAPABILITIES.md](CAPABILITIES.md), tier 4)                                    |
| `sandbox_disposed`                                                                                           | Host       | Requests still in flight at unmount time                                                                               |

## 7. The limits, in one table

| Limit                       | Value                          | Where it comes from (in Filarr)                                                                      | What it implies                                                                                           |
| --------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Network**                 | None in the page               | CSP `default-src 'none'`, only the page's own script allowed, WebRTC removed (`plugin-sandbox.html`) | No CDN, no remote font, no telemetry. The only route: the `network` capability, through the desktop relay |
| **Storage**                 | Whatever `storage` grants      | Opaque origin: `localStorage`/`indexedDB` **throw**                                                  | 1 KiB to 16 MiB, encrypted, wiped on uninstall                                                            |
| **Collaboration**           | `collab` capability            | 1 MiB per update sent, 8 MiB received; 60 updates/s (burst 120), 2 MiB/s (burst 8 MiB)               | Beyond that: `sandbox_collab_abuse`. Document ≤ 5 MiB to open the room                                    |
| **Workers**                 | `blob:` only                   | `worker-src blob:`; they inherit the page's CSP                                                      | Computation off the main thread, still without network                                                    |
| **Bundle size**             | 4 MiB                          | `MAX_PLUGIN_BUNDLE_BYTES` (`marketplace.ts`)                                                         | Minify; aim for ≤ 1 MiB to keep some headroom                                                             |
| **Manifest size**           | 640 KiB in **UTF-8 bytes**     | `MAX_MANIFEST_BYTES` (`marketplace.ts`)                                                              | Generous — unless your description is a novel                                                             |
| **Document size**           | 64 MiB                         | `SANDBOX_MAX_BYTES` (`sandboxProtocol.ts`), checked again on the guest side (`plugin-sandbox.html`)  | Beyond that: `fatal`, the editor does not mount                                                           |
| **Mount**                   | 15 s                           | `INIT_TIMEOUT_MS` (`sandboxBridgeCore.ts`)                                                           | Mount fast, fill in afterwards                                                                            |
| **`getBytes`**              | 10 s                           | `REQUEST_TIMEOUT_MS` (`sandboxBridgeCore.ts`)                                                        | Serialization must be bounded                                                                             |
| **Invalid messages**        | 20, cumulative                 | `MAX_INVALID_MESSAGES` (`sandboxBridgeCore.ts`)                                                      | Never write to the port directly: use only the `host` API                                                 |
| **Simultaneous documents**  | 1                              | The `init` contract                                                                                  | No "project", no multi-file tabs                                                                          |
| **Editors per extension**   | 1 (marketplace)                | `toRegistryManifest` (`installedPlugins.ts`)                                                         | All your file extensions go through the same `mount`                                                      |
| **File extensions**         | 1 to 10, `^[a-z0-9]{1,10}$`    | `validateManifest` (`marketplace.ts`)                                                                | No dot, lowercase                                                                                         |
| **Importing other formats** | `imports` capability           | `registryContributionOptions` (`grantedCapabilities.ts`)                                             | Up to 10 formats, which your editor converts on open                                                      |
| **File extension conflict** | First come, first served       | `planProviders` (`pluginRegistry.ts`)                                                                | A file extension that is already claimed ⇒ status `register_failed`, nothing is registered                |
| **Cost of a `saveBytes`**   | Encryption + request + version | `PluginEditorModal.doSave`                                                                           | Debounce ≥ **2 s**, never less                                                                            |

## 8. The good-extension checklist

- [ ] **IIFE** bundle, target `es2020`, no network dependency.
- [ ] Editor `id` = `<slug>-editor`, exactly.
- [ ] `mount` returns an instance in under 15 s, and throws a **readable** message when
      the format is not recognized.
- [ ] A 0-byte file is accepted as a "new (empty) document".
- [ ] Unknown format ⇒ an error is shown, **never** a silent overwrite.
- [ ] `onDirty(true)` on **every** mutation; `onDirty(false)` **only** after a success.
- [ ] Autosave debounced to **2 s minimum**; rejection codes are mapped one by one.
- [ ] `readOnly` disables the whole editing UI.
- [ ] `getBytes()` is total, bounded, and returns the current state.
- [ ] `destroy()` releases timers and listeners, and starts no save.
- [ ] No `innerHTML` with document content; DOM built with `createElement`.
- [ ] Internal i18n (at least fr/en) based on `host.locale`, theming through the
      `--color-*` variables of `host.container` and `host.onThemeChange`.

The reference implementation of this checklist is [`filarr-plugin-kanban`](https://github.com/matbel91765/filarr-plugin-kanban).
