# 🍲 Carnet de recettes — exemple sans code

Fichiers `.recette`. Vos recettes en fiches : catégorie, portions, temps, ingrédients à cocher pendant les courses, étapes numérotées et notes.

## Ce qu’il montre

Montre une fiche **JSON** complète : titre, pastilles (catégorie colorée, portions et temps avec − / +),
une barre de progression des courses, une liste d’ingrédients **à cocher** (ajout, retrait, ordre), des
**étapes numérotées** et des notes libres. Les clés que la vue n’affiche pas (ici `source`) sont gardées
telles quelles à l’enregistrement.

Elle déclare aussi trois **fonctions pures** : `extractText` (la recherche locale de Filarr trouve une
recette par ses ingrédients) et `fields` (portions, temps, catégorie — les colonnes du tableau de
dossier de Filarr).

Aucune ligne de code : tout est dans [`nocode.json`](nocode.json), lu par le moteur sans code de
Filarr (voir [docs/nocode.md](../../../docs/nocode.md)). Les fichiers de [`exemples/`](exemples/) s’ouvrent dans
le simulateur.

## Le construire

Depuis la racine du dépôt :

```bash
npm install
npm run check -w @filarr-examples/carnet-recettes   # les contrôles du serveur et de Filarr
npm run pack -w @filarr-examples/carnet-recettes    # dist/carnet-recettes-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/carnet-recettes  # le simulateur, sur http://127.0.0.1:5199
```

Le paquet se remet à Filarr en le déposant dans **Place de marché › Publier**, ou, avec Filarr pour
bureau : `npx filarr-ext publish examples/nocode/carnet-recettes/dist/carnet-recettes-1.0.0.filarrext`. La signature se
fait dans Filarr, après relecture.
