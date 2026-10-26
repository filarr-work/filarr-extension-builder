# @filarr/nocode-engine

Le moteur sans code des extensions [Filarr](https://filarr.com) : il lit un fichier (JSON, CSV,
lignes, `clé: valeur`), l'affiche avec des blocs et le réécrit, d'après une configuration
(`nocode.json`). Il n'exécute jamais rien de ce qu'il lit et n'insère aucun HTML.

Ce paquet sert à `filarr-ext` et à Filarr Builder ; pour créer une extension sans code :

```bash
npm create filarr-extension@latest mes-recettes -- --template nocode
```

Le schéma de la configuration et la liste des blocs : [docs/nocode.md](https://github.com/filarr-work/filarr-extension-builder/blob/main/docs/nocode.md).
