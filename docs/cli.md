# `filarr-ext` — l'outil en ligne de commande

`filarr-ext` (paquet `@filarr/extension-cli`) construit, simule, contrôle, empaquette et remet à
Filarr une extension, **avec ou sans code**. Il ne parle à aucun service : il ne demande ni mot de
passe, ni clé, ni jeton. La signature se fait dans Filarr, sur votre appareil, après une relecture
complète du paquet.

```bash
npm create filarr-extension@latest mon-extension   # un projet prêt (voir plus bas)
cd mon-extension && npm install
npx filarr-ext dev        # le simulateur local
npx filarr-ext check      # les contrôles du serveur et de Filarr
npx filarr-ext pack       # dist/<id>-<version>.filarrext
npx filarr-ext publish dist/<id>-<version>.filarrext
```

| Commande               | Ce qu'elle fait                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `dev`                  | Le simulateur local, reconstruit et rechargé à chaque modification du projet        |
| `build`                | `dist/bundle.js`                                                                    |
| `check`                | Tous les contrôles, sortie ✓ / ! / ✗                                                |
| `pack`                 | Le paquet `.filarrext` (format 1 de `PACKAGE.md`), relu avant d'être écrit          |
| `verify <paquet>`      | Relit et contrôle un paquet, sans rien exécuter                                     |
| `publish <paquet>`     | Ouvre Filarr pour bureau sur l'écran Publier (`filarr://publish?file=…`)           |
| `seed <fichier>`       | Le base64 d'un modèle de départ (`capabilities.newDocument[].seed`)                 |

Options communes : `-C, --dir <dossier>` (le projet ; défaut : le dossier courant), `--json`
(`check`, `verify`, `pack` : la même sortie en JSON), `-h, --help`, `-v, --version`.

**Codes de sortie** : `0` réussi (des avertissements sont permis), `1` au moins une erreur de
contrôle, `2` commande mal formée.

---

## Le fichier de projet : `filarr.extension.json`

```json
{
  "manifest": {
    "id": "carnet-recettes",
    "name": "Carnet de recettes",
    "version": "1.2.0",
    "description": "Vos recettes en fiches.",
    "extensions": ["recette"],
    "icon": "🍲",
    "category": "productivity",
    "author": "Camille R.",
    "capabilities": { "functions": { "extractText": true } }
  },
  "listing": { "releaseNotes": "Champ « temps » en minutes.", "sourceUrl": "https://…", "license": "MIT" },
  "screenshots": ["captures/1.webp", "captures/2.png"],
  "build": { "kind": "nocode", "config": "nocode.json" },
  "samples": "exemples"
}
```

| Champ         | Obligatoire | Contenu                                                                                         |
| ------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `manifest`    | oui         | Le manifeste **non signé**, exactement tel qu'il ira dans le paquet (voir `check`)              |
| `listing`     | non         | La fiche : `releaseNotes` (≤ 2000), `sourceUrl` (`https://`, ≤ 300), `license` (≤ 40)           |
| `screenshots` | non         | 0 à 4 captures PNG ou WebP, 96 Kio chacune — chemins **relatifs au projet**               |
| `build`       | oui         | `{ "kind": "code", "entry": "src/index.ts" }` ou `{ "kind": "nocode", "config": "nocode.json" }` |
| `samples`     | non         | Le dossier des fichiers d'exemple du simulateur (défaut : `exemples`)                           |
| `format`      | non         | `1`                                                                                             |

Tout chemin reste **dans** le projet : un chemin absolu ou qui remonte (`../`) est refusé. Une clé
inconnue est refusée.

**L'icône** d'une extension est l'emoji `manifest.icon` (1 à 8 points de code). Le paquet ne
transporte **aucune** image d'icône : une entrée `icon.png` serait refusée par Filarr.

---

## `filarr-ext build`

Écrit `dist/bundle.js`.

