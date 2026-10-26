# Sous-titres (subtitles, `.srt`, `.vtt` import)

Edits SubRip subtitles: start and end times, text, global offset. Also opens
WebVTT files and converts them to `.srt`.

## What the example shows

**`imports: ["vtt"]`** — Filarr also opens `.vtt` files with this editor. The
original file is **never** rewritten: the first save creates a `.srt` next to it
(the host creates it, with the file's name and the editor's native extension).
So the editor reads two formats and writes only one (`src/srt.ts`). Whatever SRT
cannot express — positioning settings (`align:start`), `STYLE`, `NOTE` and
`REGION` blocks, `<v Alice>` voices — is counted and announced in a banner, never
passed over in silence; voices become "Alice: …", and the `<i>`, `<b>`, `<u>`
tags are kept.

**`functions.extractText`** — Filarr's local search finds a cue by what is
**said**: no numbers, no timings, no tags. Searching for "serrurier" finds the
file; searching for "00:00:12" finds nothing.

**`functions.exports`** — "Export as text" produces a transcript in paragraphs
(a silence of more than two seconds starts a new one), "Export as JSON" the cues
with their timings (milliseconds and `HH:MM:SS,mmm`).

**Validate without correcting.** A time is validated when the field loses focus
(or on Enter), not on every keystroke; an unreadable time stays displayed, marked
`aria-invalid`, with the expected format. An end before the start, or an overlap
with the next cue, is flagged under the row — an overlap can be intentional, it
is up to the user to decide.

**The keyboard.** Alt+↑/↓: same field, previous or next cue.
Ctrl+Enter: insert a cue after this one, in the gap that follows.

And the contract of any editor: new (empty) document, read-only, `onDirty`,
autosave at 2 s, rejection codes, total `getBytes` (always SRT, even for an
imported `.vtt`), `destroy`, theme, language.

## Capabilities

```json
"capabilities": {
  "imports": ["vtt"],
  "functions": {
    "extractText": true,
    "exports": [{ "to": "txt", "label": "Transcription (texte)" }, { "to": "json", "label": "Répliques en JSON" }]
  }
}
```

`imports` must be disjoint from `extensions` (Filarr's validator checks it). The
functions also accept a `.vtt`: the parser recognizes the format by its content
(`WEBVTT`) as well as by its name.

## The written format

Canonical: blocks numbered from 1, separated by a blank line, times as
`HH:MM:SS,mmm`. The byte order mark and `\r\n` line endings (very common in SRT)
are kept: a well-formed file reads back and rewrites byte for byte. A blank line
inside a text is removed — it would split the block.

## Build and check

```bash
npm run build && npm run check && npm run smoke && npm test
```

## The files

```
src/index.ts       mount(), the wiring
src/srt.ts         read SRT and WebVTT, write SRT (pure)
src/operations.ts  insert, delete, shift, sort, validate (pure)
src/fonctions.ts   spoken text, transcript, JSON — the pure functions
src/vue.ts         the list of cues, the keyboard
exemples/          a short film with CRLF line endings, an interview with a BOM,
                   a conference talk in WebVTT (voices, styles, settings, notes)
```
