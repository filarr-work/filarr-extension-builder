# 📚 Journal de lecture — exemple sans code

Fichiers `.lecture`. Les livres de l’année en fiches : auteur, statut (à lire, en cours, lu), note en étoiles, dates et avis.

## Ce qu’il montre

Montre une **liste d’objets en cartes** : chaque livre est une carte avec son titre, ses pastilles
(statut coloré, auteur), sa **note en étoiles** (cliquer l’étoile posée la retire), sa date et son avis.
Les cartes s’ajoutent, se retirent et se réordonnent ; deux totaux se recalculent (nombre de livres,
note moyenne). Un champ inconnu dans une carte (ici `pretePar`) est gardé.

Aucune ligne de code : tout est dans [`nocode.json`](nocode.json), lu par le moteur sans code de
Filarr (voir [docs/nocode.md](../../../docs/nocode.md)). Les fichiers de [`exemples/`](exemples/) s’ouvrent dans
le simulateur.

## Le construire

Depuis la racine du dépôt :

```bash
npm install
npm run check -w @filarr-examples/journal-lecture   # les contrôles du serveur et de Filarr
npm run pack -w @filarr-examples/journal-lecture    # dist/journal-lecture-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/journal-lecture  # le simulateur, sur http://127.0.0.1:5199
```

Le paquet se remet à Filarr en le déposant dans **Place de marché › Publier**, ou, avec Filarr pour
bureau : `npx filarr-ext publish examples/nocode/journal-lecture/dist/journal-lecture-1.0.0.filarrext`. La signature se
fait dans Filarr, après relecture.
