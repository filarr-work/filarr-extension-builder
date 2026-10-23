# Compte à rebours (`.rebours` et bloc de note)

Une liste d'évènements datés, chacun avec son compte à rebours qui avance à la
seconde — et un **bloc à glisser dans une note**, qui affiche le temps qui reste
avant un moment choisi.

## Ce que l'exemple montre

**Un bundle, deux points d'entrée.** `editors` monte l'éditeur du fichier
`.rebours` (`src/editeur.ts`) ; `block` monte le bloc de note (`src/bloc.ts`).
L'hôte choisit lequel (`host.mode` vaut `'editor'` ou `'block'`), et chacun
reçoit **ses** octets : le fichier ouvert, ou les données du bloc.

**La capacité `noteBlock` : des données en octets, par `saveBytes`.** Le bloc
ne voit rien de la note qui l'accueille — seulement ses propres données
(`host.initialBytes`, ici `{ "v": 1, "titre": "…", "date": "…" }`). Les régler
appelle `host.saveBytes(…)`, qui les réécrit dans le nœud du bloc ; c'est la
note qui les range (en base64 dans son HTML), les chiffre et les synchronise,
comme le reste de son contenu. Elles doivent tenir dans **256 Kio** une fois
décodées. Les mêmes règles que pour un éditeur s'appliquent :

- 0 octet = bloc neuf : le formulaire s'ouvre pour le régler ;
- lecture seule (note non modifiable, lecteur du coffre) : affichage seul ;
- enregistrement débouncé à 2 s, codes de rejet affichés (`read_only`, `too_large`…) ;
- des données illisibles ne sont **pas** réécrites d'office : le bloc le dit,
  et ne les remplace que si l'utilisateur le règle ;
- `destroy()` arrête l'horloge et rend tout.

Sans l'extension, la note garde le bloc intact et affiche un cadre « extension
non installée » : un bloc n'est jamais vidé parce qu'on ne sait pas l'afficher.

> ⚠ État de Filarr au 23 octobre 2026 : le nœud `filarrExtensionBlock` existe,
> mais l'insertion d'un bloc d'extension est encore **fermée** sur le bureau
> (`EXTENSION_BLOCK_INSERTION_OPEN = false`), en attendant que l'application
> mobile sache garder ce nœud. Le bloc se monte et se teste ici (`npm run smoke`),
> il ne s'insère pas encore depuis un menu de Filarr.

**Une horloge, pas une par évènement** (`src/affichage.ts`) : une seule
minuterie récrit chaque seconde le texte des comptes, et `destroy()` l'arrête.
Les comptes ne sont pas dans une région `aria-live` — un lecteur d'écran qui
annoncerait chaque seconde rendrait la page inutilisable ; la date exacte est
dans `<time datetime>`.

**Des instants, pas des heures murales.** Les dates sont rangées en UTC
(`2026-12-19T17:42:00.000Z`) : deux personnes dans deux fuseaux attendent le
même moment. L'interface les montre et les saisit en heure locale
(`<input type="datetime-local">`), validées à la sortie du champ.

## Capacités

```json
"capabilities": { "noteBlock": { "label": "Compte à rebours" } }
```

Le libellé est ce que Filarr affichera dans le menu d'insertion des notes.

## Les formats

```json
{ "format": "filarr-rebours", "version": 1,
  "evenements": [{ "id": "e-7b33d4", "titre": "Départ en vacances", "date": "2026-12-19T17:42:00.000Z", "note": "…" }] }
```

Écriture canonique (un fichier écrit par l'extension se relit à l'octet près),
liste tenue dans l'ordre du temps. Les données d'un bloc : `{ "v": 1, "titre", "date" }`.

## Construire et vérifier

```bash
npm run build && npm run check && npm run smoke && npm test
```

Le banc d'essai monte aussi le bloc (`smoke.json`, clé `bloc`) : neuf, réglé,
en lecture seule.

## Les fichiers

```
src/index.ts      les deux points d'entrée
src/editeur.ts    l'éditeur du fichier .rebours
src/bloc.ts       le bloc de note
src/rebours.ts    les formats, le calcul du compte, les dates locales (pur)
src/affichage.ts  le texte d'un compte, l'horloge unique
exemples/         une année d'évènements, un lancement de produit, les données d'un bloc
```
