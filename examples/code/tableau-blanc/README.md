# Tableau blanc (`.tableau`) — co-édition en direct

Un tableau blanc à plusieurs, en direct, dans un coffre partagé : traits à main
levée et textes, que chacun déplace, efface ou annule. Hors d'un coffre partagé,
il s'utilise seul, à l'identique.

## Ce que l'exemple montre

**La capacité `collab`, selon le motif de `docs/plugins/API.md` §3**
(`src/salle.ts`). L'extension ne reçoit jamais le document de la salle, ni clé,
ni jeton, ni présence : elle tient **son** `Y.Doc` (Yjs est embarqué dans le
bundle, ~100 Kio) et échange des **octets** avec l'hôte.

1. `const doc = new Y.Doc()` ;
2. appliquer `host.collab.initialUpdates` — ce que la salle contient déjà ;
3. si `host.collab.seed` : construire le document depuis `initialBytes`, puis
   `seeded()`, une fois ;
4. `doc.on('update', (u, origin) => origin !== 'remote' && host.collab.sendUpdate(u))` ;
5. `host.collab.onRemoteUpdate((u) => Y.applyUpdate(doc, u, 'remote'))` ;
6. n'enregistrer par `saveBytes` que si `host.collab.isResponsible()`.

Une précision d'ordre que le texte d'API.md laisse ouverte : l'écouteur de
l'étape 4 est posé **avant** le semis de l'étape 3. Posé après, l'update du semis
ne partirait jamais et les autres pages verraient une salle vide. Le semis se
fait par lots, chacun sous le plafond d'**1 Mio par update** (au-delà, la page
jette `collab_update_too_large`).

**Seul l'élu enregistre — pour toute la salle.** L'élu (décidé par l'hôte, jamais
par l'extension) enregistre aussi les modifications des **autres** : elles sont
dans son `Y.Doc`. Les autres pages ne signalent rien à l'hôte et affichent
« Enregistré par un autre participant ». Quand l'élu change
(`onResponsibleChange`), le nouveau reprend ce qui n'a pas encore été enregistré.

**Le fichier reste du JSON** (`src/tableau.ts`) ; le `Y.Doc` n'est qu'un état de
travail. Sa forme est choisie pour la co-édition :

- une `Y.Map` d'identifiant vers objet simple : modifier un élément, c'est le
  remplacer (le dernier qui écrit gagne, élément par élément) ;
- l'ordre d'affichage est porté par `z` puis `id`, pas par l'ordre de la map :
  deux pairs qui ont reçu les mêmes updates écrivent **les mêmes octets** ;
- semer deux fois le même fichier (le filet de l'hôte quand le premier semeur
  tarde) pose les mêmes clés aux mêmes valeurs : **aucun doublon**.

**Annuler ne défait que ses propres gestes** : `Y.UndoManager` ne suit que
l'origine locale. On n'efface pas le trait que quelqu'un d'autre vient de tracer.

**Une update ne se valide pas** — l'hôte l'écrit lui-même : un pair malveillant
peut vider le tableau, comme il pourrait l'écraser par `saveBytes` (le dégât est
borné en taille et en débit, et réversible par les révisions). L'extension
revalide donc chaque élément reçu comme s'il venait d'un fichier inconnu
(`lireElement`) : couleurs `#rrggbb`, nombres bornés, textes sans saut de ligne.

**Lecture seule** : un lecteur voit la salle en direct, mais n'envoie rien
(`sendUpdate` jetterait `read_only`) et n'enregistre rien.

**Le clavier** : Tab parcourt les éléments, les flèches les déplacent (Maj : plus
vite), Suppr les efface, Entrée sur un texte ouvre son champ ; « Ajouter un
texte » ne demande pas de pointeur. Tracer un trait, lui, se fait au pointeur.

## Capacités

```json
"capabilities": { "collab": true }
```

Trois conditions pour que `host.collab` existe : la capacité déclarée et
acceptée à l'installation (« Éditer à plusieurs, en direct, dans un coffre
partagé »), un document ouvert dans un coffre partagé, et un document de 5 Mio
au plus. Sinon `host.collab` vaut `undefined` : c'est le chemin par défaut, et
l'éditeur le gère.

Débit : 60 updates par seconde (rafale 120) et 2 Mio/s ; au-delà, le pont coupe
(`sandbox_collab_abuse`). Un trait n'émet qu'**une** update, au lâcher ; un
déplacement aussi.

## Ce qui reste à la charge de l'auteur

Deux pairs peuvent faire tourner deux versions différentes de l'extension sur la
même salle (`COLLAB-DESIGN.md`, §4.5) : gardez la forme du `Y.Doc` compatible
d'une version à l'autre, ou changez de racine.

## Construire et vérifier

```bash
npm run build && npm run check && npm run smoke && npm test
```

Le banc d'essai joue la salle à trois pages (une qui sème, une qui rejoint, un
lecteur), relaie les updates comme l'hôte, et vérifie : un seul `seeded()`,
convergence des octets, seul l'élu enregistre, passage de relais à un nouvel
élu, double semis sans doublon, et le mode seul.

## Les fichiers

```
src/index.ts     mount(), l'élu, l'historique local, l'autosave
src/salle.ts     le motif d'API.md §3 (et le mode seul)
src/tableau.ts   le format JSON et sa forme dans le Y.Doc
src/vue.ts       la surface SVG, le crayon, la sélection, le clavier
exemples/        un atelier de réflexion, un plan de salon
```
