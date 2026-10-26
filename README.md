# Filarr Extension Builder

Créer, tester et empaqueter des extensions pour [Filarr](https://filarr.com), avec ou sans code.

- `packages/` — l'API, le moteur sans code, le simulateur et les outils en ligne de commande ;
- `apps/builder` — l'atelier dans le navigateur ([docs/atelier.md](docs/atelier.md)) ;
- `examples/` — vingt extensions d'exemple, dix avec du code et dix sans code ;
- `docs/` — le guide : [l'atelier](docs/atelier.md), [la ligne de commande](docs/cli.md),
  [le moteur sans code](docs/nocode.md).

![Filarr Builder : composer une extension sans code, avec l'aperçu du vrai moteur](docs/assets/screenshots/03-vue-et-style.webp)

Le contrat côté Filarr (protocole du bac à sable, capacités, format du paquet `.filarrext`)
est décrit dans le dépôt de l'application : `docs/plugins/API.md`, `CAPACITES.md`,
`PACKAGE.md`.
