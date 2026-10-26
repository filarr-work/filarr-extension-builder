# @filarr/extension-cli

`filarr-ext`, la ligne de commande des extensions [Filarr](https://filarr.com) :

| Commande | Ce qu'elle fait |
| --- | --- |
| `filarr-ext dev` | le simulateur local, rechargé à chaque sauvegarde |
| `filarr-ext build` | construit `dist/bundle.js` |
| `filarr-ext check` | les contrôles que feront le serveur et Filarr |
| `filarr-ext pack` | le paquet `.filarrext`, relu avant d'être écrit |
| `filarr-ext verify <paquet>` | relit et contrôle un paquet |
| `filarr-ext publish <paquet>` | ouvre Filarr pour bureau sur l'écran Publier |

Elle ne demande jamais ni mot de passe ni clé : la signature se fait dans Filarr, sur votre
appareil.

```bash
npm create filarr-extension@latest mon-extension
cd mon-extension
npm install
npm run dev
```

Hors d'un projet (un paquet téléchargé depuis Filarr Builder, par exemple) :
`npx @filarr/extension-cli verify <paquet>` ou `npx @filarr/extension-cli publish <paquet>`.

Toutes les options : [docs/cli.md](https://github.com/filarr-work/filarr-extension-builder/blob/main/docs/cli.md).
