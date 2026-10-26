# @filarr/extension-cli

`filarr-ext`, the command line for [Filarr](https://filarr.com) extensions:

| Command | What it does |
| --- | --- |
| `filarr-ext dev` | the local simulator, reloaded on every save |
| `filarr-ext build` | builds `dist/bundle.js` |
| `filarr-ext check` | the checks the server and Filarr will run |
| `filarr-ext pack` | the `.filarrext` package, read back before it is written |
| `filarr-ext verify <package>` | reads back and checks a package |
| `filarr-ext publish <package>` | opens Filarr for desktop on the Publish screen |

It never asks for a password or a key: signing happens in Filarr, on your
device.

```bash
npm create filarr-extension@latest my-extension
cd my-extension
npm install
npm run dev
```

Outside a project (a package downloaded from Filarr Builder, for example):
`npx @filarr/extension-cli verify <package>` or `npx @filarr/extension-cli publish <package>`.

Note: the tool's messages are currently in French.

All options: [docs/cli.md](https://github.com/filarr-work/filarr-extension-builder/blob/main/docs/cli.md).
