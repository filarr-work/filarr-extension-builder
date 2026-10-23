# 📖 Glossaire — exemple sans code

Fichiers `.glossaire`. Un glossaire en texte brut, une définition par ligne : « terme: définition ». Ajout, retrait, renommage des termes.

## Ce qu’il montre

Montre le format **clé: valeur en mode `entries`** : TOUTES les lignes forment une liste qu’on édite
dans un tableau — on renomme un terme, on change sa définition, on en ajoute, on en retire. Les
commentaires `#` restent à leur place. Déclare `extractText` : la recherche de Filarr retrouve un
glossaire par ses définitions.

Aucune ligne de code : tout est dans [`nocode.json`](nocode.json), lu par le moteur sans code de
Filarr (voir [docs/nocode.md](../../../docs/nocode.md)). Les fichiers de [`exemples/`](exemples/) s’ouvrent dans
le simulateur.

## Le construire

Depuis la racine du dépôt :

```bash
npm install
npm run check -w @filarr-examples/glossaire   # les contrôles du serveur et de Filarr
npm run pack -w @filarr-examples/glossaire    # dist/glossaire-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/glossaire  # le simulateur, sur http://127.0.0.1:5199
```

Le paquet se remet à Filarr en le déposant dans **Place de marché › Publier**, ou, avec Filarr pour
bureau : `npx filarr-ext publish examples/nocode/glossaire/dist/glossaire-1.0.0.filarrext`. La signature se
fait dans Filarr, après relecture.
