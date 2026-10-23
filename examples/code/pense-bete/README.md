# Pense-bête (`.postit`)

Un tableau de notes colorées qu'on déplace à la souris **et** au clavier.

## Ce que l'exemple montre

**La capacité `storage`, pour ce qu'elle est faite : des préférences.** Le zoom
du tableau et les notes repliées sont gardés dans le stockage de l'extension
(`host.storage`), sur cet appareil. Le contenu (position, couleur et texte des
notes) va dans le fichier, par `saveBytes`, comme pour tout éditeur.

Pourquoi ce partage :

- **à vous, pas au fichier.** Deux personnes qui partagent un tableau ne se
  replient pas les notes l'une de l'autre, et replier une note ne coûte pas une
  version du document ;
- **permis en lecture seule.** Zoomer ou replier ne touche pas au document : un
  lecteur peut le faire, rien n'est enregistré dans le fichier ;
- **rien de sensible.** On ne range que des identifiants de notes tirés au hasard
  et un niveau de zoom (`src/preferences.ts`). Le stockage est chiffré par Filarr,
  local à l'appareil et effacé à la désinstallation — mais il n'a ici rien à
  protéger, et c'est voulu : **jamais de contenu dans le stockage.**

`host.storage` n'existe que si la capacité a été déclarée et acceptée. Le code
teste sa présence (`src/memoire.ts`) : sans lui (test local sans compte, par
exemple), les préférences vivent le temps de la session. Un refus du stockage
(`storage_locked`, `quota_exceeded`…) s'affiche discrètement, sans gêner
l'édition. Une seule écriture est en vol à la fois : le pont limite le débit des
requêtes, et c'est la dernière valeur qui part.

**Le clavier autant que la souris.** Chaque note est un groupe focalisable :
flèches pour la déplacer (Maj : plus vite), Entrée pour écrire, Échap pour
revenir à la note, Suppr pour l'effacer. Chaque déplacement est annoncé dans une
région `aria-live`. À la souris, on saisit la note par son en-tête ; le
déplacement tient compte du zoom.

Et, comme tout éditeur : document neuf, lecture seule, `onDirty`, autosave à
2 s, codes de rejet, `getBytes` total, `destroy` qui rend tout, thème et langue
de l'hôte (voir `compteur-mots` pour le détail de chacun).

## Capacités

```json
"capabilities": { "storage": { "quota": 65536 } }
```

64 Kio suffisent largement : une liste d'identifiants et un nombre (le minimum
permis est 1 Kio, le maximum 16 Mio).

## Le format

```json
{ "format": "filarr-postit", "version": 1,
  "notes": [{ "id": "n-3f9a21", "x": 40, "y": 32, "couleur": "jaune", "texte": "Lundi…" }] }
```

Écrit de façon canonique (ordre des clés fixe, deux espaces, saut de ligne final) :
un fichier écrit par l'extension se relit et se réécrit à l'octet près. Chaque
champ lu est borné (positions, couleur parmi six, texte de 10 000 caractères,
500 notes) ; un fichier d'une version future est refusé avec un message, jamais
réécrit dans l'ancien format.

## Construire et vérifier

Depuis ce dossier (les outils sont installés à la racine du dépôt) :

```bash
npm run build   # dist/bundle.js
npm run check   # manifeste, capacités (validateur de Filarr), typage, bundle
npm run smoke   # l'éditeur monté dans une page simulée
npm test        # tests des modules purs
```

## Les fichiers

```
src/index.ts        mount(), le câblage : contenu → saveBytes, affichage → storage
src/postit.ts       le format et ses opérations (pur)
src/preferences.ts  les préférences d'affichage (pur)
src/memoire.ts      les préférences branchées sur host.storage
src/vue.ts          le tableau, la souris, le clavier
src/sauvegarde.ts   l'autosave et les codes de rejet (pur)
exemples/           une semaine, une rétrospective d'atelier
```
