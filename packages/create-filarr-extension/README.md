# create-filarr-extension

Creates a [Filarr](https://filarr.com) extension project, with or without code, ready to pass
`filarr-ext check` as is.

```bash
npm create filarr-extension@latest <name> [-- options]
```

| Option | Effect |
| --- | --- |
| `--template texte\|json\|binaire\|nocode` | the template (default: texte) |
| `--lang ts\|js` | the language of the code templates (default: ts) |
| `--ext <extension>` | the file type, without the dot (default: derived from the name) |
| `--name "<display name>"` | the extension's name |
| `--yes` | no questions |

Then `cd <name>`, `npm install`, `npm run dev` (the simulator), `npm run check`, `npm run pack`. The guide and twenty
examples: [https://github.com/filarr-work/filarr-extension-builder](https://github.com/filarr-work/filarr-extension-builder).
