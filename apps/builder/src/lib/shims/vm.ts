/**
 * node:vm, dans l'atelier : ABSENT, volontairement.
 *
 * `filarr-ext check` exécute à blanc le bundle de l'auteur dans un contexte
 * `vm` pour lire ce qu'il pose. L'atelier ne l'exécute JAMAIS hors de la page
 * bac à sable : il lit le bundle (`execute: false`) et confie l'essai réel au
 * simulateur. Si un appel arrivait ici, ce serait une erreur de câblage.
 */
function refuse(): never {
  throw new Error('node:vm est indisponible dans le Builder : le code ne s’exécute que dans la page bac à sable');
}

export default { createContext: refuse, runInContext: refuse };
