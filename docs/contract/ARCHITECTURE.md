# Architecture and trust model

The model in one sentence: **an extension is unreviewed code that is entrusted with the
decrypted bytes of a single document, and nothing else — because everything else is
structurally out of its reach.**

This document explains how that sentence holds. It is written for the extension author
(so they know exactly what they are entitled to expect) as much as for the security
reviewer (so they can check it).

---

## 1. E2EE: what the extension actually receives

Filarr is end-to-end encrypted. Keys live on the device, never on the server. An editor,
by definition, has to see the plaintext — that is its whole point (in Filarr,
`pluginTypes.ts`, header comment “THE TRUST MODEL, STATED PLAINLY”). So the question is
not “how do we hide the document from the editor”, but “how do we give it ONLY that”.

The `init` message is the answer, and it can be read in full (in Filarr,
`sandboxProtocol.ts`):

```ts
{
  kind: 'init';
  version: number; // 2
  mode: 'editor' | 'function' | 'block' | 'widget'; // what the page is for
  code: string; // your bundle, as a string
  editorId: string; // the requested editor (empty outside editor mode)
  fileName: string; // the file name, for your UI
  readOnly: boolean; // the right to write, as computed by the host
  bytes: ArrayBuffer; // the DECRYPTED bytes of the document
  grants: ExtensionCapabilities; // the capabilities GRANTED — informational, the bridge enforces them
  theme: { scheme: 'light' | 'dark'; tokens: Record<string, string> }; // filtered CSS variables
  locale: string; // Filarr's interface language
  collab?: { seed; responsible; updates }; // only in a room, with `collab` granted
}
```

Protocol version 1 carried only `code`, `editorId`, `fileName`, `readOnly` and `bytes`.
Version 2 adds what the page needs to run and what the user GRANTED
([CAPABILITIES.md](CAPABILITIES.md)) — never anything about the account. So the following
are not in it, and cannot be: access token, API URL, `userId`, `vaultId`, `itemId`, version
number, key epoch, vault key, room key, member list, path in the folder tree. The
extension does not even know whether the document comes from a personal or a shared
vault.

Symmetrically, the document's only write path is `saveBytes`: the extension proposes bytes, and the
host **re-encrypts** them and pushes them under a version lock
(`PluginEditorModal.doSave` → `updateVaultItem` with `expectedVersion`). An extension
cannot write to the vault; it can ask the host to write. Capabilities add other
host-mediated paths (a new document, an export), each started by the user and written
by the host ([CAPABILITIES.md](CAPABILITIES.md)).

What this costs, and it has to be said: an editing extension **can** write arbitrary
content into the document it opened. That is unavoidable — it is an editor. What contains
this risk is the item's revisions (the write is reversible), the version lock
(overwriting concurrent work is refused, and then only happens as a deliberate, announced
choice), and the fact that this power stops **at that one document**.

## 2. The two trust regimes

`FilarrPluginManifest.trust` has two values, and two distinct entry points (in Filarr,
`pluginTypes.ts`, `FilarrPluginManifest.trust`; `pluginRegistry.ts`):

| Regime      | Entry point                       | What it is                                                                                                       | Who can produce it               |
| ----------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `builtin`   | `registerPlugin(plugin)`          | JS objects with real `mount()` functions, bundled when the application is built, reviewed like core code         | The Filarr team                  |
| `sandboxed` | `registerSandboxedPlugin(source)` | A manifest + a **string** bundle, never executed in the host, mounted in the iframe                              | Anyone, through the marketplace  |

`registerPlugin` **refuses** any `trust` other than `builtin`, and this refusal is
**permanent** (`pluginRegistry.ts`, `registerPlugin`). The reasoning, word for word: a
`FilarrPlugin` object carrying `mount()` functions that declared itself `sandboxed` would
be a lie — its code would run _inside_ the host, with the decrypted bytes, access to the
application's DOM, to the keys in memory, to the authenticated network. There is no way
to “sandbox after the fact” a function you are already holding.

That is why the sandboxed path takes a **string**: the only way to run foreign code
without handing it the host is never to run it in the host. `installedPlugins.ts` says
so explicitly — no `eval`, `import()` or `new Function` in the install path; the
product's only `new Function` is in the guest page (`plugin-sandbox.html`), where it
cannot reach anything.

