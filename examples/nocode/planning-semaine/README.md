# 🗓️ Planning de la semaine (weekly planner) — no-code example

`.semaine` files. One week per file: one section per day, each with its own task checklist, and the week’s progress.

## What it shows

Shows **sections**: one per day (the weekend collapsed by default), each with its own progress bar
and its own **checklist**. The seven lists are seven fields of the same JSON document; adding a task
on Monday touches nothing else.

Not a single line of code: everything is in [`nocode.json`](nocode.json), read by Filarr’s no-code
engine (see [docs/nocode.md](../../../docs/nocode.md)). The files in [`exemples/`](exemples/) open in
the simulator.

## Building it

From the repository root:

```bash
npm install
npm run check -w @filarr-examples/planning-semaine   # the server’s and Filarr’s checks
npm run pack -w @filarr-examples/planning-semaine    # dist/planning-semaine-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/planning-semaine  # the simulator, at http://127.0.0.1:5199
```

You hand the package to Filarr by dropping it into **Marketplace › Publish**, or, with Filarr for
desktop: `npx filarr-ext publish examples/nocode/planning-semaine/dist/planning-semaine-1.0.0.filarrext`. Signing
happens in Filarr, after review.
