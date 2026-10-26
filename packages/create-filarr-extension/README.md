# create-filarr-extension

Crée un projet d'extension [Filarr](https://filarr.com), avec ou sans code, prêt à passer
`filarr-ext check` tel quel.

```bash
npm create filarr-extension@latest <nom> [-- options]
```

| Option | Effet |
| --- | --- |
| `--template texte\|json\|binaire\|nocode` | le modèle (défaut : texte) |
| `--lang ts\|js` | le langage des modèles avec code (défaut : ts) |
| `--ext <extension>` | le type de fichier, sans point (défaut : tiré du nom) |
| `--name "<nom affiché>"` | le nom de l'extension |
| `--yes` | aucune question |

Puis `npm install`, `npm run dev` (le simulateur), `npm run check`, `npm run pack`. Le guide et vingt
exemples : [https://github.com/filarr-work/filarr-extension-builder](https://github.com/filarr-work/filarr-extension-builder).
