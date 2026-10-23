# Météo (`.meteo` et widget d'accueil)

Suivez la météo de vos villes, et affichez celle de l'une d'elles sur l'accueil
de Filarr. Les prévisions viennent d'[Open-Meteo](https://open-meteo.com), sans clé.

## Ce que l'exemple montre

**La capacité `network`, vers un seul domaine.** L'extension ne parle qu'à
`api.open-meteo.com`, par `host.network.request(…)`. Elle n'a aucun réseau
direct (la CSP de la page coupe `fetch`) : chaque requête passe par le relais de
Filarr, qui la **montre à l'utilisateur** avant de l'envoyer — méthode, adresse
complète, en-têtes, corps. Une requête identique déjà acceptée pendant la session
passe sans redemander ; c'est pourquoi l'adresse est **stable** (`src/openmeteo.ts` :
coordonnées arrondies à 4 décimales, paramètres dans un ordre fixe) — le widget
qui s'actualise toutes les trente minutes ne redemande rien.

**Demander le moins possible.** Le répertoire de villes est embarqué
(`src/villes.ts`) : pas de second domaine, et ce que l'utilisateur tape dans la
recherche ne sort jamais. Une ville absente se saisit par ses coordonnées.
L'éditeur ne lance **aucune** requête à l'ouverture : seulement quand on clique
« Voir la météo » (ou « Tout actualiser », qui enchaîne les demandes une à une
plutôt que d'en empiler plus de quatre, au-delà desquelles Filarr répond `busy`).

**Tous les refus ont leur message** (`src/i18n.ts`, `messageEchec`) — ce n'est pas
une panne de l'extension, c'est le contrat :

| Cas | Code | Ce que l'extension dit |
| --- | --- | --- |
| Capacité non accordée | `host.network` absent | l'accès à Internet n'a pas été accordé |
| L'utilisateur refuse (ou bloque l'extension pour la session) | `net_refused` | requête refusée, rien n'a été envoyé ; le widget cesse de s'actualiser seul et propose « Réessayer » |
| **Web** : pas de relais réseau | `unavailable` | disponible seulement dans l'application de bureau |
| Hors ligne, hôte injoignable | `net_unreachable` | service injoignable |
| Trop de demandes en attente | `busy`, `rate_limited`, `too_many_requests` | réessayer dans un instant |
| Un statut HTTP ≠ 200 | (réponse, pas rejet) | le service a répondu par une erreur (n) |

**La réponse est lue comme hostile** : seuls des nombres vérifiés en sont gardés.
Et la météo n'est **jamais écrite** dans le fichier : le document ne garde que des
villes et des coordonnées.

**La capacité `homeWidget`** (`src/widget.ts`). Le widget est monté en mode
`widget`, **toujours en lecture seule**, et sa seule donnée est le réglage saisi
dans les options du bloc d'accueil (240 caractères au plus, en UTF-8 dans
`host.initialBytes`) : `Lyon`, `45.764, 4.8357` ou `Chez moi | 45.76 | 4.83`. Il ne
lit pas le fichier `.meteo` — l'éditeur affiche, pour chaque ville, le réglage à
recopier. Le widget a lui aussi `host.network` (même capacité, même consentement).

**Ce que `network` exclut.** Une extension réseau ne peut déclarer ni `storage`,
ni `picker`, ni `functions`, ni `noteBlock` (`network_exclusive`) : elle ne lit
jamais vos fichiers ET ne parle jamais à Internet sans vous. D'où l'absence de
vignette ou de recherche pour ces fichiers : c'est voulu.

> ⚠ État de Filarr au 23 octobre 2026 : le relais réseau n'existe que sur le
> **bureau** (sur le web, `unavailable`). Le composant du widget d'accueil est
> prêt, mais le type `extension` n'entre au registre des blocs d'accueil qu'une
> fois l'application mobile prête à le garder : le widget se monte et se teste
> ici (`npm run smoke`), il ne s'ajoute pas encore depuis l'accueil.

## Capacités

```json
"capabilities": {
  "network": { "domains": ["api.open-meteo.com"] },
  "homeWidget": { "label": "Météo" }
}
```

Domaines : hôtes exacts, en minuscules, HTTPS implicite, sous-domaines refusés —
`geocoding-api.open-meteo.com` serait un autre domaine, à déclarer à part.

## Construire et vérifier

```bash
npm run build && npm run check && npm run smoke && npm test
```

Rien ne part sur le réseau pendant les vérifications : le banc d'essai répond
avec `exemples/reponses/*.json` (`smoke.json`, clé `reseau`), et joue aussi le web
(`unavailable`), le refus (`net_refused`) et un réglage vide.

## Les fichiers

```
src/index.ts      les deux points d'entrée : éditeur et widget
src/editeur.ts    les villes suivies, la météo à la demande
src/widget.ts     le bloc d'accueil
src/client.ts     une requête par host.network, et ses refus
src/openmeteo.ts  l'adresse, la réponse, les codes météo (pur)
src/meteo.ts      le format .meteo et le réglage du widget (pur)
src/villes.ts     le répertoire embarqué (pur)
exemples/         des villes suivies, un chalet par ses coordonnées,
                  et deux réponses d'Open-Meteo pour les tests
```
