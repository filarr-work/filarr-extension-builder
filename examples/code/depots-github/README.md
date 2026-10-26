# Dépôts GitHub (GitHub repositories, `.github`)

Follow GitHub repositories: stars, open issues, latest release — and what has
changed since the last check.

## What the example shows

**A secret the extension never sees.** The manifest declares an optional secret,
attached to the `authorization` header:

```json
"network": {
  "domains": ["api.github.com"],
  "secrets": [{ "id": "jeton_github", "label": "Jeton GitHub, sous la forme « Bearer ghp_… »", "header": "authorization" }]
}
```

What happens, regardless of the extension's good faith:

1. the user enters their token **in Filarr** (My extensions › Dépôts GitHub ›
   Secrets) — never in the extension;
2. Filarr sends it **once** to the main process, which seals it in the device's
   keychain (without a keychain, nothing is saved); after that, even Filarr's
   interface only knows "present";
3. on every request to `api.github.com`, the relay **adds the `authorization`
   header itself**. The extension does not read it, cannot set it (the host
   would refuse the request: `net_header`), and a redirect never carries it to
   another host;
4. the secret goes away on uninstall.

So the extension does not know whether a token is there — only its effects: a
higher rate limit (5,000 requests per hour instead of 60), or a 401 if GitHub
rejects it. The secret's text is put into the header **as is**: for GitHub, that
is `Bearer ` followed by the token (hence the label). A read-only token is
enough.

**The `network` capability, and its refusals.** Filarr shows every request to the
user before it leaves (method, address, headers, and the secrets that will be
added, by their label). A check costs **two** requests (the repository, then its
latest release): they go out one after the other, and "Refresh all" goes through
the repositories in sequence instead of piling up requests (Filarr keeps at most
four pending, then answers `busy`). Every failure has its own message
(`src/i18n.ts`): refusal (`net_refused`), web without a relay (`unavailable`),
offline, token rejected (401), GitHub rate limit (403 "rate limit", 429),
repository not found or private (404). A 404 from `/releases/latest` is not an
error: it means "no published release".

**What the file keeps.** The list of repositories and their last check — that is
what makes it possible to flag "new release since the last check". A check is
only written on a user action ("Refresh"), never on open. In read-only mode, you
can refresh: the result is displayed, the file does not change.

**What `network` rules out**: no `storage`, no `picker`, no `functions`, no
`noteBlock`. The extension reads nothing but the open file.

> ⚠ The network relay only exists in the **desktop** app; on the web, every
> request returns `unavailable`, and the extension says so.

## Build and check

```bash
npm run build && npm run check && npm run smoke && npm test
```

Nothing goes out on the network during verification: the test harness answers
with `exemples/reponses/*.json` (`smoke.json`, key `reseau`), including a 404 and
a rate limit. The tests check that no request carries the `authorization`
header.

## The files

```
src/index.ts      mount(), the checks, the list
src/github.ts     the two requests, reading the responses, GitHub's statuses
src/depots.ts     the .github format and repository names (pure)
src/i18n.ts       the texts, and the message for each failure
exemples/         a watch list of three repositories (one never checked), a new
                  (empty) file, and real API responses for the tests
```
