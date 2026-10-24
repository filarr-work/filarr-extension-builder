/** Les modules fabriqués par `vite/filarrPlugin.ts`. */

declare module 'virtual:filarr/engine' {
  /** Le moteur sans code, tel que `filarr-ext` l'embarque. */
  export const ENGINE_SOURCE: string;
}

declare module 'virtual:filarr/modules' {
  /** Les dépendances qu'un projet avec code peut importer dans le Builder, en ESM. */
  const modules: Record<string, string>;
  export default modules;
}

declare module 'virtual:filarr/examples' {
  const examples: {
    kind: 'code' | 'nocode';
    slug: string;
    files: { path: string; text?: string; base64?: string }[];
  }[];
  export default examples;
}

declare module '@filarr-create/templates.mjs' {
  export const TEMPLATES: string[];
  export const LANGS: string[];
  export function slugify(name: string): string;
  export function projectFiles(o: {
    id: string;
    name: string;
    description: string;
    ext: string;
    template: string;
    lang: string;
    toolVersion: string;
  }): Record<string, string | Uint8Array>;
}

declare module 'esbuild-wasm/esbuild.wasm?url' {
  const url: string;
  export default url;
}
