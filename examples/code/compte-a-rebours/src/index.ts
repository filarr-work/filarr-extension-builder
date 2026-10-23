/**
 * Compte à rebours — un éditeur d'évènements datés (`.rebours`), et un BLOC DE
 * NOTE qui affiche un compte à rebours (capacité `noteBlock`).
 *
 * Un même bundle, deux points d'entrée : `editors` pour le fichier, `block`
 * pour la note. L'hôte choisit lequel monter (`host.mode`), et chacun reçoit
 * ses propres octets : le fichier ouvert, ou les données du bloc.
 */

import { monterBloc } from './bloc';
import { monterEditeur } from './editeur';

export const EDITOR_ID = 'compte-a-rebours-editor';

const ids = [EDITOR_ID];
for (let i = 1; i <= 8; i++) ids.push(`dev-local-${i}-editor`);

globalThis.filarrSandboxedPlugin = {
  editors: ids.map((id) => ({ id, mount: monterEditeur })),
  block: { mount: monterBloc },
};
