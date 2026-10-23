# Planche photos (`.planche`)

Composez une planche de photos à partir d'images que vous choisissez dans
Filarr : titre, légendes, ordre, nombre de colonnes.

## Ce que l'exemple montre

**La capacité `picker` : l'extension ne choisit jamais ce qu'elle voit.**
« Ajouter des photos… » appelle `host.pick({ multiple: true })`. Filarr ouvre
**son** sélecteur — limité aux extensions déclarées (`png`, `jpg`, `jpeg`,
`webp`) —, l'utilisateur choisit, et l'extension reçoit des **poignées** :

```js
[{ handle: 'Zk3…', name: 'phare.jpg' }]   // jamais un identifiant, un dossier ou un chemin
```

`host.readPicked(handle)` en lit les octets. Il n'existe aucune capacité « lire
toutes les images » : seuls les fichiers choisis deviennent accessibles.
Annuler le sélecteur rend une liste vide.

**Les poignées ne valent que pour la session.** Elles sont tirées au hasard, liées
à cette extension (une poignée volée par une autre ne vaut rien chez elle) et
oubliées quand Filarr se recharge. D'où le choix du format : la planche
**embarque une copie réduite** de chaque image (480 px au plus, en data URL),
et ne garde **aucune** poignée. Elle se rouvre, se partage et se lit ailleurs
sans les originaux — et ne dit jamais où ils étaient. Pendant la session, le
bouton « Relire l'original » refait une vignette plus fine (1 200 px) depuis la
poignée ; après réouverture, il n'apparaît plus. Si une poignée a expiré, Filarr
répond `unknown_handle` et l'extension demande de rechoisir l'image.

**Le type se lit dans les octets, pas dans le nom** (`src/images.ts`). Un
« .png » qui n'en est pas un est écarté avec son nom. Et une data URL lue dans un
fichier `.planche` n'est acceptée que si son type annoncé est celui de ses octets
(PNG, JPEG ou WebP) : c'est ce qui la rend sûre dans un `src`
(`img-src data:` est permis par la CSP de la page). Un `data:image/svg+xml` ou un
`javascript:` n'y entre jamais.

**La réduction** (`src/reduction.ts`) se fait dans la page : `createImageBitmap`
puis `<canvas>`, sortie JPEG sur fond blanc. Sans canvas utilisable, une image
déjà petite (≤ 256 Kio) est embarquée telle quelle ; une grande est refusée
plutôt que d'alourdir le document.

**Le clavier** : Alt+← / Alt+→ depuis une légende déplace la photo ; chaque photo
a ses boutons nommés (avancer, reculer, retirer).

## Capacités

```json
"capabilities": { "picker": { "access": "read", "extensions": ["png", "jpg", "jpeg", "webp"] } }
```

`read` suffit : l'extension n'écrit jamais dans les fichiers choisis
(`readwrite` ouvrirait `host.writePicked`, qui n'existe pas ici). `picker` est
exclusif de `network` : une extension qui lit vos images ne parle pas à Internet.

## Le format

```json
{ "format": "filarr-planche", "version": 1, "titre": "…", "colonnes": 3,
  "photos": [{ "id": "p-0a1b2c", "nom": "phare.png", "legende": "…", "largeur": 96, "hauteur": 64,
               "image": "data:image/png;base64,…" }] }
```

60 photos au plus, 600 Kio de data URL par photo. Écriture canonique : une
planche écrite par l'extension se relit et se réécrit à l'octet près.

## Construire et vérifier

```bash
npm run build && npm run check && npm run smoke && npm test
```

Le banc d'essai simule le sélecteur avec `exemples/photos/` (`smoke.json`, clé
`selection`) : trois vraies images, et un faux `.png` qui doit être écarté.

## Les fichiers

```
src/index.ts      mount(), le sélecteur, les poignées de la session
src/planche.ts    le format (pur)
src/images.ts     type par les octets, dimensions d'en-tête, data URL vérifiées (pur)
src/reduction.ts  la vignette, par canvas, et son repli
exemples/         une planche de Bretagne, une planche WebP, et les photos du sélecteur simulé
```
