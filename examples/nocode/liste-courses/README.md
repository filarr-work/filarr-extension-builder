# 🛒 Liste de courses — exemple sans code

Fichiers `.courses`. Une liste à cocher en texte brut, une ligne par article : « [ ] lait », « [x] pain ». Titres et notes gardés.

## Ce qu’il montre

Montre le format **lignes** : chaque ligne `[ ] …` ou `[x] …` est un article (une puce `-` ou `*`
devant est permise et reprise). La liste se coche, s’allonge (Entrée dans le champ d’ajout) et se
réordonne ; la barre de progression suit. Les titres, les notes et les lignes vides restent à leur
place : le fichier reste agréable à lire dans un éditeur de texte.

Aucune ligne de code : tout est dans [`nocode.json`](nocode.json), lu par le moteur sans code de
Filarr (voir [docs/nocode.md](../../../docs/nocode.md)). Les fichiers de [`exemples/`](exemples/) s’ouvrent dans
le simulateur.

## Le construire

Depuis la racine du dépôt :

```bash
npm install
npm run check -w @filarr-examples/liste-courses   # les contrôles du serveur et de Filarr
npm run pack -w @filarr-examples/liste-courses    # dist/liste-courses-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/liste-courses  # le simulateur, sur http://127.0.0.1:5199
```

Le paquet se remet à Filarr en le déposant dans **Place de marché › Publier**, ou, avec Filarr pour
bureau : `npx filarr-ext publish examples/nocode/liste-courses/dist/liste-courses-1.0.0.filarrext`. La signature se
fait dans Filarr, après relecture.
