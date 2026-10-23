# Sous-titres (`.srt`, import des `.vtt`)

Édite des sous-titres SubRip : temps de début et de fin, texte, décalage global.
Ouvre aussi les WebVTT et les convertit en `.srt`.

## Ce que l'exemple montre

**`imports: ["vtt"]`** — Filarr ouvre aussi les `.vtt` avec cet éditeur. Le
fichier d'origine n'est **jamais** réécrit : la première sauvegarde crée un
`.srt` à côté (c'est l'hôte qui le crée, avec le nom du fichier et l'extension
native de l'éditeur). L'éditeur lit donc deux formats et n'en écrit qu'un
(`src/srt.ts`). Ce que SRT ne sait pas dire — réglages de position
(`align:start`), blocs `STYLE`, `NOTE`, `REGION`, voix `<v Alice>` — est compté
et annoncé dans un bandeau, jamais passé sous silence ; les voix deviennent
« Alice: … », les balises `<i>`, `<b>`, `<u>` sont gardées.

**`functions.extractText`** — la recherche locale de Filarr trouve une
réplique par ce qui est **dit** : sans numéros, sans temps, sans balises.
Chercher « serrurier » trouve le fichier ; chercher « 00:00:12 » ne trouve rien.

**`functions.exports`** — « Exporter en texte » produit une transcription en
paragraphes (un silence de plus de deux secondes en ouvre un nouveau),
« Exporter en JSON » les répliques avec leurs temps (millisecondes et `HH:MM:SS,mmm`).

**Valider sans corriger.** Un temps se valide à la sortie du champ (ou Entrée),
pas à chaque frappe ; un temps illisible reste affiché, marqué `aria-invalid`,
avec le format attendu. Une fin avant le début, ou un chevauchement avec la
réplique suivante, est signalé sous la ligne — un chevauchement peut être voulu,
c'est à l'utilisateur de trancher.

**Le clavier.** Alt+↑/↓ : même champ, réplique précédente ou suivante.
Ctrl+Entrée : insérer une réplique après celle-ci, dans le trou qui suit.

Et le contrat de tout éditeur : document neuf, lecture seule, `onDirty`,
autosave à 2 s, codes de rejet, `getBytes` total (toujours du SRT, même pour un
`.vtt` importé), `destroy`, thème, langue.

## Capacités

```json
"capabilities": {
  "imports": ["vtt"],
  "functions": {
    "extractText": true,
    "exports": [{ "to": "txt", "label": "Transcription (texte)" }, { "to": "json", "label": "Répliques en JSON" }]
  }
}
```

`imports` doit être disjoint de `extensions` (le validateur de Filarr le
vérifie). Les fonctions acceptent aussi un `.vtt` : la lecture reconnaît le
format à son contenu (`WEBVTT`) autant qu'à son nom.

## Le format écrit

Canonique : blocs numérotés à partir de 1, séparés par une ligne vide, temps en
`HH:MM:SS,mmm`. La marque d'ordre des octets et les fins de ligne `\r\n` (très
courantes en SRT) sont gardées : un fichier bien formé se relit et se réécrit à
l'octet près. Une ligne vide dans un texte est retirée — elle couperait le bloc.

## Construire et vérifier

```bash
npm run build && npm run check && npm run smoke && npm test
```

## Les fichiers

```
src/index.ts       mount(), le câblage
src/srt.ts         lire SRT et WebVTT, écrire SRT (pur)
src/operations.ts  insérer, supprimer, décaler, trier, valider (pur)
src/fonctions.ts   texte parlé, transcription, JSON — les fonctions pures
src/vue.ts         la liste des répliques, le clavier
exemples/          un court-métrage en CRLF, un entretien avec BOM,
                   une conférence en WebVTT (voix, styles, réglages, notes)
```
