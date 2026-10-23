/**
 * Météo — la capacité `network`, vers un seul domaine et sans clé, et un
 * widget d'accueil (`homeWidget`).
 *
 * Deux points d'entrée dans le même bundle : l'éditeur du fichier `.meteo`
 * (la liste des villes suivies) et le widget de l'accueil (la météo d'UNE
 * ville, celle de son réglage). Tous deux parlent à Internet par
 * `host.network` : chaque requête est montrée à l'utilisateur par Filarr
 * avant de partir, et `network` exclut le stockage, le sélecteur, les
 * fonctions pures et le bloc de note — une extension qui parle à Internet ne
 * lit rien d'autre que ce qu'on lui donne.
 */

import { monterEditeur } from './editeur';
import { monterWidget } from './widget';

export const EDITOR_ID = 'meteo-editor';

const ids = [EDITOR_ID];
for (let i = 1; i <= 8; i++) ids.push(`dev-local-${i}-editor`);

globalThis.filarrSandboxedPlugin = {
  editors: ids.map((id) => ({ id, mount: monterEditeur })),
  widget: { mount: monterWidget },
};
