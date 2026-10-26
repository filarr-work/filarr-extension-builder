# Reviews and active installs — contract

> **Frozen on 2026-10-23.** Producer: the worker (`/marketplace`, migration `0124`).
> Consumer: the desktop and web marketplace. Additive only: no existing route changes
> shape, and an older client ignores the new fields.

## What the server knows, and does not know

The server sees no content. It already knows who downloads which package (the bundle
route is authenticated). It now keeps one row per account and per extension
(`marketplace_installs`: first and last download, latest version), which serves two
purposes only:

- **active installs**: distinct accounts that downloaded the extension in the last
  30 days (an update, a reinstall or a new device refreshes the date);
- **the right to leave a review**: only an account that downloaded the extension can
  leave one, and never the extension's own author.

A download to TRY without installing (`GET …/bundle?purpose=trial`) is not counted:
no active install, no right to review, nothing added to the download counter.
Organization rules apply to it just as they do to an install.

## The added fields

On every catalog row (`GET /marketplace`) and on the listing page
(`GET /marketplace/:slug`):

| Field              | Type             | Meaning                                                             |
| ------------------ | ---------------- | ------------------------------------------------------------------- |
| `ratingAverage`    | `number \| null` | average to one decimal place, `null` when there are no reviews      |
| `ratingCount`      | `number`         | number of reviews                                                   |
| `activeInstalls`   | `number`         | distinct accounts active over 30 days                               |
| `extensions`       | `string[]`       | (catalog) file types opened by the latest version — UNSIGNED mirror |
| `capabilityKeys`   | `string[]`       | (catalog) capability keys of the latest version — UNSIGNED mirror   |
| `networkDomains`   | `string[]`       | (catalog) declared network domains — UNSIGNED mirror                |
| `firstPublishedAt` | `string \| null` | (catalog) date of the first version                                 |

The mirrors serve catalog sorting, filters and suggestions without downloading every
listing page; like the name and the description, they prove nothing. The listing page
and installation read and verify the signed manifest.

## The routes

| Route                                            | Body / query                                                 | Response                                            |
| ------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------- |
| `GET /marketplace/:slug/reviews`                 | `?filter=all\|current\|critical&offset=&limit=` (20 at most) | `{ summary, reviews, mine, canReview }`             |
| `PUT /marketplace/:slug/reviews`                 | `{ rating: 1..5, body: string ≤ 2000 }`                      | `{ review }` — creates or replaces the caller's own |
| `DELETE /marketplace/:slug/reviews`              | —                                                            | `{}` — removes the caller's own                     |
| `PUT /marketplace/:slug/reviews/:reviewId/reply` | `{ body: string ≤ 2000 }` (empty = remove)                   | `{ review }` — the extension's author only          |

- `summary`: `{ count, average, distribution: [n1, n2, n3, n4, n5] }`.
- A review: `{ id, rating, body, version, createdAt, updatedAt, reviewer: { name, handle } | null, reply: { body, at } | null }`.
  `version` is the latest version downloaded by the reviewer, read by the server, never
  declared by the client. `reviewer` comes from the reviewer's public author profile if
  they have one (opt-in, `profil-auteur-marketplace` contract); otherwise `null`, shown
  as "Filarr member". No address and no account identifier is ever served.
- `filter=current`: reviews of the current version; `critical`: ratings 1 and 2.
- `canReview`: true if the caller downloaded the extension and is not its author.

Refusals: `review_not_allowed` (403, no install or own extension), `bad_review` (400),
`not_owner` (403, reply by someone other than the author), `rate_limited` (429, 20 writes
per day per account).

The text is plain text: rendered without HTML, like the rest of the listing page.
