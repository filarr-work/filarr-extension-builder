# No-code extensions

A no-code extension is **a configuration**, `nocode.json`, read by Filarr's **no-code engine**
(`@filarr/nocode-engine`). The engine is the same for every no-code extension; the configuration
says which file format to read, which fields it contains and how to show them. It contains no code,
no HTML, no CSS: keys, types and labels.

```text
my-extension/
├── filarr.extension.json   the manifest, the listing, and  "build": { "kind": "nocode", "config": "nocode.json" }
├── nocode.json             the configuration (this document)
└── exemples/               the files the simulator opens
```

`filarr-ext build` produces the bundle: the engine, then its last two lines (the
[`PACKAGE.md`](contract/PACKAGE.md) §4 contract):

```js
/* filarr-nocode engine=1.0.0 */
globalThis.__filarrNocodeBoot({"nocode":1,"id":"…", …});
```

Filarr reads the configuration back between `__filarrNocodeBoot(` and `);` with `JSON.parse`,
without evaluating it, to show it to you for review before signing. The `.filarrext` package also
carries `nocode.json`, **identical** byte for byte to this line.

## Contents

1. [What the engine guarantees](#1-what-the-engine-guarantees)
2. [The root](#2-the-root)
3. [Formats](#3-formats)
4. [Fields](#4-fields)
5. [View blocks](#5-view-blocks)
6. [Computations](#6-computations)
7. [Pure functions](#7-pure-functions)
8. [The matching manifest](#8-the-matching-manifest)
9. [Complete examples](#9-complete-examples)
10. [All limits in one table](#10-all-limits-in-one-table)

---

## 1. What the engine guarantees

These guarantees are held by the engine, for every no-code extension, and verified by its tests
(`packages/nocode-engine/test/`):

- **No interpreted HTML.** All display goes through `createElement` and `textContent`. The engine
  never uses `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval` or `new Function` — the
  `security.test.ts` test reads the bundle back to make sure. A value `<img src=x onerror=…>`
  displays as those characters, nothing more.
- **Bounded reading.** A file larger than 8 MiB, nested more than 12 levels deep, that is not UTF-8,
  or that contains a `__proto__`, `constructor` or `prototype` key (JSON at any depth, CSV header,
  key in a “key: value” line) is not opened: an error screen says so, and the file **is never
  rewritten**.
- **What is not displayed is written back as is.** Unknown JSON keys, extra CSV columns, comment
  lines, malformed list items: none of it is touched. An unmodified CSV or “key: value” line goes
  back byte for byte; a modified line changes only the edited value. As long as nothing has been
  touched, `getBytes()` returns the bytes it received.
- **Read-only, enforced by the engine.** When Filarr opens the document read-only, all controls are
  inert **and** the engine refuses any write at the source: no `saveBytes`, no `onDirty`. A JSON
  document in which a key appears twice, or in which a number would lose digits when read back, is
  opened read-only for the same reason.
- **Empty file = new (empty) document**, built with the default values (`default`).
- **No network, no storage.** The engine does not need them: `filarr-ext check` rejects a no-code
  configuration whose manifest would request `network`, `storage`, `picker`, `collab`,
  `noteBlock` or `homeWidget`.
- **Saving**: automatic after 2 s (never sooner), `Ctrl`/`Cmd`+`S` to force it; a version conflict
  (`item_version_conflict`) is shown and suspends automatic saving.
- **Filarr's theme and language.** The engine reads the `--color-*` variables that Filarr sets on
  the page and follows theme changes; it speaks French or English, following Filarr.
- **Strict validation, twice.** The configuration is validated at build time **and** at mount time,
  against a **closed list**: an unknown property (a typo such as `placholder`) is an error, not an
  ignored setting. A configuration rejected at mount time produces a readable message in Filarr's
  banner, never a half-working editor.

## 2. The root

```json
{
  "nocode": 1,
  "id": "carnet-recettes",
  "format": { "type": "json" },
  "accent": "#c2410c",
  "fields": [ … ],
  "view": [ … ],
  "functions": { … }
}
```

| Property    | Required    | Value                                                                                                 |
| ----------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| `nocode`    | yes         | `1` — the format of this configuration                                                                |
| `id`        | yes         | The identifier of the **manifest** (`^[a-z][a-z0-9-]{1,63}$`): the editor is mounted as `<id>-editor` |
| `format`    | yes         | The file format (§3)                                                                                  |
| `fields`    | yes         | The document's fields (§4)                                                                            |
| `view`      | yes         | The blocks shown, in order (§5), at least 1                                                           |
| `accent`    | no          | A `#rrggbb` color: buttons, checkboxes, stars, bars. Absent: Filarr's primary color                   |
| `functions` | no          | The pure functions the engine exposes (§7)                                                            |
| `$schema`   | no          | A URL, ignored by the engine (for your editor)                                                        |

**Labels** (`label`, `placeholder`, `title`, `addLabel`, `unit`…) are a string, or one string per
language: `{ "fr": "Portions", "en": "Servings" }`. French is the fallback. 1 to 200 characters
(20 for `unit`), with no invisible character.

## 3. Formats

### `json` — a JSON object

```json
{ "type": "json", "indent": 2 }
```

The root of the file is an object; the fields are its properties. `indent` (`0`, `2`, `4` or
`"tab"`) only applies to **new** documents: an existing file keeps its indentation, its line endings
and its leading and trailing whitespace.

> `JSON.stringify` rewrites a number in its short form (`1.0` becomes `1`) and moves keys that look
> like integers to the front: the **value** is the same, the text may differ. A number that would
> lose digits (`12345678901234567890`) opens the document read-only.

### `csv` — a table

```json
{ "type": "csv", "delimiter": ";" }
```

The first non-empty line is the header; the **fields are the columns** (`key` = column name). The
document is a list of rows, called **`rows`**: the `table`, `total`, `progress` and `checklist`
blocks target it when no `field` is given.

- `delimiter`: `","` (default), `";"` or `"\t"`. With `";"`, numbers are written with a decimal
  comma (`6,90`), like a spreadsheet set to French; `decimal` (on a `number` field) overrides this
  choice.
- Doubled quotes, line breaks inside a cell, UTF-8 byte order mark and `\r\n` line endings: read and
  written back.
- A column that is declared but missing from the file is added on the first write that fills it.
- Allowed types: the **single-value** types (`text`, `longtext`, `number`, `boolean`, `date`, `url`,
  `email`, `choice`, `tags`, `rating`) — no `list`, `object` or `textlist`.

### `lines` — a checklist in plain text

```json
{ "type": "lines" }
```

A line `[ ] lait` or `[x] pain` is an item (a `-`, `*` or `+` bullet and leading indentation are
allowed, and kept). Any other line — heading, note, blank line — stays where it is. The document is
a list called **`items`**, whose items have two fixed fields: `done` (`boolean`) and `text`
(`text`). `fields` can set their label and placeholder:

```json
"fields": [{ "key": "text", "type": "text", "label": "Article", "placeholder": "Ajouter un article" }]
```

### `keyvalue` — one value per line

```json
{ "type": "keyvalue", "separator": ":", "mode": "fields" }
```

Lines `key: value` (or `key = value` with `"separator": "="`). Blank lines and comments (`#`, `;`,
`//`) are kept; a value fits on **one** line (a typed line break becomes a space, hence no
`longtext`).

- `mode: "fields"` (default): the fields are **keys** of the file. A key's first occurrence is the
  one that counts; unknown keys and duplicates stay as they are. A modified line keeps its original
  prefix (`nom:   `); a missing key is appended at the end of the file.
- `mode: "entries"`: **all** the pairs form a list called **`entries`**, whose items have two fixed
  fields: `key` (`text`) and `value` (`text`, `url` or `email`). They are edited in a `table`:
  rename, add, remove. This is the format for a glossary.

## 4. Fields

```json
{ "key": "portions", "type": "number", "label": "Portions", "min": 1, "max": 50, "default": 4 }
```

| Property      | For             | Value                                                                                                |
| ------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| `key`         | all             | The key in the file: 1 to 64 characters, no dot (it separates paths), no invisible character; never `__proto__`, `constructor`, `prototype`. Unique at its level |
| `type`        | all             | See below                                                                                            |
| `label`       | all             | The label shown (default: the key)                                                                   |
| `default`     | all             | The value in a new document or an added item, **of the field's type**                                |
| `placeholder` | texts, numbers  | The hint shown in an empty field                                                                     |
| `min`, `max`, `step` | `number` | The bounds and the step (the − / + buttons respect them)                                             |
| `unit`        | `number`        | A unit shown after the value (`min`, `€`)                                                            |
| `decimals`    | `number`        | The number of decimals shown (0 to 6)                                                                |
| `decimal`     | `number`        | In `csv` and `keyvalue`, the decimal separator written: `","` or `"."`                               |
| `max`         | `rating`        | The number of stars, 1 to 10 (default 5)                                                             |
| `options`     | `choice`        | 1 to 50 options `{ "value", "label"?, "color"? }` (`color` as `#rrggbb` tints the badge)             |
| `trueValue`, `falseValue` | `boolean` | In `csv` and `keyvalue`, the text written for true and for false (default `true` / `false`) |
| `separator`   | `tags`          | In `csv` and `keyvalue`, the tag separator (default `,`)                                             |
| `fields`      | `list`, `object`| The fields of an item, or the sub-fields                                                             |

A property that makes no sense for the type (`options` on a `text`) is rejected.

| Type       | Value in JSON               | Control shown                                                 |
| ---------- | --------------------------- | ------------------------------------------------------------- |
| `text`     | string                      | Single-line field                                             |
| `longtext` | string                      | Text area                                                     |
| `number`   | number                      | Number field, − / + on request                                |
| `boolean`  | `true` / `false`            | Checkbox                                                      |
| `date`     | `"YYYY-MM-DD"`              | Date picker (an unreadable date stays displayed as text)      |
| `url`      | string                      | Field, plus an **Open** link if it starts with `http(s)://`   |
| `email`    | string                      | Field, plus a **Write** link (`mailto:`) if the address is well formed |
| `choice`   | string (one of the `value`s) | Drop-down list; a value in the file that is not an option stays selected and intact |
| `tags`     | list of strings             | Tags: Enter or comma to add, × to remove                      |
| `rating`   | integer from 0 to `max`     | Stars; clicking the selected star clears the rating           |
| `textlist` | list of strings             | For the `steps` block                                         |
| `list`     | list of objects             | For `checklist`, `table`, `cards`, `steps`                    |
| `object`   | object                      | Sub-fields, targeted by a `parent.child` path                 |

At most three levels of `list` / `object`. A value of a type other than the expected one shows as
empty and stays **intact** as long as the user does not edit that particular field.

**Links** are never `javascript:`, `data:` or `file:`: only `http:`, `https:` and `mailto:` become
clickable.

## 5. View blocks

`view` is the list of blocks shown from top to bottom. A block targets fields **at its own level**:
the document root, or a list item for blocks placed in a card (`cards`). A path `a.b` goes through
an `object` field. Every reference is checked during validation: a block that targets a missing
field, or a field of a type it cannot display, is rejected.

| Block       | Properties                                                         | Targets                                |
| ----------- | ------------------------------------------------------------------ | -------------------------------------- |
| `title`     | `field`, `placeholder`?                                            | `text`, `longtext`                     |
| `badges`    | `items`: 1 to 12 `{ field, label?, stepper? }`                     | a single value (except `longtext`, `tags`) |
| `checklist` | `field`?, `check`?, `text`?, `label`?, `addLabel`?                 | `list` (checkbox + text)               |
| `steps`     | `field`, `text`?, `label`?, `addLabel`?                            | `textlist`, or `list` (text)           |
| `longtext`  | `field`, `label`?, `rows`? (2 to 30)                               | `text`, `longtext`                     |
| `number`    | `field`, `label`?                                                  | `number` (with − / +)                  |
| `table`     | `field`?, `columns`? (1 to 16), `label`?, `addLabel`?              | `list` (columns: a single value)       |
| `tags`      | `field`, `label`?                                                  | `tags`                                 |
| `date`      | `field`, `label`?                                                  | `date`                                 |
| `link`      | `field`, `label`?                                                  | `url`, `email`                         |
| `rating`    | `field`, `label`?                                                  | `rating`, `number`                     |
| `fields`    | `fields`: 1 to 32 paths, `label`?                                  | a single value each: a form            |
| `section`   | `title`, `blocks`, `collapsed`?                                    | — (a collapsible group)                |
| `cards`     | `field`, `blocks`, `label`?, `addLabel`?                           | `list`: one card per item              |
| `progress`  | `field`?, `check`? — or `field` + `max` / `maxField`, `label`?     | `list` + checkbox, or a number         |
| `total`     | `label`, `compute`, `unit`?, `decimals`?                           | a computation (§6)                     |

Details:

- **`field` omitted** (`checklist`, `table`, `progress`): the format's implicit list (`rows`,
  `items`, `entries`). For a JSON document, `field` is required.
- **`check` / `text` omitted** (`checklist`, `steps`, `progress`): the items' first `boolean` field,
  and their first `text` / `longtext` field.
- **`stepper`** (in `badges`): − / + buttons for a `number` field.
- **`progress`**: on a list, checked / total; on a number, the value out of `max` (a number) or out
  of `maxField` (another number field: hit points out of their maximum).
- **`checklist`, `steps`, `table`, `cards`** add, remove and reorder (↑ ↓ ×); an added item takes
  the `default`s of its fields. In read-only mode, these buttons do not exist.
- **`section`** and **`cards`** nest, four levels at most; 100 blocks per level, 300 in total.

## 6. Computations

`total` (and the computed columns of `functions.fields`) apply **one operation from a closed list**
to declared fields — never a written formula: that would be code.

```json
{ "op": "sumProduct", "field": "articles", "of": ["quantite", "prix"] }
```

| `op`           | On a list (`field`, or the implicit list)               | At the current level (`of` = fields of that level) |
| -------------- | ------------------------------------------------------- | ------------------------------------------- |
| `count`        | The number of items                                     | The number of non-empty fields in `of`      |
| `countChecked` | The items whose `of` checkbox is checked                | The checked checkboxes in `of`              |
| `sum`          | The sum of the items' `of` number                       | The sum of the numbers in `of`              |
| `avg`, `min`, `max` | The average, the minimum, the maximum of `of`      | The same over the fields in `of`            |
| `sumProduct`   | The sum, item by item, of the product of 2 to 4 numbers | The product of the fields in `of`           |

The mode is decided as follows: `field` present → on the list; otherwise, for a format with an
implicit list, if `of` names no root field → on the implicit list; otherwise → at the current
level. An empty value is ignored (an average with no value shows “—”).

## 7. Pure functions

Filarr calls these functions on files **it** chooses, in a page with no API at all (the manifest's
`functions` capability, [CAPABILITIES.md](contract/CAPABILITIES.md) tier 2). The engine exposes them
only if the configuration declares them:

```json
"functions": {
  "extractText": true,
  "fields": [
    { "key": "portions", "field": "portions" },
    { "key": "valeur", "compute": { "op": "sumProduct", "of": ["quantite", "prix"] } }
  ],
  "exports": [{ "to": "md" }, { "to": "csv", "field": "ingredients" }]
}
```

- **`extractText`** — for Filarr's local search. `true`: the text of every field (choice labels,
  tags and lists included; not numbers); `{ "fields": [...] }`: only those. 100,000 characters at
  most.
- **`fields`** — the columns of Filarr's folder table. `key` is the key **in the manifest**
  (`^[a-z][a-z0-9_]{0,31}$`); the value is a field read as is (`field`) or a computation
  (`compute`). The rendered type: `number`/`rating` → `number`, `boolean` → `checkbox`, `date` →
  `date`, `url` → `url`, everything else → `text` (a choice's label, the tags joined); a
  computation → `number`.
- **`exports`** — “Export as …” in the file menu, 1 to 4 targets:
  - `json`: the document itself for a JSON format (nothing is lost), otherwise its declared fields;
  - `csv`: the file itself for a CSV; the `field` list (or the implicit list) as columns;
    otherwise two columns, field and value;
  - `md`, `txt`, `html`: the flattened view — headings, badges, checkboxes, steps, tables. The HTML
    is a standalone document, every text escaped, with no script and no external resource.

An unreadable document makes the call fail with a code (`document_forbidden_key`…): Filarr falls
back on what it does without the extension.

## 8. The matching manifest

The manifest (`filarr.extension.json` › `manifest`) is what the user **accepts**; the configuration
is what the engine **does**. `filarr-ext check` verifies that they say the same thing:

| In `nocode.json`                         | In `manifest.capabilities`                                        |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `id`                                     | `manifest.id` (error if they differ)                              |
| `functions.extractText`                  | `functions.extractText: true`                                     |
| `functions.fields[i].key`                | `functions.fields[i]` `{ key, label, type }` — same key, same type |
| `functions.exports[i].to`                | `functions.exports[i]` `{ to, label }`                            |

A function declared in the manifest but missing from the configuration is an **error** (Filarr
would call it); the reverse is a warning (Filarr will not call it). A **starter template**
(`newDocument[].seed`, in base64 — `npx filarr-ext seed modele.ext` computes it) must open with the
configuration. A `maxBytes` above 8 MiB is pointless: the engine does not open anything larger.

## 9. Complete examples

The ten examples in [`examples/nocode/`](../examples/nocode/) pass `filarr-ext check` and `pack`;
each has its own `README.md`. Three complete configurations, to get started:

### A shopping list (`lines`)

```json
{
  "nocode": 1,
  "id": "liste-courses",
  "format": { "type": "lines" },
  "accent": "#16a34a",
  "fields": [{ "key": "text", "type": "text", "label": "Article", "placeholder": "Ajouter un article" }],
  "view": [
    { "type": "progress", "label": "Dans le panier" },
    { "type": "checklist", "label": "À acheter", "addLabel": "Un article" }
  ]
}
```

### An inventory (`csv`), with totals and an export

```json
{
  "nocode": 1,
  "id": "inventaire",
  "format": { "type": "csv", "delimiter": ";" },
  "fields": [
    { "key": "article", "type": "text", "label": "Article" },
    { "key": "quantite", "type": "number", "label": "Quantité", "min": 0, "default": 1 },
    { "key": "prix", "type": "number", "label": "Prix unitaire", "decimals": 2, "unit": "€" }
  ],
  "view": [
    { "type": "table", "addLabel": "Ajouter un article" },
    { "type": "total", "label": "Articles", "compute": { "op": "sum", "of": "quantite" } },
    { "type": "total", "label": "Valeur", "compute": { "op": "sumProduct", "of": ["quantite", "prix"] }, "decimals": 2, "unit": "€" }
  ],
  "functions": { "exports": [{ "to": "csv" }] }
}
```

and in the manifest: `"capabilities": { "functions": { "exports": [{ "to": "csv", "label": "CSV" }] } }`.

### A reading log (`json`), as cards

```json
{
  "nocode": 1,
  "id": "journal-lecture",
  "format": { "type": "json" },
  "fields": [
    { "key": "titre", "type": "text", "label": "Journal" },
    {
      "key": "livres", "type": "list", "label": "Livres",
      "fields": [
        { "key": "titre", "type": "text", "label": "Titre" },
        { "key": "auteur", "type": "text", "label": "Auteur" },
        { "key": "statut", "type": "choice", "label": "Statut", "default": "a_lire",
          "options": [
            { "value": "a_lire", "label": { "fr": "À lire", "en": "To read" }, "color": "#64748b" },
            { "value": "lu", "label": { "fr": "Lu", "en": "Read" }, "color": "#16a34a" }
          ] },
        { "key": "note", "type": "rating", "label": "Note", "max": 5 }
      ]
    }
  ],
  "view": [
    { "type": "title", "field": "titre" },
    { "type": "total", "label": "Note moyenne", "compute": { "op": "avg", "field": "livres", "of": "note" }, "decimals": 1 },
    { "type": "cards", "field": "livres", "addLabel": "Ajouter un livre",
      "blocks": [
        { "type": "title", "field": "titre" },
        { "type": "badges", "items": [{ "field": "statut" }, { "field": "auteur" }] },
        { "type": "rating", "field": "note" }
      ] }
  ]
}
```

## 10. All limits in one table

| Limit                                   | Value                                       |
| --------------------------------------- | ------------------------------------------- |
| `nocode.json`                           | 256 KiB ([PACKAGE.md](contract/PACKAGE.md)), 12 levels of nesting |
| Fields                                  | 64 per level, 256 in total, 3 levels of `list` / `object` |
| Blocks                                  | 100 per level, 300 in total, 4 levels of `section` / `cards` |
| Badges (`badges`)                       | 12                                          |
| Columns (`table`)                       | 16                                          |
| Options (`choice`)                      | 50                                          |
| Labels                                  | 1 to 200 characters (`unit`: 20)            |
| Default values                          | texts of 10,000 characters, lists of 1,000 items |
| Open document                           | 8 MiB, 12 levels, UTF-8                     |
| `extractText`                           | 100,000 characters                          |
| `functions.fields`                      | 32 columns, text of 500 characters          |
| `functions.exports`                     | 4 targets among `md`, `txt`, `html`, `csv`, `json` |