And the worker refuses at publish any manifest whose `trust !== 'sandboxed'` (in Filarr's
worker, `marketplace.ts`, `validateManifest`): a downloaded bundle will never be
`builtin`, by construction of the service.

**Everything documented in this folder concerns the `sandboxed` regime.**

## 3. The opaque-origin iframe, and the CSP that closes the channels

The iframe is created with exactly one sandbox attribute (in Filarr, `sandboxHost.ts`):

```ts
iframe.setAttribute('sandbox', 'allow-scripts');
```

Not `allow-same-origin`, ever. The combination `allow-scripts allow-same-origin` on a
same-origin page would give the iframe back the application's origin: storage, access to
`parent`, and — best of all — the ability to remove its own `sandbox` attribute. The
string is `'allow-scripts'`; any other value is a security bug, not a setting.

Since the origin is opaque, the page cannot inherit the application's CSP: it **carries
its own**, in four consistent copies (the server is authoritative, the `<meta>` is the
last-resort safety net):

- in Filarr's web worker (`worker.js`, `SANDBOX_HEADERS`) — web;
- in Filarr's static headers file (`_headers`) — a belt-and-braces copy in case the
  asset configuration regresses;
- in Filarr's Electron main process (`main.ts`) — desktop, the same string to the
  character;
- in the page's own `<meta http-equiv>` (`plugin-sandbox.html`).

The string, identical everywhere:

```
default-src 'none'; script-src 'sha256-<LF>' 'sha256-<CRLF>' 'unsafe-eval';
style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src blob: data:;
worker-src blob:; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; webrtc 'block'
```

`script-src` admits ONLY the page's script, by its two hashes (LF and CRLF line endings;
a script in Filarr, `sandbox-csp-hash.cjs --write`, writes them in, and a test checks all
four copies). No more `'unsafe-inline'`: that is what prevents a child iframe from
executing anything at all (see WebRTC below). The page also turns off DNS prefetching.

### Channel by channel — which directive closes it

