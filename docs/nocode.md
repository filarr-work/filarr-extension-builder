# Les extensions sans code

Une extension sans code est **une configuration**, `nocode.json`, lue par **le moteur sans code**
de Filarr (`@filarr/nocode-engine`). Le moteur est le même pour toutes les extensions sans code ;
la configuration dit quel format de fichier lire, quels champs il contient et comment les montrer.
Elle ne contient ni code, ni HTML, ni CSS : des clés, des types et des libellés.

```text
mon-extension/
├── filarr.extension.json   le manifeste, la fiche, et  "build": { "kind": "nocode", "config": "nocode.json" }
├── nocode.json             la configuration (ce document)
└── exemples/               les fichiers que le simulateur ouvre
```

`filarr-ext build` produit le bundle : le moteur, puis ses deux dernières lignes (contrat
`PACKAGE.md` §4 de Filarr) :

```js
/* filarr-nocode engine=1.0.0 */
globalThis.__filarrNocodeBoot({"nocode":1,"id":"…", …});
```

Filarr relit la configuration entre `__filarrNocodeBoot(` et `);` par `JSON.parse`, sans l'évaluer,
pour vous la montrer à la relecture avant la signature. Le paquet `.filarrext` porte aussi
`nocode.json`, **identique** octet pour octet à cette ligne.

## Sommaire

