// Le strict nécessaire de jsdom pour les tests (sans dépendre de @types/jsdom).
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: Record<string, unknown>);
    readonly window: Window & typeof globalThis;
  }
}
