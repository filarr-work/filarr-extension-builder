# Croquis (`.croquis`)

Dessin à main levée — souris, stylet, doigt ou clavier — avec annuler et rétablir.

## Ce que l'exemple montre

Un éditeur complet (document neuf, lecture seule, `onDirty`, autosave à 2 s,
codes de rejet, `getBytes`, `destroy`, thème, langue), et surtout quatre
capacités du **palier 1 et 2**, qui ne donnent à l'extension **aucun accès
supplémentaire** à vos données :

| Capacité | Ce qu'elle apporte | Où |
| --- | --- | --- |
| `newDocument` | « Nouveau document › Croquis vierge » crée le fichier depuis une **graine** (le JSON d'un croquis vide, en base64) plutôt qu'un fichier de 0 octet | `filarr.extension.json` ; un test vérifie que la graine est exactement `ecrireCroquis(croquisVide())` |
| `maxBytes` | relevé à 64 Mio (le plafond du pont) : un dessin riche dépasse le plafond ordinaire d'un éditeur (50 Mio) | `filarr.extension.json` |
| `functions.thumbnail` | la carte du fichier montre le dessin, calculé **sans ouvrir l'éditeur** | `src/fonctions.ts`, `src/png.ts` |
| `functions.exports` | « Exporter en page web » (SVG embarqué) et « en JSON » dans le menu du fichier | `src/fonctions.ts` |

**Les fonctions pures** tournent dans une page que Filarr ouvre sans rien
afficher, sans stockage, sans sélecteur, sans réseau, sur un fichier que
**Filarr** a choisi. D'où une vignette produite sans `<canvas>` : un petit
encodeur PNG (`src/png.ts`, couleurs indexées, blocs deflate stockés), testé en
relisant ses octets avec `zlib`. Une vignette fait 15 à 20 Kio, sous le plafond
de 96 Kio de l'hôte, qui la reconnaît à ses octets d'en-tête.

⚠ Le manifeste déclare `exports`, mais le bundle expose **`functions.export`**
(au singulier), avec la cible dans `ctx.to`.

**L'export HTML n'interprète rien** du fichier : le nom de fichier est échappé,
les couleurs sont validées (`#rrggbb`), les chemins ne contiennent que des
nombres.

**Le clavier dessine aussi.** La feuille est focalisable : flèches pour déplacer
le crayon (Maj : plus vite, Alt : au pixel), Entrée pour le poser puis le lever,
Échap pour abandonner le trait. La couleur se choisit dans un groupe radio
(flèches), l'épaisseur dans une liste. Ctrl+Z annule, Ctrl+Maj+Z ou Ctrl+Y
rétablit — l'historique vit en mémoire, il n'est pas écrit dans le fichier.

## Capacités

```json
"capabilities": {
  "newDocument": [{ "ext": "croquis", "label": "Croquis vierge", "seed": "eyJmb3JtYXQi…" }],
  "maxBytes": 67108864,
  "functions": {
    "thumbnail": true,
    "exports": [{ "to": "html", "label": "Page web (dessin SVG)" }, { "to": "json", "label": "Traits en JSON" }]
  }
}
```

## Le format

```
{"format":"filarr-croquis","version":1,"largeur":1200,"hauteur":800,"fond":"#ffffff","traits":[
{"couleur":"#1f2937","epaisseur":4,"points":[120.5,80,131,92.5]}
]}
```

Un trait par ligne (un dessin se compare trait par trait), points à plat
arrondis au dixième. Écriture canonique : un fichier écrit par l'extension se
relit et se réécrit à l'octet près. Tout ce qui est lu est borné (couleurs,
épaisseurs 1 à 64, 20 000 traits de 20 000 points).

## Construire et vérifier

```bash
npm run build && npm run check && npm run smoke && npm test
```

Le banc d'essai (`npm run smoke`) appelle aussi les fonctions pures sur chaque
exemple et vérifie ce que l'hôte vérifierait : signature PNG, 96 Kio, JSON
valide, page HTML complète.

## Les fichiers

```
src/index.ts       mount(), l'historique branché sur l'autosave
src/croquis.ts     le format (pur)
src/historique.ts  annuler, rétablir (pur)
src/fonctions.ts   vignette et exports — les fonctions pures
src/png.ts         l'encodeur PNG et la toile de pixels (pur)
src/vue.ts         la feuille SVG, le pointeur, le clavier
exemples/          une maison, une spirale
```
