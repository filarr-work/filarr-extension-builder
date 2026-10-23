# 🗓️ Planning de la semaine — exemple sans code

Fichiers `.semaine`. Une semaine par fichier : une section par jour, chacune avec sa liste de tâches à cocher, et la progression de la semaine.

## Ce qu’il montre

Montre les **sections** : une par jour (le week-end replié par défaut), chacune avec sa barre de
progression et sa **liste à cocher** propre. Les sept listes sont sept champs du même document JSON ;
ajouter une tâche le lundi ne touche à rien d’autre.

Aucune ligne de code : tout est dans [`nocode.json`](nocode.json), lu par le moteur sans code de
Filarr (voir [docs/nocode.md](../../../docs/nocode.md)). Les fichiers de [`exemples/`](exemples/) s’ouvrent dans
le simulateur.

## Le construire

Depuis la racine du dépôt :

```bash
npm install
npm run check -w @filarr-examples/planning-semaine   # les contrôles du serveur et de Filarr
npm run pack -w @filarr-examples/planning-semaine    # dist/planning-semaine-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/planning-semaine  # le simulateur, sur http://127.0.0.1:5199
```

Le paquet se remet à Filarr en le déposant dans **Place de marché › Publier**, ou, avec Filarr pour
bureau : `npx filarr-ext publish examples/nocode/planning-semaine/dist/planning-semaine-1.0.0.filarrext`. La signature se
fait dans Filarr, après relecture.