- **Avec code** : esbuild, `--format=iife`, cible `es2020`, navigateur, minifié (`--no-minify` pour
  lire la sortie), sortie ASCII, sans commentaire ni carte de sources. Le bundle est exécuté par la
  page bac à sable comme un **corps de fonction** (`new Function('globalThis', code)`) : un
  `import`/`export` au niveau haut y serait une erreur de syntaxe ; l'IIFE l'exclut par construction.
  Toutes les dépendances sont embarquées (la page n'a aucun réseau).
- **Workers** : `import source from './calcul.worker.ts?worker'` construit ce fichier **à part**, en
  IIFE, et l'importe comme **texte**. Faites-en un `Blob`, puis un `Worker` depuis son URL `blob:` —
  la seule source que la CSP de la page permet (`worker-src blob:`) ; le worker hérite de cette CSP,
  donc d'aucun réseau. (Même convention que les exemples avec code du dépôt.)
- **Sans code** : le moteur sans code, puis les deux lignes finales du contrat :

  ```js
  /* filarr-nocode engine=1.0.0 */
  globalThis.__filarrNocodeBoot({…});
  ```

  La configuration est validée d'abord (voir [nocode.md](nocode.md)) ; son JSON tient sur une ligne,
  en ASCII, et rien ne suit `);`.

```text
$ npx filarr-ext build
✓ dist/bundle.js — 79,1 Kio (moteur sans code 1.0.0)
```

## `filarr-ext check`

Construit le projet, puis rejoue les contrôles **du serveur** (`validateManifest` du worker,
PUBLISHING.md) et **de Filarr** (validateur de capacités, lecture du paquet, page bac à sable).

| Contrôle | Erreur (✗) si… | Avertissement (!) si… |
| --- | --- | --- |
| Fichier de projet | illisible, clé inconnue, chemin qui sort du projet | — |
| `id` | hors de `^[a-z][a-z0-9-]{1,63}$` | — |
| `version` | hors de `^\d+\.\d+\.\d+$` (ni `v`, ni suffixe) | — |
| `name` | vide ou plus de 100 caractères (unités UTF-16, comme le serveur) | — |
| `description` | absente ou plus de 2000 caractères | vide |
| `extensions` | 0 ou plus de 10, ou hors de `^[a-z0-9]{1,10}$` | une extension en double |
| `icon` | pas un emoji de 1 à 8 points de code | absente |
| `category` | hors de `editors`, `productivity`, `data`, `media`, `fun`, `other` | — |
| `author` | plus de 80 points de code, caractère invisible ou directionnel | — |
| Champs calculés | `bundleHash`, `publisherFingerprint`, `trust`, `previews` présents (Filarr les calcule) | — |
| Champ inconnu du manifeste | toujours | — |
| `capabilities` | refusées par le validateur de Filarr (copie **vendorisée**, à l'identique) : clé inconnue, borne, exclusion réseau… | — |
| Fiche (`listing`) | hors bornes, clé inconnue | pas de licence |
| Captures | plus de 4, absentes, ni PNG ni WebP (lu dans les octets), JPEG (Filarr ne garde que PNG et WebP en aperçu), plus de 96 Kio | aucune capture |
| Manifeste signé | plus de 640 Kio une fois les captures ajoutées en data URL | — |
| Build | erreur esbuild, configuration sans code refusée (avec son chemin : `view[2].field`) | avertissement esbuild |
| Taille du bundle | vide ou plus de 4 Mio | plus de 1 Mio |
| Forme du bundle | ne se compile pas comme corps de fonction (ESM, `import`/`export`) ; ne pose pas `filarrSandboxedPlugin` | — |
| Points d'entrée | pas d'éditeur `<id>-editor` ; une fonction déclarée absente de `plugin.functions` ; `noteBlock` / `homeWidget` sans `plugin.block` / `plugin.widget` | un éditeur que l'hôte ne demandera jamais ; une fonction ou un bloc non déclaré |
| Sans code | `nocode.json` ≠ manifeste (identifiant, colonnes, types, exports) ; capacité inutile au moteur ; modèle de départ illisible ; bundle relu ≠ `nocode.json` | une fonction offerte mais non déclarée |
| API fermées par la page | — | `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `localStorage`, `indexedDB`, `eval`, `new Function`, `innerHTML`, `import()`, carte de sources embarquée |

Les points d'entrée se lisent en **exécutant le bundle à blanc** dans un contexte `vm` sans DOM ni
réseau : c'est votre propre code, construit à l'instant. Si votre bundle touche le DOM dès son
chargement, l'exécution échoue et `check` se rabat sur la lecture du texte (avertissement).
`verify`, lui, n'exécute jamais rien.

```text
$ npx filarr-ext check
filarr-ext check — carnet-recettes 1.0.0
  ✓ filarr.extension.json lu (sans code)
  ✓ manifeste : carnet-recettes 1.0.0, .recette, capacités functions
  ✓ fiche : notes, sources et licence conformes
  ! aucune capture : la fiche n’aura rien à montrer [screenshots]
  ✓ manifeste signé estimé à 1,2 Kio (≤ 640 Kio)
  ✓ configuration sans code valide, moteur 1.0.0
  ✓ taille du bundle : 79,7 Kio (≤ 4 Mio)
  ✓ se compile comme corps de fonction : IIFE, sans import ni export au niveau haut
  ✓ nocode.json et le manifeste disent la même chose
  ✓ relu comme Filarr le relira : deux lignes finales, JSON identique à nocode.json
  ✓ éditeur « carnet-recettes-editor » posé
10 réussi(s), 1 avertissement(s), 0 erreur(s)
```

## `filarr-ext pack`

Lance `check`, puis assemble le paquet de `PACKAGE.md` (format 1) :

| Entrée                                      | Contenu                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `filarr-package.json`                       | `{ format: 1, manifest, listing?, screenshots?, build: { kind, tool, engine? } }` |
| `bundle.js`                                 | Le bundle                                                               |
| `nocode.json`                               | Sans code : **exactement** le JSON de la dernière ligne du bundle       |
| `screenshots/1.webp` … `screenshots/4.webp` | Les captures, dans l'ordre (le type est lu dans les octets, pas dans le nom) |

`build.tool` vaut `filarr-ext <version>` ; `build.engine`, la version du moteur sans code. Le
`build` du paquet ne porte que `kind`, `tool` et `engine` : ni le `entry` ni le `config` du fichier
de projet, ni son `format`. Rien d'autre n'entre dans l'archive : ni clé, ni signature, ni jeton, ni
image d'icône, ni dossier. `pack` n'écrit que le paquet (pas `dist/bundle.js`).
L'archive est reproductible (dates fixes) : deux `pack` du même projet donnent les mêmes octets.

**`pack` refuse ce que Filarr refuserait.** Le paquet assemblé est relu par le même chemin que
`verify` avant d'être écrit ; à la moindre erreur, rien n'arrive sur le disque.

```text
$ npx filarr-ext pack
…
  ✓ paquet écrit : dist/carnet-recettes-1.0.0.filarrext (27,4 Kio)
```

Option : `--out <chemin.filarrext>`.

## `filarr-ext verify <paquet>`

Relit un paquet comme Filarr le relira, **sans rien exécuter** (le bundle est compilé, jamais
appelé) :

1. l'archive : 8 Mio au plus ; le répertoire central lu **avant** toute décompression — 16 entrées au
   plus, noms `^[a-z0-9][a-z0-9._-]{0,63}(/[a-z0-9][a-z0-9._-]{0,63})?$` (un niveau de dossier, jamais
   `..`), aucun dossier, aucune entrée inconnue, aucun doublon, méthodes *store* ou *deflate*, 12 Mio
   décompressés annoncés au plus ;
2. la décompression **en flux**, coupée dès qu'une entrée dépasse sa borne (64 Kio, 4 Mio, 256 Kio,
   96 Kio) ou que le total dépasse 12 Mio — une taille annoncée peut mentir, une bombe ne passe pas ;
   les en-têtes locaux doivent dire la même chose que le répertoire central ;
3. `filarr-package.json` : UTF-8, JSON sans clé interdite, format 1, manifeste, fiche, captures,
   `build` ;
4. les captures annoncées (présentes, type et taille) et aucune capture non annoncée ;
5. le bundle (taille, corps de fonction, global, API fermées) ; sans code : `nocode.json` identique à
   la configuration du bundle, configuration acceptée par le moteur, accord avec le manifeste, moteur
   déclaré = moteur du bundle (et un avertissement s'il diffère de celui que `filarr-ext` fabrique
   pour cette version).

```bash
npx filarr-ext verify dist/carnet-recettes-1.0.0.filarrext
npx filarr-ext verify paquet.filarrext --json
```

## `filarr-ext publish <paquet>`

Pour **Filarr pour bureau** : vérifie le paquet (les mêmes refus que Filarr — chemin en
`.filarrext`, fichier régulier de 8 Mio au plus, puis `verify`), puis ouvre :

```text
filarr://publish?file=<chemin absolu, encodé par encodeURIComponent>
```

Filarr lit le fichier une fois, ouvre **Place de marché › Publier**, montre tout le paquet (« ouvert
depuis un fichier »), propose **Abandonner** en premier, et ne signe qu'après « J'ai tout relu ».
`--print` affiche l'adresse sans l'ouvrir. Sans Filarr pour bureau : déposez le fichier dans
Publier (bureau ou web).

```text
$ npx filarr-ext publish dist/carnet-recettes-1.0.0.filarrext --print
…
Remise à Filarr pour bureau : filarr://publish?file=C%3A%5CUsers%5C…%5Ccarnet-recettes-1.0.0.filarrext
```

## `filarr-ext dev`

Le simulateur local (`@filarr/extension-devhost`), sur `http://127.0.0.1:5199` (`--port`,
`--no-open`). Il sert la **page bac à sable de Filarr**, recopiée à l'identique et servie avec la
même CSP, et un **hôte** qui rejoue le protocole v2 avec le **pont de Filarr**, lui aussi recopié à
l'identique.

- **Fichier** : un des fichiers de `exemples/`, ou un document neuf de 0 octet.
- **Modes** : éditeur ; bloc de note et widget d'accueil si le manifeste les déclare ; un onglet
  **Fonctions** appelle `extractText`, `thumbnail`, `fields` et chaque export sur le document courant,
  dans une page sans API, et passe la valeur par `readCallValue` comme Filarr.
- **Contrôles** : clair / sombre (le thème est poussé à la page, comme quand Filarr change de
  thème), anglais, lecture seule, **simuler un conflit** (`saveBytes` rejette
  `item_version_conflict`), **co-édition** (deux pages reliées comme une salle : updates en octets,
  semis par la première, « Changer d'élu »), **Enregistrer (getBytes)** (le bouton de la fenêtre de
  Filarr, qui écrase délibérément un conflit).
- **Services** : stockage en mémoire (quota et 256 clés, comme Filarr), sélecteur sur les fichiers
  d'exemple (poignées opaques), réseau : chaque envoi est montré (Envoyer / Refuser / Bloquer) puis
  émis **par le serveur de développement** vers les seuls domaines de `network.domains`, avec les
  gardes du relais du bureau (HTTPS, hôte exact, ni IP ni port, adresses publiques, redirections sur
  la même origine, 8 s, 1 Mio) ; les secrets se saisissent dans l'onglet Construction.
- **Journal** : chaque message hôte ↔ page, résumé (type, champs, taille des octets).
- Chaque modification du projet (source, `nocode.json`, `filarr.extension.json`, exemples)
  reconstruit l'extension et recharge les pages, document conservé.

Le serveur n'écoute que sur `127.0.0.1`, refuse un `Host` étranger, et son relais réseau exige le
jeton de la page et son origine.

> Le simulateur n'est pas Filarr : pas de chiffrement, pas de coffre, pas de versions. Ce qu'il
> garantit, c'est la page, le protocole et les refus. Testez aussi dans Filarr (« Tester
> localement »), puis publiez.

