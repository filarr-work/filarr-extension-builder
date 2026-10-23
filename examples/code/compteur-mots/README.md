# Compteur de mots (`.wc`)

Le démarrage rapide de Filarr, en TypeScript et testé : une zone de texte, et en
direct le nombre de mots, de caractères et le temps de lecture.

C'est l'exemple à lire en premier. Il ne fait presque rien, mais il fait tout ce
qu'un éditeur doit faire pour être accepté par l'hôte :

| Le contrat (`docs/plugins/API.md`)               | Où le voir                                     |
| ------------------------------------------------ | ---------------------------------------------- |
| L'éditeur s'appelle exactement `<id>-editor`     | `src/index.ts`, `EDITOR_ID`                    |
| 0 octet = document neuf                          | `lireTexte` rend un texte vide                 |
| Format inconnu : erreur affichée, octets rendus intacts | branche `!lu.ok` de `mount`             |
| `readOnly` fige l'interface                      | `zone.readOnly = host.readOnly`                |
| `onDirty(true)` à chaque frappe, `false` au succès seulement | `src/sauvegarde.ts`                |
| Autosave débouncée à 2 s, Ctrl+S pour forcer     | `src/sauvegarde.ts`, `estRaccourciEnregistrer` |
| Codes de rejet : `item_version_conflict`, `read_only`, `save_in_flight`, autres | `src/sauvegarde.ts`, `src/etat.ts` |
| `getBytes()` total et synchrone                  | `ecrireTexte(zone.value, …)`                   |
| `destroy()` rend tout, ne sauve rien             | fin de `mount`                                 |
| Thème de l'hôte (`--color-*`) et `onThemeChange` | `src/style.ts`, `data-schema`                  |
| Français ou anglais selon `host.locale`          | `src/i18n.ts`                                  |
| Jamais `innerHTML`                               | `src/dom.ts`                                   |

Deux soins qu'un éditeur de texte doit à ses fichiers : la marque d'ordre des
octets (BOM) et les fins de ligne `\r\n` sont gardées telles quelles. Sans eux, la
première ouverture réécrirait un fichier auquel personne n'a touché.

## Capacités

**Aucune.** L'extension ne reçoit que le document ouvert, et c'est tout ce dont
elle a besoin. C'est le cas par défaut, et le meilleur : rien à accepter à
l'installation, rien à expliquer.

## Le format

Du texte brut UTF-8. Un fichier qui n'est pas de l'UTF-8 valide est refusé avec
un message, jamais « réparé » : le décoder en remplaçant les octets invalides puis
l'enregistrer détruirait son contenu.

## Construire et vérifier

Depuis ce dossier (les outils sont installés à la racine du dépôt) :

```bash
npm run build   # dist/bundle.js — IIFE, es2020, minifié
npm run check   # manifeste, bornes de publication, typage, forme du bundle
npm run smoke   # monte l'éditeur dans une page simulée et joue le contrat
npm test        # tests des modules purs (compte, texte, sauvegarde)
```

## L'essayer dans Filarr

Place de marché › Publier › **Tester localement** : choisissez `dist/bundle.js`,
extension `wc`. Le test local demande un éditeur `dev-local-<n>-editor` : le
bundle expose ces alias en plus de `compteur-mots-editor` (voir la fin de
`src/index.ts`).

## Les fichiers

```
src/index.ts       mount(), le câblage à l'hôte
src/compte.ts      mots, caractères, temps de lecture (pur)
src/texte.ts       le format : UTF-8, BOM, fins de ligne (pur)
src/sauvegarde.ts  l'autosave et les codes de rejet (pur)
src/etat.ts        la barre d'état : role="status" et role="alert"
src/dom.ts         createElement, jamais de HTML
exemples/          une lettre, des notes en CRLF, un fichier avec BOM
smoke.json         ce que le banc d'essai tape pour tester l'enregistrement
```
