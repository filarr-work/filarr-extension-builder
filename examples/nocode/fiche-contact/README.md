# 📇 Fiche contact — exemple sans code

Fichiers `.contact`. Une fiche par personne, en clair « clé: valeur » : nom, e-mail, site, téléphone, adresse, anniversaire et étiquettes.

## Ce qu’il montre

Montre le format **clé: valeur** (une valeur par ligne, lisible et modifiable partout) : un titre, des
**liens sûrs** (`mailto:` et `https:` seulement — jamais `javascript:`), un formulaire de champs, une date
et des étiquettes. Les lignes que la configuration ne connaît pas (ici `rencontre`) et les commentaires
`#` restent à leur place, mot pour mot ; une ligne modifiée garde son préfixe d’origine.

Déclare `extractText` : la recherche de Filarr retrouve un contact par sa société ou ses étiquettes.

Aucune ligne de code : tout est dans [`nocode.json`](nocode.json), lu par le moteur sans code de
Filarr (voir [docs/nocode.md](../../../docs/nocode.md)). Les fichiers de [`exemples/`](exemples/) s’ouvrent dans
le simulateur.

## Le construire

Depuis la racine du dépôt :

```bash
npm install
npm run check -w @filarr-examples/fiche-contact   # les contrôles du serveur et de Filarr
npm run pack -w @filarr-examples/fiche-contact    # dist/fiche-contact-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/fiche-contact  # le simulateur, sur http://127.0.0.1:5199
```

Le paquet se remet à Filarr en le déposant dans **Place de marché › Publier**, ou, avec Filarr pour
bureau : `npx filarr-ext publish examples/nocode/fiche-contact/dist/fiche-contact-1.0.0.filarrext`. La signature se
fait dans Filarr, après relecture.
