# @filarr/extension-api

Types and functions for writing a [Filarr](https://filarr.com) extension with code:
`defineExtension`, the host contract (`EditorHost`: document bytes, saving,
read-only mode, theme), the manifest, capabilities and the `.filarrext` package.

```bash
npm create filarr-extension@latest my-extension
```

The created project already depends on this package. To add it by hand:

```bash
npm install --save-dev @filarr/extension-api
```

```ts
import { defineExtension, type EditorHost } from '@filarr/extension-api';
```

The guide, the command line and twenty examples: [https://github.com/filarr-work/filarr-extension-builder](https://github.com/filarr-work/filarr-extension-builder).