1. [Ce que le moteur garantit](#1-ce-que-le-moteur-garantit)
2. [La racine](#2-la-racine)
3. [Les formats](#3-les-formats)
4. [Les champs](#4-les-champs)
5. [Les blocs de vue](#5-les-blocs-de-vue)
6. [Les calculs](#6-les-calculs)
7. [Les fonctions pures](#7-les-fonctions-pures)
8. [Le manifeste qui va avec](#8-le-manifeste-qui-va-avec)
9. [Exemples complets](#9-exemples-complets)
10. [Les bornes, en tableau](#10-les-bornes-en-tableau)

---

## 1. Ce que le moteur garantit

Ces garanties sont tenues par le moteur, pour toutes les extensions sans code, et vérifiées par ses
tests (`packages/nocode-engine/test/`) :

- **Aucun HTML interprété.** Tout l'affichage passe par `createElement` et `textContent`. Le moteur
  n'utilise jamais `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval` ni `new Function` — le
  test `security.test.ts` relit le bundle pour s'en assurer. Une valeur `<img src=x onerror=…>`
  s'affiche comme ces caractères, rien de plus.
- **Lecture bornée.** Un fichier de plus de 8 Mio, imbriqué sur plus de 12 niveaux, qui n'est pas de
  l'UTF-8, ou qui contient une clé `__proto__`, `constructor` ou `prototype` (JSON à toute
  profondeur, en-tête CSV, clé de « clé: valeur ») n'est pas ouvert : un écran d'erreur le dit, et le
  fichier **n'est jamais réécrit**.
- **Ce qui n'est pas affiché est réécrit tel quel.** Clés JSON inconnues, colonnes CSV en plus,
  lignes de commentaire, éléments de liste mal formés : rien de tout cela n'est touché. Une ligne CSV
  ou « clé: valeur » non modifiée repart octet pour octet ; une ligne modifiée ne change que la
  valeur éditée. Tant que rien n'a été touché, `getBytes()` rend les octets reçus.
- **Lecture seule, garantie par le moteur.** Quand Filarr ouvre le document en lecture seule, tous
  les contrôles sont inertes **et** le moteur refuse toute écriture à la source : aucun `saveBytes`,
  aucun `onDirty`. Un document JSON dont une clé apparaît deux fois, ou dont un nombre perdrait des
  chiffres à la relecture, est ouvert en lecture seule pour la même raison.
- **Fichier vide = document neuf**, construit avec les valeurs par défaut (`default`).
- **Aucun réseau, aucun stockage.** Le moteur n'en a pas besoin : `filarr-ext check` refuse une
  configuration sans code dont le manifeste demanderait `network`, `storage`, `picker`, `collab`,
  `noteBlock` ou `homeWidget`.
- **Enregistrement** automatique à 2 s (jamais moins), `Ctrl`/`Cmd`+`S` pour forcer, un conflit de
  version (`item_version_conflict`) affiché et qui suspend l'enregistrement automatique.
- **Thème et langue de Filarr.** Le moteur lit les variables `--color-*` que Filarr pose sur la page
  et suit les changements de thème ; il parle français ou anglais selon Filarr.
- **Validation stricte, deux fois.** La configuration est validée à la construction **et** au
  montage, par **liste fermée** : une propriété inconnue (une faute de frappe comme `placholder`) est
  une erreur, pas un réglage ignoré. Une configuration refusée au montage donne un message lisible
  dans le bandeau de Filarr, jamais un éditeur à moitié fonctionnel.

## 2. La racine

```json
{
  "nocode": 1,
  "id": "carnet-recettes",
  "format": { "type": "json" },
  "accent": "#c2410c",
  "fields": [ … ],
  "view": [ … ],
  "functions": { … }
}
```

| Propriété   | Obligatoire | Valeur                                                                                                |
| ----------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| `nocode`    | oui         | `1` — le format de cette configuration                                                                |
| `id`        | oui         | L'identifiant du **manifeste** (`^[a-z][a-z0-9-]{1,63}$`) : l'éditeur est monté sous `<id>-editor`   |
| `format`    | oui         | Le format du fichier (§3)                                                                             |
| `fields`    | oui         | Les champs du document (§4)                                                                           |
| `view`      | oui         | Les blocs affichés, dans l'ordre (§5), 1 au moins                                                     |
| `accent`    | non         | Une couleur `#rrggbb` : boutons, cases, étoiles, barres. Absente : la couleur principale de Filarr    |
| `functions` | non         | Les fonctions pures que le moteur expose (§7)                                                         |
| `$schema`   | non         | Une adresse, ignorée par le moteur (pour votre éditeur)                                               |

**Les libellés** (`label`, `placeholder`, `title`, `addLabel`, `unit`…) sont une chaîne, ou une chaîne
par langue : `{ "fr": "Portions", "en": "Servings" }`. Le français sert de repli. 1 à 200 caractères
(20 pour `unit`), sans caractère invisible.

## 3. Les formats

### `json` — un objet JSON

```json
{ "type": "json", "indent": 2 }
```

La racine du fichier est un objet ; les champs sont ses propriétés. `indent` (`0`, `2`, `4` ou
`"tab"`) ne sert qu'aux documents **neufs** : un fichier existant garde son indentation, ses fins de
ligne et ses blancs de début et de fin.

> `JSON.stringify` réécrit un nombre sous sa forme courte (`1.0` devient `1`) et place en tête les
> clés qui ressemblent à des entiers : la **valeur** est la même, l'écriture peut différer. Un
> nombre qui perdrait des chiffres (`12345678901234567890`) ouvre le document en lecture seule.

### `csv` — un tableau

```json
{ "type": "csv", "delimiter": ";" }
```

La première ligne non vide est l'en-tête ; les **champs sont les colonnes** (`key` = nom de colonne).
Le document est une liste de lignes, appelée **`rows`** : les blocs `table`, `total`, `progress`,
`checklist` la visent quand on ne précise pas `field`.

- `delimiter` : `","` (défaut), `";"` ou `"\t"`. Avec `";"`, les nombres s'écrivent avec une virgule
  décimale (`6,90`), comme un tableur réglé en français ; `decimal` (sur un champ `number`) change ce
  choix.
- Guillemets doublés, retours à la ligne dans une cellule, marque d'ordre UTF-8 et fins de ligne
  `\r\n` : lus et réécrits.
- Une colonne déclarée mais absente du fichier est ajoutée à la première écriture qui la remplit.
- Types permis : les types d'**une valeur** (`text`, `longtext`, `number`, `boolean`, `date`, `url`,
  `email`, `choice`, `tags`, `rating`) — pas de `list`, `object` ni `textlist`.

### `lines` — une liste à cocher en texte brut

```json
{ "type": "lines" }
```

Une ligne `[ ] lait` ou `[x] pain` est un élément (une puce `-`, `*` ou `+` et une indentation
devant sont permises, et reprises). Toute autre ligne — titre, note, ligne vide — reste à sa place.
Le document est une liste appelée **`items`**, dont les éléments ont deux champs fixes : `done`
(`boolean`) et `text` (`text`). `fields` peut en préciser le libellé et l'indication :

```json
"fields": [{ "key": "text", "type": "text", "label": "Article", "placeholder": "Ajouter un article" }]
```

### `keyvalue` — une valeur par ligne

```json
{ "type": "keyvalue", "separator": ":", "mode": "fields" }
```

Des lignes `clé: valeur` (ou `clé = valeur` avec `"separator": "="`). Les lignes vides et les
commentaires (`#`, `;`, `//`) sont gardés ; une valeur tient sur **une** ligne (un retour à la ligne
saisi devient une espace, donc pas de `longtext`).

- `mode: "fields"` (défaut) : les champs sont des **clés** du fichier. La première occurrence d'une
  clé est la sienne ; les clés inconnues et les doublons restent tels quels. Une ligne modifiée garde
  son préfixe d'origine (`nom:   `) ; une clé absente est ajoutée en fin de fichier.
- `mode: "entries"` : **toutes** les paires forment une liste appelée **`entries`**, dont les
  éléments ont deux champs fixes : `key` (`text`) et `value` (`text`, `url` ou `email`). On les
  édite dans un `table` : renommer, ajouter, retirer. C'est le format d'un glossaire.

## 4. Les champs

```json
{ "key": "portions", "type": "number", "label": "Portions", "min": 1, "max": 50, "default": 4 }
```

| Propriété     | Pour            | Valeur                                                                                               |
| ------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| `key`         | tous            | La clé dans le fichier : 1 à 64 caractères, sans point (il sépare les chemins), ni caractère invisible ; jamais `__proto__`, `constructor`, `prototype`. Unique à son niveau |
| `type`        | tous            | Voir ci-dessous                                                                                      |
| `label`       | tous            | Le libellé affiché (défaut : la clé)                                                                 |
| `default`     | tous            | La valeur d'un document neuf ou d'un élément ajouté, **au type du champ**                            |
| `placeholder` | textes, nombres | L'indication d'un champ vide                                                                         |
| `min`, `max`, `step` | `number` | Les bornes et le pas (les boutons − / + les respectent)                                             |
| `unit`        | `number`        | Une unité affichée après la valeur (`min`, `€`)                                                      |
| `decimals`    | `number`        | Les décimales affichées (0 à 6)                                                                      |
| `decimal`     | `number`        | En CSV et clé: valeur, le séparateur décimal écrit : `","` ou `"."`                                  |
| `max`         | `rating`        | Le nombre d'étoiles, 1 à 10 (défaut 5)                                                               |
| `options`     | `choice`        | 1 à 50 options `{ "value", "label"?, "color"? }` (`color` en `#rrggbb` teinte la pastille)          |
| `trueValue`, `falseValue` | `boolean` | En CSV et clé: valeur, le texte écrit pour vrai et pour faux (défaut `true` / `false`)     |
| `separator`   | `tags`          | En CSV et clé: valeur, le séparateur des étiquettes (défaut `,`)                                     |
| `fields`      | `list`, `object`| Les champs d'un élément, ou les sous-champs                                                          |

Une propriété qui n'a pas de sens pour le type (des `options` sur un `text`) est refusée.

| Type       | Valeur en JSON              | Contrôle affiché                                              |
| ---------- | --------------------------- | ------------------------------------------------------------- |
| `text`     | chaîne                      | Champ d'une ligne                                             |
| `longtext` | chaîne                      | Zone de texte                                                 |
| `number`   | nombre                      | Champ numérique, − / + sur demande                            |
| `boolean`  | `true` / `false`            | Case à cocher                                                 |
| `date`     | `"AAAA-MM-JJ"`              | Sélecteur de date (une date illisible reste affichée en texte) |
| `url`      | chaîne                      | Champ, et un lien **Ouvrir** s'il commence par `http(s)://`    |
| `email`    | chaîne                      | Champ, et un lien **Écrire** (`mailto:`) si l'adresse est bien formée |
| `choice`   | chaîne (une des `value`)    | Liste déroulante ; une valeur inconnue du fichier reste choisie et intacte |
| `tags`     | liste de chaînes            | Étiquettes : Entrée ou virgule pour ajouter, × pour retirer   |
| `rating`   | entier de 0 à `max`         | Étoiles ; cliquer l'étoile posée retire la note               |
| `textlist` | liste de chaînes            | Pour le bloc `steps`                                          |
| `list`     | liste d'objets              | Pour `checklist`, `table`, `cards`, `steps`                   |
| `object`   | objet                       | Des sous-champs, visés par un chemin `parent.enfant`          |

Trois niveaux de `list` / `object` au plus. Une valeur d'un autre type que prévu s'affiche vide et
reste **intacte** tant que l'utilisateur ne modifie pas ce champ-là.

**Les liens** ne sont jamais `javascript:`, `data:` ni `file:` : seuls `http:`, `https:` et
`mailto:` deviennent cliquables.

## 5. Les blocs de vue

`view` est la liste des blocs affichés de haut en bas. Un bloc vise des champs **de son niveau** : la
racine du document, ou l'élément d'une liste pour les blocs posés dans une carte (`cards`). Un
chemin `a.b` traverse un champ `object`. Chaque référence est vérifiée à la validation : un bloc qui
vise un champ absent, ou d'un type qu'il ne sait pas montrer, est refusé.

| Bloc        | Propriétés                                                         | Vise                                   |
| ----------- | ------------------------------------------------------------------ | -------------------------------------- |
| `title`     | `field`, `placeholder`?                                            | `text`, `longtext`                     |
| `badges`    | `items`: 1 à 12 `{ field, label?, stepper? }`                      | une valeur (sauf `longtext`, `tags`)   |
| `checklist` | `field`?, `check`?, `text`?, `label`?, `addLabel`?                 | `list` (case + texte)                  |
| `steps`     | `field`, `text`?, `label`?, `addLabel`?                            | `textlist`, ou `list` (texte)          |
| `longtext`  | `field`, `label`?, `rows`? (2 à 30)                                | `text`, `longtext`                     |
| `number`    | `field`, `label`?                                                  | `number` (avec − / +)                  |
| `table`     | `field`?, `columns`? (1 à 16), `label`?, `addLabel`?               | `list` (colonnes : une valeur)         |
| `tags`      | `field`, `label`?                                                  | `tags`                                 |
| `date`      | `field`, `label`?                                                  | `date`                                 |
| `link`      | `field`, `label`?                                                  | `url`, `email`                         |
| `rating`    | `field`, `label`?                                                  | `rating`, `number`                     |
| `fields`    | `fields`: 1 à 32 chemins, `label`?                                 | une valeur chacun : un formulaire      |
| `section`   | `title`, `blocks`, `collapsed`?                                    | — (un groupe repliable)                |
| `cards`     | `field`, `blocks`, `label`?, `addLabel`?                           | `list` : une carte par élément         |
| `progress`  | `field`?, `check`? — ou `field` + `max` / `maxField`, `label`?     | `list` + case, ou un nombre            |
| `total`     | `label`, `compute`, `unit`?, `decimals`?                           | un calcul (§6)                         |

Précisions :

- **`field` omis** (`checklist`, `table`, `progress`) : la liste implicite du format (`rows`,
  `items`, `entries`). Pour un document JSON, `field` est obligatoire.
- **`check` / `text` omis** (`checklist`, `steps`, `progress`) : le premier champ `boolean`, et le
  premier champ `text` / `longtext`, des éléments.
- **`stepper`** (dans `badges`) : boutons − / + pour un champ `number`.
- **`progress`** : sur une liste, cochés / total ; sur un nombre, la valeur sur `max` (un nombre) ou
  sur `maxField` (un autre champ nombre : les points de vie sur leur maximum).
- **`checklist`, `steps`, `table`, `cards`** ajoutent, retirent et réordonnent (↑ ↓ ×) ; un élément
  ajouté prend les `default` de ses champs. En lecture seule, ces boutons n'existent pas.
- **`section`** et **`cards`** s'imbriquent, quatre niveaux au plus ; 100 blocs par niveau, 300 en tout.

## 6. Les calculs

`total` (et les colonnes calculées de `functions.fields`) appliquent **une opération d'une liste
fermée** à des champs déclarés — jamais une formule écrite : ce serait du code.

```json
{ "op": "sumProduct", "field": "articles", "of": ["quantite", "prix"] }
```

| `op`           | Sur une liste (`field`, ou la liste implicite)          | Au niveau courant (`of` = champs du niveau) |
| -------------- | ------------------------------------------------------- | ------------------------------------------- |
| `count`        | Le nombre d'éléments                                    | Le nombre de champs non vides de `of`       |
| `countChecked` | Les éléments dont la case `of` est cochée               | Les cases de `of` cochées                   |
| `sum`          | La somme du nombre `of` des éléments                    | La somme des nombres de `of`                |
| `avg`, `min`, `max` | La moyenne, le minimum, le maximum de `of`         | Idem sur les champs de `of`                 |
| `sumProduct`   | La somme, élément par élément, du produit de 2 à 4 nombres | Le produit des champs de `of`            |

Le mode se décide comme suit : `field` présent → sur la liste ; sinon, pour un format à liste
implicite, si `of` ne désigne aucun champ de la racine → sur la liste implicite ; sinon → au niveau
courant. Une valeur vide est ignorée (une moyenne sans valeur affiche « — »).

## 7. Les fonctions pures

Filarr appelle ces fonctions sur les fichiers **qu'il** choisit, dans une page sans aucune API
(capacité `functions` du manifeste, CAPACITES.md palier 2). Le moteur ne les expose que si la
configuration les déclare :

```json
"functions": {
  "extractText": true,
  "fields": [
    { "key": "portions", "field": "portions" },
    { "key": "valeur", "compute": { "op": "sumProduct", "of": ["quantite", "prix"] } }
  ],
  "exports": [{ "to": "md" }, { "to": "csv", "field": "ingredients" }]
}
```

- **`extractText`** — pour la recherche locale de Filarr. `true` : le texte de tous les champs
  (libellés de choix, étiquettes, listes comprises ; pas les nombres) ; `{ "fields": [...] }` :
  seulement ceux-là. 100 000 caractères au plus.
- **`fields`** — les colonnes du tableau de dossier de Filarr. `key` est la clé **du manifeste**
  (`^[a-z][a-z0-9_]{0,31}$`) ; la valeur est un champ lu tel quel (`field`) ou un calcul (`compute`).
  Le type rendu : `number`/`rating` → `number`, `boolean` → `checkbox`, `date` → `date`, `url` →
  `url`, le reste → `text` (le libellé d'un choix, les étiquettes jointes) ; un calcul → `number`.
- **`exports`** — « Exporter en … » dans le menu du fichier, 1 à 4 cibles :
  - `json` : le document lui-même pour un format JSON (rien n'est perdu), sinon ses champs déclarés ;
  - `csv` : le fichier lui-même pour un CSV ; la liste `field` (ou la liste implicite) en colonnes ;
    sinon deux colonnes, champ et valeur ;
  - `md`, `txt`, `html` : la vue mise à plat — titres, pastilles, cases, étapes, tableaux. Le HTML
    est un document autonome, chaque texte échappé, sans script ni ressource externe.

Un document illisible fait échouer l'appel avec un code (`document_forbidden_key`…) : Filarr retombe
sur ce qu'il fait sans l'extension.

## 8. Le manifeste qui va avec

Le manifeste (`filarr.extension.json` › `manifest`) est ce que l'utilisateur **accepte** ; la
configuration est ce que le moteur **fait**. `filarr-ext check` vérifie qu'ils disent la même chose :

| Dans `nocode.json`                       | Dans `manifest.capabilities`                                      |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `id`                                     | `manifest.id` (erreur s'ils diffèrent)                            |
| `functions.extractText`                  | `functions.extractText: true`                                     |
| `functions.fields[i].key`                | `functions.fields[i]` `{ key, label, type }` — même clé, même type |
| `functions.exports[i].to`                | `functions.exports[i]` `{ to, label }`                            |

Une fonction déclarée au manifeste et absente de la configuration est une **erreur** (Filarr
l'appellerait) ; l'inverse est un avertissement (Filarr ne l'appellera pas). Un **modèle de départ**
(`newDocument[].seed`, en base64 — `npx filarr-ext seed modele.ext` le calcule) doit s'ouvrir avec
la configuration. `maxBytes` au-delà de 8 Mio est inutile : le moteur n'ouvre pas plus gros.

## 9. Exemples complets

Les dix exemples de [`examples/nocode/`](../examples/nocode/) passent `filarr-ext check` et `pack` ;
chacun a son `README.md`. Trois configurations complètes, pour commencer :

### Une liste de courses (`lines`)

```json
{
  "nocode": 1,
  "id": "liste-courses",
  "format": { "type": "lines" },
  "accent": "#16a34a",
  "fields": [{ "key": "text", "type": "text", "label": "Article", "placeholder": "Ajouter un article" }],
  "view": [
    { "type": "progress", "label": "Dans le panier" },
    { "type": "checklist", "label": "À acheter", "addLabel": "Un article" }
  ]
}
```

### Un inventaire (`csv`), avec totaux et export

```json
{
  "nocode": 1,
  "id": "inventaire",
  "format": { "type": "csv", "delimiter": ";" },
  "fields": [
    { "key": "article", "type": "text", "label": "Article" },
    { "key": "quantite", "type": "number", "label": "Quantité", "min": 0, "default": 1 },
    { "key": "prix", "type": "number", "label": "Prix unitaire", "decimals": 2, "unit": "€" }
  ],
  "view": [
    { "type": "table", "addLabel": "Ajouter un article" },
    { "type": "total", "label": "Articles", "compute": { "op": "sum", "of": "quantite" } },
    { "type": "total", "label": "Valeur", "compute": { "op": "sumProduct", "of": ["quantite", "prix"] }, "decimals": 2, "unit": "€" }
  ],
  "functions": { "exports": [{ "to": "csv" }] }
}
```

et dans le manifeste : `"capabilities": { "functions": { "exports": [{ "to": "csv", "label": "CSV" }] } }`.

### Un journal de lecture (`json`), en cartes

```json
{
  "nocode": 1,
  "id": "journal-lecture",
  "format": { "type": "json" },
  "fields": [
    { "key": "titre", "type": "text", "label": "Journal" },
    {
      "key": "livres", "type": "list", "label": "Livres",
      "fields": [
        { "key": "titre", "type": "text", "label": "Titre" },
        { "key": "auteur", "type": "text", "label": "Auteur" },
        { "key": "statut", "type": "choice", "label": "Statut", "default": "a_lire",
          "options": [
            { "value": "a_lire", "label": { "fr": "À lire", "en": "To read" }, "color": "#64748b" },
            { "value": "lu", "label": { "fr": "Lu", "en": "Read" }, "color": "#16a34a" }
          ] },
        { "key": "note", "type": "rating", "label": "Note", "max": 5 }
      ]
    }
  ],
  "view": [
    { "type": "title", "field": "titre" },
    { "type": "total", "label": "Note moyenne", "compute": { "op": "avg", "field": "livres", "of": "note" }, "decimals": 1 },
    { "type": "cards", "field": "livres", "addLabel": "Ajouter un livre",
      "blocks": [
        { "type": "title", "field": "titre" },
        { "type": "badges", "items": [{ "field": "statut" }, { "field": "auteur" }] },
        { "type": "rating", "field": "note" }
      ] }
  ]
}
```

## 10. Les bornes, en tableau

| Borne                                   | Valeur                                      |
| --------------------------------------- | ------------------------------------------- |
| `nocode.json`                           | 256 Kio (PACKAGE.md), 12 niveaux d'imbrication |
| Champs                                  | 64 par niveau, 256 en tout, 3 niveaux de `list` / `object` |
| Blocs                                   | 100 par niveau, 300 en tout, 4 niveaux de `section` / `cards` |
| Pastilles (`badges`)                    | 12                                          |
| Colonnes (`table`)                      | 16                                          |
| Options (`choice`)                      | 50                                          |
| Libellés                                | 1 à 200 caractères (`unit` : 20)            |
| Valeurs par défaut                      | textes de 10 000 caractères, listes de 1 000 éléments |
| Document ouvert                         | 8 Mio, 12 niveaux, UTF-8                    |
| `extractText`                           | 100 000 caractères                          |
| `functions.fields`                      | 32 colonnes, texte de 500 caractères        |
| `functions.exports`                     | 4 cibles parmi `md`, `txt`, `html`, `csv`, `json` |
