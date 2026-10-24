/**
 * syntax — « se compile comme corps de fonction », sans `new Function`.
 *
 * `filarr-ext check` compile le bundle par `new Function('globalThis', code)`,
 * exactement ce que fait la page bac à sable avant de l'appeler. L'atelier ne
 * peut pas : sa CSP refuse `unsafe-eval`, et c'est voulu (le code de l'auteur
 * ne doit jamais devenir du code dans la page de l'atelier). On le LIT donc
 * avec un analyseur, dans les mêmes conditions qu'un corps de fonction : un
 * script où `return` est permis et `import`/`export` interdits. Le vrai essai
 * reste celui du simulateur, qui exécute le bundle dans la page de Filarr.
 */

import { parse } from 'acorn';

export function compileAsFunctionBody(code: string): void {
  parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    allowReturnOutsideFunction: true,
    allowNewDotTarget: true,
    allowHashBang: false,
  });
}

/** Le même contrôle, sous forme de verdict. */
export function syntaxError(code: string): string | null {
  try {
    compileAsFunctionBody(code);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
