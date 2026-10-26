# @filarr/extension-devhost

The local simulator for [Filarr](https://filarr.com) extensions, launched by `filarr-ext dev`:
your extension runs in the same sandbox page as in Filarr, with the same headers,
reloaded on every save. Theme, read-only mode, simulated conflict, log of exchanges with
the host.

It is used through the command line, in a project created with `npm create filarr-extension`, after `npm install`:

```bash
npx filarr-ext dev
```

See [docs/cli.md](https://github.com/filarr-work/filarr-extension-builder/blob/main/docs/cli.md).
