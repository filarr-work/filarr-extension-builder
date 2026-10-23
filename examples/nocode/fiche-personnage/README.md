# 🧙 Fiche de personnage — exemple sans code

Fichiers `.perso`. Une fiche de personnage de jeu de rôle : classe, niveau, points de vie, caractéristiques en barres, traits, inventaire et histoire.

## Ce qu’il montre

Montre des **champs imbriqués** (`caracteristiques.force`…), chacun en **nombre** avec − / + et en
**barre** sur 20, une barre de santé dont le maximum est un autre champ (`maxField`), des étiquettes, un
tableau d’inventaire avec son total, et la capacité **`newDocument`** : Filarr propose « Nouveau
personnage » et crée le fichier depuis un **modèle de départ** (`modeles/nouveau.perso`, en base64 dans
`manifest.capabilities.newDocument[0].seed` — `npx filarr-ext seed modeles/nouveau.perso` le recalcule ;
`check` vérifie qu’il s’ouvre avec la configuration).

Aucune ligne de code : tout est dans [`nocode.json`](nocode.json), lu par le moteur sans code de
Filarr (voir [docs/nocode.md](../../../docs/nocode.md)). Les fichiers de [`exemples/`](exemples/) s’ouvrent dans
le simulateur.

## Le construire

Depuis la racine du dépôt :

```bash
npm install
npm run check -w @filarr-examples/fiche-personnage   # les contrôles du serveur et de Filarr
npm run pack -w @filarr-examples/fiche-personnage    # dist/fiche-personnage-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/fiche-personnage  # le simulateur, sur http://127.0.0.1:5199
```

Le paquet se remet à Filarr en le déposant dans **Place de marché › Publier**, ou, avec Filarr pour
bureau : `npx filarr-ext publish examples/nocode/fiche-personnage/dist/fiche-personnage-1.0.0.filarrext`. La signature se
fait dans Filarr, après relecture.
