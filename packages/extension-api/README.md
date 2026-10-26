# @filarr/extension-api

Les types et les fonctions pour écrire une extension [Filarr](https://filarr.com) avec du code :
`defineExtension`, le contrat de l'hôte (`EditorHost` : octets du document, enregistrement,
lecture seule, thème), le manifeste, les capacités et le paquet `.filarrext`.

```bash
npm create filarr-extension@latest mon-extension
```

Le projet créé dépend déjà de ce paquet. Pour l'ajouter à la main :

```bash
npm install --save-dev @filarr/extension-api
```

```ts
import { defineExtension, type EditorHost } from '@filarr/extension-api';
```

Le guide, la ligne de commande et vingt exemples : [https://github.com/filarr-work/filarr-extension-builder](https://github.com/filarr-work/filarr-extension-builder).
