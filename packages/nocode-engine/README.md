# @filarr/nocode-engine

The no-code engine for [Filarr](https://filarr.com) extensions: it reads a file (JSON, CSV,
lines, `key: value`), displays it with blocks and writes it back, according to a configuration
(`nocode.json`). It never executes anything it reads and inserts no HTML.

This package is used by `filarr-ext` and Filarr Builder; to create a no-code extension:

```bash
npm create filarr-extension@latest my-recipes -- --template nocode
```

The configuration schema and the list of blocks: [docs/nocode.md](https://github.com/filarr-work/filarr-extension-builder/blob/main/docs/nocode.md).