| Channel the extension tries                                      | Directive that closes it                                                                                                                                              | Effect                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetch()`                                                        | `default-src 'none'` (no `connect-src`)                                                                                                                               | CSP rejection                                                                                                                                                                                                                                                                                                                                                                                |
| `XMLHttpRequest`                                                 | `default-src 'none'`                                                                                                                                                  | CSP rejection                                                                                                                                                                                                                                                                                                                                                                                |
| `new WebSocket(...)`                                             | `default-src 'none'`                                                                                                                                                  | CSP rejection                                                                                                                                                                                                                                                                                                                                                                                |
| `navigator.sendBeacon(...)`                                      | `default-src 'none'`                                                                                                                                                  | CSP rejection, returns `false`                                                                                                                                                                                                                                                                                                                                                               |
| `new EventSource(...)`                                           | `default-src 'none'`                                                                                                                                                  | CSP rejection                                                                                                                                                                                                                                                                                                                                                                                |
| Remote image or font                                             | `img-src data: blob:` / `font-src data:`                                                                                                                              | Load blocked (local `data:`/`blob:` remain allowed)                                                                                                                                                                                                                                                                                                                                          |
| `new RTCPeerConnection()` + DataChannel                          | Constructors removed by the page BEFORE the extension's code runs, and `script-src` limited to the hash of the page's script                                          | `RTCPeerConnection` is `undefined`. ⚠ The `webrtc 'block'` directive is NOT recognized by Chromium (measured on 2026-10-23: “Unrecognized Content-Security-Policy directive”); it stays in place for engines that support it. A child iframe (`srcdoc`) would have provided an intact constructor: under this CSP, it executes nothing (end-to-end test in Filarr, `pluginSandbox.spec.ts`) |
| `localStorage`, `sessionStorage`                                 | Opaque origin (sandbox without `allow-same-origin`)                                                                                                                   | Access **throws**                                                                                                                                                                                                                                                                                                                                                                            |
| `indexedDB`, `caches`, cookies                                   | Opaque origin                                                                                                                                                         | Unavailable / throws                                                                                                                                                                                                                                                                                                                                                                         |
| `window.open`, `alert`, `confirm`, `print`                       | `sandbox` **without** `allow-popups` or `allow-modals` (+ a global `setWindowOpenHandler` on desktop)                                                                 | No effect                                                                                                                                                                                                                                                                                                                                                                                    |
| Form submission                                                  | `form-action 'none'`                                                                                                                                                  | Blocked                                                                                                                                                                                                                                                                                                                                                                                      |
| Hijacked `<base href>`                                           | `base-uri 'none'`                                                                                                                                                     | Blocked                                                                                                                                                                                                                                                                                                                                                                                      |
| Navigating its own iframe elsewhere (exfiltration through a URL) | Web: the parent's `frame-src 'self'` (Filarr's web worker), rechecked on **every** navigation of the subframe. Desktop: a `will-frame-navigate` guard (Electron main process) | Navigation refused                                                                                                                                                                                                                                                                                                                                                                           |
| Framing the page from a third-party site                         | `frame-ancestors 'self'`                                                                                                                                              | Refused                                                                                                                                                                                                                                                                                                                                                                                      |

`'unsafe-eval'` in this CSP is not a weakness: it is the bundle's **execution
mechanism** (`new Function`). The page has no origin, no secret, no network — there is
nothing to steal there. The corollary is written at the top of `plugin-sandbox.html` and
is worth repeating: **a CSP problem is never answered by widening the application's
CSP.** Widening the app's CSP means opening the whole E2EE product to XSS. The separately
served page _is_ the right answer; that is why it exists.

So here is what remains allowed, and what you can count on: inline styles, `data:`/`blob:`
images, `data:` fonts, `prefers-color-scheme`, timers, Web Crypto, Canvas, the whole
local DOM — and nothing that leaves the frame.

## 4. The bridge: a `MessagePort`, protocol v2

Content **never** travels through `window.postMessage`. An opaque origin cannot be
matched, so the bootstrap's `targetOrigin` has to be `'*'` (`sandboxHost.ts`) — and a
message targeted at `'*'` must contain nothing. So the bootstrap carries only the type and
**a `MessagePort`**; everything else goes through that port, which is private by
construction.

On the guest side, the bootstrap is accepted **only once**, only if it comes from
`window.parent`, and only if it carries a port (`plugin-sandbox.html`).

### Sequence diagram

```
Host                                                    Guest page + your bundle
(PluginEditorModal > sandboxHost > sandboxBridgeCore)   (plugin-sandbox.html)
  |                                                                 |
  |  iframe sandbox="allow-scripts" src="/plugin-sandbox.html"      |
  |---------------------------------------------------------------->|  loading
  |                       (<= 10 s, otherwise sandbox_page_timeout - sandboxHost.ts)
  |                                                                 |
  |  window.postMessage({type:'filarr-sandbox-bootstrap'}, '*', [port2])
  |---------------------------------------------------------------->|
  |                                         {kind:'ready', version:2}|
  |<----------------------------------------------------------------|  informational only
  |                                                                 |
  |  {kind:'init', version:2, mode, code, editorId, fileName, readOnly, bytes,
  |   grants, theme, locale, collab?}                              (bytes TRANSFERRED)
  |---------------------------------------------------------------->|  new Function('globalThis', code)(globalThis)
  |                                                                 |  editors.find(e => e.id === editorId)
  |                                                                 |  editor.mount(host)   <- your code starts here
  |                                                 {kind:'mounted'} |
  |<----------------------------------------------------------------|  <= 15 s after init,
  |                                                                 |     otherwise sandbox_init_timeout
  |                    -- or, if mount() throws / rejects --        |
  |                                    {kind:'mount-error', message} |
  |<----------------------------------------------------------------|  the host shows the banner
  |                                                                 |
  +-- editing ------------------------------------------------------+
  |                                            {kind:'dirty', dirty} |  host.onDirty(true/false)
  |<----------------------------------------------------------------|
  |                                                                 |
  |                       {kind:'save-request', requestId, bytes}    |  host.saveBytes(...) -> Promise
  |<----------------------------------------------------------------|     (bytes TRANSFERRED)
  |  encryption + PUT under expectedVersion                         |
  |  {kind:'save-result', requestId, ok:true}                        |
  |---------------------------------------------------------------->|  the Promise RESOLVES
  |  {kind:'save-result', requestId, ok:false, errorMessage:'<code>'}|
  |---------------------------------------------------------------->|  the Promise REJECTS (Error(code))
  |                                                                 |
  |  {kind:'get-bytes', requestId}   (the host's "Save" button)
  |---------------------------------------------------------------->|  instance.getBytes()
  |                      {kind:'bytes-result', requestId, bytes}     |     (bytes TRANSFERRED)
  |<----------------------------------------------------------------|  <= 10 s, otherwise sandbox_request_timeout
  |                                                                 |
  +-- at any time --------------------------------------------------+
  |                                         {kind:'fatal', message}  |  uncaught error,
  |<----------------------------------------------------------------|  unhandled rejection, inconsistent init
  |  the host shows the banner and stops trusting the iframe        |
  |                                                                 |
  +-- closing ------------------------------------------------------+
  |  {kind:'destroy'}                                               |
  |---------------------------------------------------------------->|  instance.destroy(), port.close()
  |  iframe.remove()                                                |
```

### The message table

| Direction    | `kind`         | Payload                                              | Who sends it                                                  |
| ------------ | -------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| host → guest | `init`         | `version, code, editorId, fileName, readOnly, bytes` | Once, on mount                                                |
| host → guest | `save-result`  | `requestId, ok, errorMessage?`                       | Reply to each `save-request`                                  |
| host → guest | `get-bytes`    | `requestId`                                          | Host-driven save                                              |
| host → guest | `destroy`      | —                                                    | Modal closed                                                  |
| guest → host | `ready`        | `version`                                            | Bootstrap accepted                                            |
| guest → host | `mounted`      | —                                                    | `mount()` resolved                                            |
| guest → host | `mount-error`  | `message` (≤ 2000 chars)                             | `mount()` threw or rejected                                   |
| guest → host | `dirty`        | `dirty: boolean`                                     | `host.onDirty(…)`                                             |
| guest → host | `save-request` | `requestId, bytes`                                   | `host.saveBytes(…)`                                           |
| guest → host | `bytes-result` | `requestId, bytes`                                   | Reply to `get-bytes`                                          |
| guest → host | `fatal`        | `message` (≤ 2000 chars)                             | `window.onerror`, `unhandledrejection`, inconsistent `init`   |

Protocol v2 ([CAPABILITIES.md](CAPABILITIES.md)) adds the following, without changing any
of the messages above:

| Direction    | `kind`          | Payload                               | Who sends it                                                                               |
| ------------ | --------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| host → guest | `theme`         | `theme` (filtered CSS variables)      | Application theme change                                                                   |
| host → guest | `response`      | `requestId, ok, value?, error?`       | Reply to a `request`                                                                       |
| host → guest | `call`          | `requestId, fn, fileName, bytes, to?` | Pure-function page (search, thumbnail, fields, export)                                     |
| host → guest | `collab-update` | `bytes` (≤ 8 MiB)                     | An update from another peer in the room                                                    |
| host → guest | `collab-state`  | `responsible`                         | The elected peer that saves has changed                                                    |
| guest → host | `request`       | `requestId, op, …`                    | `host.storage`, `host.pick`, `host.readPicked`, `host.writePicked`, `host.network.request` |
| guest → host | `call-result`   | `requestId, ok, value, error?`        | Reply to a `call`, checked according to the function                                       |
| guest → host | `collab-send`   | `bytes` (≤ 1 MiB)                     | `host.collab.sendUpdate(…)`                                                                |
| guest → host | `collab-seeded` | —                                     | `host.collab.seeded()`, once                                                               |

A `request` reaches a host service ONLY if the capability is in the signed and accepted
`grants`; otherwise `capability_denied`, and the message counts as invalid.

### The bridge's guards

The parser's adversary is the extension. Every incoming message on the host side is
validated by `parseGuestMessage` (`sandboxProtocol.ts`): exact shape, `requestId` a
positive integer, byte field an `ArrayBuffer` of **≤ 64 MiB** (`SANDBOX_MAX_BYTES`),
strings truncated to 2000 characters. The parser **never** throws: it returns `null`, and
the bridge does the counting.

| Guard                        | Value                                       | Where (in Filarr)       | Consequence                                            |
| ---------------------------- | ------------------------------------------- | ----------------------- | ------------------------------------------------------ |
| Page load                    | 10 s                                        | `sandboxHost.ts`        | `sandbox_page_timeout`                                 |
| `init` → `mounted`           | **15 s**                                    | `sandboxBridgeCore.ts`  | `sandbox_init_timeout`, mounting fails                 |
| `get-bytes` → `bytes-result` | **10 s**                                    | `sandboxBridgeCore.ts`  | `sandbox_request_timeout`                              |
| Invalid messages             | **20**, cumulative, never reset             | `sandboxBridgeCore.ts`  | `fatal('sandbox_protocol_abuse')` — the bridge cuts off |
| Size of a byte field         | 64 MiB, incoming **and** outgoing           | `sandboxProtocol.ts`    | Message rejected (and counted as invalid)              |
| Capability requests          | 16 in flight; 20/s (burst 40)               | `sandboxBridgeCore.ts`  | `too_many_requests` / `rate_limited`                   |
| Co-editing updates           | 60/s (burst 120) and 2 MiB/s (burst 8 MiB)  | `sandboxBridgeCore.ts`  | `fatal('sandbox_collab_abuse')` — the bridge cuts off  |

An extension that bombards the bridge with malformed messages is not an extension with a
bug: it is an extension we unplug. Twenty is enough.

### Bytes: who copies, who transfers

Both sides **copy before transferring**. It is a bridge rule, not a courtesy:

- host → guest: the bridge (`sandboxBridgeCore.ts`) clones the bytes before the
  transferring `postMessage` — the modal's React state keeps its own intact;
- guest → host: the guest page (`plugin-sandbox.html`) clones before transferring, both
  for a save and for `getBytes` — **your** array remains usable after the call.

The direct consequence, worth remembering: **no defensive `slice()` to write**. You pass
your `Uint8Array` to `saveBytes` and keep working with it; the bridge has already made
the copy. The corollary holds too: `initialBytes` is **your** copy, a snapshot taken at
mount — changing it changes nothing elsewhere, and nobody will change it behind your back.

## 5. The supply chain

The server is a byte relay **presumed hostile**. It holds no private key, so it cannot
attest to anything. The only truth is an Ed25519 signature made by the publisher over the
exact bytes of their manifest.

### What is signed, and what follows from it

```
signed bytes = UTF-8( "filarr.identity.sig.v1\n" + "filarr.plugin.manifest.v1\n" + manifestJson )
```

Two domain-separation prefixes: the identity one, prepended by `signWithIdentity` (in
Filarr, `userKeypair.ts`), and the manifest one (`pluginSigning.ts`). The worker rebuilds
**both** before verifying (`marketplace.ts`, `buildPluginManifestSignedBytes`). Domain
separation guarantees that a manifest signature cannot be replayed as a signature of
something else.

`manifestJson` is a **string**, end to end: a single `JSON.stringify`, at publish time
(`pluginSigning.ts`), and never again afterwards — not on the network, not in D1, not in
IndexedDB, not at load time. Re-serializing would mean re-signing something else: key
order, Unicode escaping and whitespace are all bytes, and bytes are what is signed.

**The bundle hash lives INSIDE the manifest** (`bundleHash`, lowercase hex sha256). A
single signature therefore covers the extension's identity, its version, its file
extensions **and the bytes of the bundle**. There is no second signature to manage, and
no window in which the manifest would be verified but not the code.

### At publish (server side)

`validatePublishBody` (in Filarr's worker, `marketplace.ts`) runs a pipeline whose
**order is the security** — the crypto speaks before the parser, the parser before
everything else:

1. typing of the body `{manifestJson, signature, bundleBase64}`;
2. manifest size **in UTF-8 bytes** ≤ 64 KiB (`.length` would count UTF-16 units and let
   an obese multibyte manifest through — `validatePublishBody`);
3. base64 decoding of the bundle, `1 ≤ size ≤ 4 MiB`;
4. reading the key **of the calling account** (`db.getUserKey`), with the algorithm gated
   to `x25519-ed25519` — **never** a key supplied in the body: the link between publisher
   and account is structural;
5. Ed25519 verification over the verbatim bytes;
6. `JSON.parse` — only now;
7. shape validation (slug, semver, `trust`, name, description, extensions…);
8. `sha256(bundle) === manifest.bundleHash`;
9. `computePublisherFingerprint(account key) === manifest.publisherFingerprint`.

Then R2 before D1 (`marketplace.ts`, route `POST /`): an orphaned object is harmless, a
row pointing at nothing is not.

The field-by-field detail is in `PUBLISHING.md`.

### At install (client side)

`installPlugin` (`installedPlugins.ts`, `installPlugin`) checks **before writing anything
at all**:

- **TOFU** (_trust on first use_): the public signing key is **pinned** at first install
  (`pluginStorage.InstalledPluginRecord.pinnedSignPublicKey`). An update signed by
  **another** key is refused with `publisher_key_changed` (`installedPlugins.ts`,
  `installPlugin`); only an explicit user gesture in front of a warning screen re-pins.
  Never a silent overwrite. The fingerprint shown is the **6 groups × 5 digits**
  rendering of SHA-256(public key) (`userKeypair.computeFingerprint`, mirrored on the
  server in `marketplace.ts`, `computePublisherFingerprint`) — something you can compare
  out loud.
- **Anti-rollback**: installing a version _lower_ than the one already present is refused
  (`version_rollback`, `installedPlugins.ts`, `installPlugin`), unless explicitly
  confirmed. A compromised server cannot push back a vulnerable version disguised as an
  “update”. Reinstalling the **same** version remains allowed — that is how a broken
  record gets repaired.
- **Full verification**: `verifyInstalledPlugin` (`pluginSigning.ts`), in order: (1)
  signature against the **pinned** key; (2) parse; (3) `manifest.id === requested slug`
  **and** `manifest.version === requested version`; (4) `sha256(bundle) === bundleHash`;
  (5) fingerprint; (6) `trust === 'sandboxed'`. Step (3) closes off substitution: a
  compromised server cannot serve, under slug A, the validly signed manifest of
  extension B.

### On EVERY load

`verifyAndRegister` (`installedPlugins.ts`, `verifyAndRegister`) replays the **entire**
verification at every application start, against the pinned key of the same record.

The reason is simple: IndexedDB can be modified by any XSS and by any local process. A
stored bundle is never presumed intact. Tampering with the bundle, the manifest or the
key results in the status `broken_signature` — **nothing is registered**, the extension
does not mount, and the interface offers to reinstall it.

### Immutable versions, soft unpublishing

A published version can **never** be replaced: republishing the same version string
returns `409 version_exists` (route `POST /:slug/versions`). Unpublishing is a
`status = 'unlisted'` (route `DELETE /:slug`): no R2 deletion, no version row erased.
Installed copies must be able to re-verify and reinstall — that is the flip side of “we
re-verify on every load”.

## 6. What a hostile extension can still do

This document would be dishonest if it did not say so (matrix taken from the header of
`sandboxHost.ts`). A malicious extension **can**:

- read, keep in memory and display the bytes of the **open** document;
- write arbitrary content into **that** document via `saveBytes` — unavoidable for an
  editor; the version lock and the encryption stay with the host, and revisions make the
  write reversible;
- burn CPU and memory in **its own** iframe.

It **can no longer**: talk to the network (CSP, WebRTC included), touch the host's DOM or
JS, read the application's cookies/localStorage/IndexedDB (opaque origin), obtain a
token/URL/`itemId`/`vaultId`/epoch/key (never transmitted), open another document,
navigate its frame elsewhere, or open windows or native modals.

The practical conclusion for the user is therefore: **installing an extension means
trusting its publisher with the documents you open with it** — not with your vault, not
with your account, not with your keys.

---

**Read next**: `API.md` for the contract your code must honor, `PUBLISHING.md` for the
publishing chain, `COLLAB-DESIGN.md` for what remains deliberately closed.
