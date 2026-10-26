# Météo (weather, `.meteo` and home widget)

Follow the weather in your cities, and show one of them on Filarr's Home page.
Forecasts come from [Open-Meteo](https://open-meteo.com), with no API key.

## What the example shows

**The `network` capability, to a single domain.** The extension only talks to
`api.open-meteo.com`, through `host.network.request(…)`. It has no direct network
access (the page's CSP blocks `fetch`): every request goes through Filarr's
relay, which **shows it to the user** before sending it — method, full address,
headers, body. An identical request already accepted during the session goes
through without asking again; that is why the address is **stable**
(`src/openmeteo.ts`: coordinates rounded to 4 decimal places, parameters in a
fixed order) — the widget, which refreshes every thirty minutes, asks for
nothing again.

**Ask for as little as possible.** The city directory is bundled
(`src/villes.ts`): no second domain, and what the user types into the search
never leaves. A city that is missing can be entered by its coordinates. The
editor sends **no** request on open: only when you click "Show weather" (or
"Refresh all", which sends the requests one at a time rather than piling up more
than four, beyond which Filarr answers `busy`).

**Every refusal has its message** (`src/i18n.ts`, `messageEchec`) — this is not
the extension failing, it is the contract:

| Case | Code | What the extension says |
| --- | --- | --- |
| Capability not granted | `host.network` absent | Internet access was not granted |
| The user refuses (or blocks the extension for the session) | `net_refused` | request declined, nothing was sent; the widget stops refreshing on its own and offers "Retry" |
| **Web**: no network relay | `unavailable` | only available in the desktop app |
| Offline, host unreachable | `net_unreachable` | service unreachable |
| Too many pending requests | `busy`, `rate_limited`, `too_many_requests` | retry in a moment |
| An HTTP status ≠ 200 | (a response, not a rejection) | the service answered with an error (n) |

**The response is read as hostile**: only verified numbers are kept from it. And
the weather is **never written** to the file: the document only keeps cities and
coordinates.

**The `homeWidget` capability** (`src/widget.ts`). The widget is mounted in
`widget` mode, **always read-only**, and its only data is the setting entered in
the home block's options (240 characters at most, as UTF-8 in
`host.initialBytes`): `Lyon`, `45.764, 4.8357` or `Chez moi | 45.76 | 4.83`. It
does not read the `.meteo` file — the editor shows, for each city, the setting to
copy over. The widget has `host.network` too (same capability, same consent).

**What `network` rules out.** A network extension can declare neither `storage`,
nor `picker`, nor `functions`, nor `noteBlock` (`network_exclusive`): it never
reads your files AND never talks to the Internet without you. Hence no thumbnail
or search for these files: that is intentional.

> ⚠ State of Filarr as of October 23, 2026: the network relay only exists on
> **desktop** (on the web, `unavailable`). The home widget component is ready,
> but the `extension` type only enters the home block registry once the mobile
> app is ready to preserve it: the widget mounts and is tested here
> (`npm run smoke`); it cannot yet be added from the Home page.

## Capabilities

```json
"capabilities": {
  "network": { "domains": ["api.open-meteo.com"] },
  "homeWidget": { "label": "Météo" }
}
```

Domains: exact hosts, lowercase, HTTPS implied, subdomains refused —
`geocoding-api.open-meteo.com` would be another domain, to be declared
separately.

## Build and check

```bash
npm run build && npm run check && npm run smoke && npm test
```

Nothing goes out on the network during verification: the test harness answers
with `exemples/reponses/*.json` (`smoke.json`, key `reseau`), and also plays the
web (`unavailable`), a refusal (`net_refused`) and an empty setting.

## The files

```
src/index.ts      the two entry points: editor and widget
src/editeur.ts    the followed cities, weather on demand
src/widget.ts     the home block
src/client.ts     a request through host.network, and its refusals
src/openmeteo.ts  the address, the response, the weather codes (pure)
src/meteo.ts      the .meteo format and the widget setting (pure)
src/villes.ts     the bundled directory (pure)
exemples/         followed cities, a chalet given by its coordinates,
                  and two Open-Meteo responses for the tests
```
