# 🍷 Carnet de dégustation — exemple sans code

Fichiers `.degust`. Une fiche par dégustation — vin, thé, café, fromage : note en étoiles, arômes en étiquettes, date, lieu et commentaire.

## Ce qu’il montre

Fichiers `.degust` et non `.degustation` : une extension de fichier tient en 10 caractères au plus
(`^[a-z0-9]{1,10}$`, borne du serveur), et `filarr-ext check` refuse la version longue.

Montre une fiche courte et dense : pastilles (type coloré et **date**), **note en étoiles**,
**étiquettes** d’arômes (Entrée ou virgule pour ajouter, × pour retirer), un petit formulaire et un
commentaire. Le champ `infusions` du second exemple, que la vue ignore, est gardé.

Déclare `fields` (note, date, type) : un dossier de dégustations devient un tableau triable dans Filarr.

Aucune ligne de code : tout est dans [`nocode.json`](nocode.json), lu par le moteur sans code de
Filarr (voir [docs/nocode.md](../../../docs/nocode.md)). Les fichiers de [`exemples/`](exemples/) s’ouvrent dans
le simulateur.

## Le construire

Depuis la racine du dépôt :

```bash
npm install
npm run check -w @filarr-examples/carnet-degustation   # les contrôles du serveur et de Filarr
npm run pack -w @filarr-examples/carnet-degustation    # dist/carnet-degustation-1.0.0.filarrext
npx filarr-ext dev -C examples/nocode/carnet-degustation  # le simulateur, sur http://127.0.0.1:5199
```

Le paquet se remet à Filarr en le déposant dans **Place de marché › Publier**, ou, avec Filarr pour
bureau : `npx filarr-ext publish examples/nocode/carnet-degustation/dist/carnet-degustation-1.0.0.filarrext`. La signature se
fait dans Filarr, après relecture.
