/**
 * boot — le point d'entrée du MOTEUR tel qu'il voyage dans un bundle sans code.
 *
 * Le bundle est ce moteur (identique pour toutes les extensions sans code),
 * suivi de deux lignes (PACKAGE.md §4) :
 *
 *   /* filarr-nocode engine=1.0.0 *\/
 *   globalThis.__filarrNocodeBoot({ …la configuration en JSON… });
 *
 * Le moteur ne fait donc qu'une chose au chargement : poser la fonction que la
 * dernière ligne appelle. C'est elle qui pose `filarrSandboxedPlugin`.
 */

import { createPlugin } from './plugin';

const g = globalThis as {
  __filarrNocodeBoot?: (config: unknown) => void;
  filarrSandboxedPlugin?: unknown;
};

g.__filarrNocodeBoot = (config: unknown) => {
  g.filarrSandboxedPlugin = createPlugin(config);
};
