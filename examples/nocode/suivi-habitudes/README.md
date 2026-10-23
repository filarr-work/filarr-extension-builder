# ✅ Suivi d’habitudes — exemple sans code

Fichiers `.habitudes`. Une semaine par fichier, en CSV : une habitude par ligne, une case par jour. Le bilan se calcule tout seul.

## Ce qu’il montre

Montre le format **CSV** : un **tableau éditable** (une case par jour, écrite `x` ou vide), des
lignes qu’on ajoute et retire, et une section de **totaux calculés** (`count`, `countChecked`). Une
colonne que la configuration ne déclare pas (ici `note`) est gardée ; une ligne non touchée repart
octet pour octet.

Déclare `fields` : dans un dossier de semaines, le tableau de Filarr montre combien d’habitudes ont été
tenues chaque jour, semaine par semaine.

Aucune ligne de code : tout est dans [`nocode.json`](nocode.json), lu par le moteur sans code de
Filarr (voir [docs/nocode.md](../../../docs/nocode.md)). Les fichiers de [`exemples/`](exemples/) s’ouvrent dans
le simulateur.

## Le construire

Depuis la racine du dépôt :

```bash
npm install
npm run check -w @filarr-examples/suivi-habitudes   # les contrôles du serveur et de Filarr
npm run pack -w @filarr-examples/suivi-habitudes    # dist/suivi-habitudes-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/suivi-habitudes  # le simulateur, sur http://127.0.0.1:5199
```

Le paquet se remet à Filarr en le déposant dans **Place de marché › Publier**, ou, avec Filarr pour
bureau : `npx filarr-ext publish examples/nocode/suivi-habitudes/dist/suivi-habitudes-1.0.0.filarrext`. La signature se
fait dans Filarr, après relecture.