## `filarr-ext seed <fichier>`

Affiche le base64 d'un fichier de 64 Kio au plus, à coller dans
`manifest.capabilities.newDocument[].seed`. `check` vérifie ensuite que ce modèle s'ouvre (sans code)
et que l'offre est valide (extension parmi `extensions`, 1 à 4 offres).

```bash
npx filarr-ext seed modeles/nouveau.perso
```

---

## `npm create filarr-extension`

```bash
npm create filarr-extension@latest mon-extension
npm create filarr-extension@latest mon-extension -- --yes --template nocode
npm create filarr-extension@latest notes -- --yes --template texte --lang js --ext note
```

Questions (ou options, avec `--yes`) : le nom affiché (`--name`), le type de fichier (`--ext`, sans
point), le modèle (`--template texte | json | binaire | nocode`), le langage (`--lang ts | js`).
Le projet créé contient `filarr.extension.json`, `src/index.ts` (ou `.js`, avec `defineExtension`)
ou `nocode.json`, `exemples/`, un `package.json` avec `dev`, `build`, `check`, `pack`, et un
`README.md`. Il passe `filarr-ext check` tel quel. Un dossier existant et non vide est refusé.

## Dans le dépôt du Builder

```bash
npm install
npm test                                       # tous les paquets
npm run check -w @filarr-examples/inventaire   # un exemple
npm run sync -w @filarr/extension-api          # recopier les fichiers de Filarr (../filarg)
npm run sync -w @filarr/extension-devhost
```

Les copies vendorisées (le validateur de capacités, la page bac à sable, le protocole et le pont)
portent la source qu'elles recopient ; leur test échoue si elles s'écartent de leur empreinte
(`vendor.json`), et, quand `../filarg` est présent (ou `FILARG_DIR`), si elles s'écartent de Filarr.
