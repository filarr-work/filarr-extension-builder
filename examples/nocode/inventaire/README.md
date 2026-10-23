# 📦 Inventaire — exemple sans code

Fichiers `.inventaire`. Un inventaire en CSV : articles, quantités, prix unitaires, emplacements ; quantités et valeur du stock calculées. Export CSV.

## Ce qu’il montre

Montre un **CSV à point-virgule** (décimales à la virgule, comme l’enregistre un tableur réglé en
français) : un tableau éditable, des quantités avec − / +, et deux **totaux calculés** — la somme des
quantités et la valeur du stock (`sumProduct` : quantité × prix). La colonne `fournisseur`, que la vue
n’affiche pas, est gardée.

Déclare l’export **CSV** : « Exporter en CSV » dans le menu du fichier, dans Filarr.

Aucune ligne de code : tout est dans [`nocode.json`](nocode.json), lu par le moteur sans code de
Filarr (voir [docs/nocode.md](../../../docs/nocode.md)). Les fichiers de [`exemples/`](exemples/) s’ouvrent dans
le simulateur.

## Le construire

Depuis la racine du dépôt :

```bash
npm install
npm run check -w @filarr-examples/inventaire   # les contrôles du serveur et de Filarr
npm run pack -w @filarr-examples/inventaire    # dist/inventaire-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/inventaire  # le simulateur, sur http://127.0.0.1:5199
```

Le paquet se remet à Filarr en le déposant dans **Place de marché › Publier**, ou, avec Filarr pour
bureau : `npx filarr-ext publish examples/nocode/inventaire/dist/inventaire-1.0.0.filarrext`. La signature se
fait dans Filarr, après relecture.
