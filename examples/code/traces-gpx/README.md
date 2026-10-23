# Traces GPX (`.gpx`)

Ouvre une trace de randonnée, de course ou de vélo : profil d'altitude,
distance, dénivelé positif et négatif, et des segments que l'on renomme.

## Ce que l'exemple montre

**Un Web Worker créé depuis un `blob:`** (`src/calculateur.ts`). La CSP de la
page bac à sable ne permet qu'une source de worker : `worker-src blob:`. Le
build construit `src/calcul.worker.ts` à part et l'importe comme texte
(`import source from './calcul.worker.ts?worker'`, voir `_outils/build.mjs`) ;
l'éditeur en fait un `Blob`, puis un `Worker`. Le worker hérite de la CSP — pas
de réseau, pas d'`importScripts` distant : il déplace le calcul hors du fil
principal, rien de plus. C'est une optimisation, pas une condition : sans
`Worker`, ou s'il tombe, le même calcul se fait sur le fil principal. À
`destroy()`, le worker est terminé **et** l'URL `blob:` révoquée.

**Trois fonctions pures** (`src/fonctions.ts`), que Filarr appelle sans ouvrir
l'éditeur, dans une page sans aucune API :

| Fonction | Ce que Filarr en fait |
| --- | --- |
| `thumbnail` | la carte du fichier montre le profil (PNG de 192 × 96, ~18 Kio) |
| `fields` | la vue tableau d'un dossier de traces affiche `distance_km` et `denivele_m` — Filarr construit le tableau, l'extension ne voit jamais le dossier |
| `extractText` | la recherche trouve la trace par son nom et celui de ses segments |

Les valeurs de `fields` passent au type déclaré dans le manifeste (`number`) ;
une trace sans altitude rend `denivele_m: null`, jamais un zéro inventé.

**Une réécriture chirurgicale d'un format tiers** (`src/gpx.ts`). Un GPX porte
souvent des données de montre (fréquence cardiaque, cadence…) dans ses
`<extensions>`. Tant qu'aucun nom n'a changé, l'éditeur rend les octets
d'origine **à l'identique**. Quand on renomme un segment, seul son `<name>` est
modifié (créé en tête du `<trk>`, dans l'espace de noms du fichier, s'il
manquait) ; points, temps et extensions passent tels quels.

**Un graphique accessible** (`src/graphique.ts`) : le profil est un curseur
(`role="slider"`) — flèches, Page préc./suiv., Début/Fin parcourent la trace, et
le lecteur d'écran lit « 4,57 km, altitude 2 050 m ». Ses couleurs sont des
variables du thème de Filarr : il suit un changement de thème sans rien redessiner.

Les chiffres : distance par haversine ; dénivelé filtré par un seuil
d'hystérésis de 3 m (le tremblement de l'altitude GPS ne gonfle pas le total) ;
rien n'est compté **entre** deux segments disjoints.

## Capacités

```json
"capabilities": {
  "functions": {
    "extractText": true,
    "thumbnail": true,
    "fields": [
      { "key": "distance_km", "label": "Distance (km)", "type": "number" },
      { "key": "denivele_m", "label": "Dénivelé positif (m)", "type": "number" }
    ]
  }
}
```

Le Web Worker ne demande **aucune** capacité : il fait partie du palier 1 de la
page, ouvert à toutes les extensions.

## Un segment, c'est un `<trk>`

GPX 1.1 sait nommer un `<trk>`, pas un `<trkseg>` (une coupure du signal). Un
segment de l'éditeur est donc un `<trk>` ; ses `<trkseg>` forment un seul
segment.

## Construire et vérifier

```bash
npm run build && npm run check && npm run smoke && npm test
```

Les tests du format tournent sous jsdom (`// @vitest-environment jsdom`) : la
page bac à sable a `DOMParser`, Node non.

## Les fichiers

```
src/index.ts          mount(), le câblage
src/gpx.ts            lire le GPX, réécrire les noms (DOMParser)
src/profil.ts         distance, dénivelé, profil (pur, sans DOM : tourne dans le worker)
src/calcul.worker.ts  le worker
src/calculateur.ts    le worker depuis un blob:, et son repli
src/fonctions.ts      vignette, champs, texte — les fonctions pures
src/graphique.ts      le profil en SVG, parcourable au clavier
src/png.ts            l'encodeur PNG (pur)
exemples/             une randonnée en trois segments, un footing avec fréquence
                      cardiaque et coupure GPS, un trajet à vélo en GPX 1.0 sans altitude
```
