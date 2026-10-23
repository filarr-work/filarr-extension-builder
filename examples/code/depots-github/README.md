# Dépôts GitHub (`.github`)

Suivez des dépôts GitHub : étoiles, tickets ouverts, dernière version — et ce qui
a changé depuis le dernier relevé.

## Ce que l'exemple montre

**Un secret que l'extension ne voit jamais.** Le manifeste déclare un secret,
facultatif, attaché à l'en-tête `authorization` :

```json
"network": {
  "domains": ["api.github.com"],
  "secrets": [{ "id": "jeton_github", "label": "Jeton GitHub, sous la forme « Bearer ghp_… »", "header": "authorization" }]
}
```

Ce qui se passe, et qui ne dépend pas de la bonne foi de l'extension :

1. l'utilisateur saisit son jeton **dans Filarr** (Mes extensions › Dépôts GitHub ›
   Secrets) — jamais dans l'extension ;
2. Filarr l'envoie **une fois** au processus principal, qui le scelle dans le
   trousseau de l'appareil (sans trousseau, rien n'est enregistré) ; même
   l'interface de Filarr ne sait ensuite que « présent » ;
3. à chaque requête vers `api.github.com`, le relais **ajoute lui-même** l'en-tête
   `authorization`. L'extension ne le lit pas, ne peut pas le poser (l'hôte
   refuserait la requête : `net_header`), et une redirection ne l'emporte jamais
   vers un autre hôte ;
4. le secret part à la désinstallation.

L'extension ne sait donc pas si un jeton est là — seulement ses effets : une
limite de débit plus haute (5 000 requêtes par heure au lieu de 60), ou un 401 si
GitHub le refuse. Le texte du secret est saisi **tel quel** dans l'en-tête : pour
GitHub, c'est `Bearer ` suivi du jeton (d'où le libellé). Un jeton en lecture
seule suffit.

**La capacité `network`, et ses refus.** Chaque requête est montrée à
l'utilisateur par Filarr avant de partir (méthode, adresse, en-têtes, et les
secrets qui seront ajoutés, par leur libellé). Un relevé coûte **deux** requêtes
(le dépôt, puis sa dernière version) : elles partent l'une après l'autre, et
« Tout actualiser » enchaîne les dépôts au lieu d'empiler les demandes (Filarr
en garde quatre en attente au plus, puis répond `busy`). Chaque échec a son
message (`src/i18n.ts`) : refus (`net_refused`), web sans relais (`unavailable`),
hors ligne, jeton refusé (401), limite de GitHub (403 « rate limit », 429),
dépôt introuvable ou privé (404). Le 404 de `/releases/latest` n'est pas une
erreur : il veut dire « aucune version publiée ».

**Ce que le fichier garde.** La liste des dépôts et leur dernier relevé — c'est
ce qui permet de signaler « nouvelle version depuis le dernier relevé ». Un relevé
ne s'écrit que sur un geste (« Actualiser »), jamais à l'ouverture. En lecture
seule, on peut actualiser : le résultat s'affiche, le fichier ne change pas.

**Ce que `network` exclut** : ni `storage`, ni `picker`, ni `functions`, ni
`noteBlock`. L'extension ne lit rien d'autre que le fichier ouvert.

> ⚠ Le relais réseau n'existe que dans l'application de **bureau** ; sur le web,
> toute requête rend `unavailable`, et l'extension le dit.

## Construire et vérifier

```bash
npm run build && npm run check && npm run smoke && npm test
```

Rien ne part sur le réseau pendant les vérifications : le banc d'essai répond
avec `exemples/reponses/*.json` (`smoke.json`, clé `reseau`), y compris un 404 et
une limite de débit. Les tests vérifient qu'aucune requête ne porte l'en-tête
`authorization`.

## Les fichiers

```
src/index.ts      mount(), les relevés, la liste
src/github.ts     les deux requêtes, la lecture des réponses, les statuts de GitHub
src/depots.ts     le format .github et les noms de dépôt (pur)
src/i18n.ts       les textes, et le message de chaque échec
exemples/         une veille de trois dépôts (dont un jamais relevé), un fichier
                  neuf, et des réponses réelles de l'API pour les tests
```
