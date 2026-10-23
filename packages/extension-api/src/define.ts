/**
 * defineExtension — pose `globalThis.filarrSandboxedPlugin`, sans piège.
 *
 * La page bac à sable exécute le bundle par `new Function('globalThis', code)`
 * puis lit `globalThis.filarrSandboxedPlugin`. Trois erreurs reviennent chez
 * chaque auteur, et cette fonction les ferme :
 *
 *  · l'identifiant d'éditeur. Pour une extension de la place de marché, l'hôte
 *    demande `<id du manifeste>-editor` (`toRegistryManifest`) : un `id` qui
 *    diverge donne `sandbox_editor_not_found`, sans autre explication. On le
 *    DÉRIVE ici de l'identifiant du manifeste au lieu de le laisser recopier ;
 *  · le test local. « Tester localement » monte un manifeste synthétique
 *    `dev-local-<n>` : on ajoute les alias `dev-local-1-editor` … `-8-editor`,
 *    branchés sur le même `mount` (QUICKSTART.md, §4) ;
 *  · l'export rendu en chaîne. L'hôte n'accepte que des OCTETS (`readCallValue`) :
 *    une chaîne rendue par `export` est encodée en UTF-8 au lieu d'être refusée.
 */

import type {
  BlockEntry,
  EditorHost,
  EditorEntry,
  ExtensionFunctions,
  MountResult,
  SandboxedPlugin,
  WidgetEntry,
} from './host';

/** La forme d'un identifiant de manifeste (`marketplace.ts`, `SLUG_RE`). */
const SLUG_RE = /^[a-z][a-z0-9-]{1,63}$/;
const DEV_LOCAL_ALIASES = 8;

export interface ExtensionDefinition {
  /** L'identifiant du manifeste (`filarr.extension.json` › `manifest.id`). */
  id: string;
  /** L'éditeur de fichiers : monté sous `<id>-editor`. */
  editor?: { mount(host: EditorHost): MountResult };
  /** Capacité `functions`. */
  functions?: ExtensionFunctions;
  /** Capacité `noteBlock`. */
  block?: BlockEntry;
  /** Capacité `homeWidget`. */
  widget?: WidgetEntry;
  /** `false` : pas d'alias `dev-local-<n>-editor` (vrai par défaut, ils ne coûtent rien). */
  devLocalAliases?: boolean;
}

/** Les identifiants sous lesquels l'éditeur de `id` est enregistré. */
export function editorIdsFor(id: string, devLocalAliases = true): string[] {
  const ids = [`${id}-editor`];
  if (devLocalAliases) {
    for (let i = 1; i <= DEV_LOCAL_ALIASES; i++) ids.push(`dev-local-${i}-editor`);
  }
  return ids;
}

const encoder = /* @__PURE__ */ new TextEncoder();

function withBytesExport(functions: ExtensionFunctions): ExtensionFunctions {
  const exporter = functions.export;
  if (typeof exporter !== 'function') return functions;
  return {
    ...functions,
    export: async (bytes, ctx) => {
      const out: unknown = await exporter.call(functions, bytes, ctx);
      return typeof out === 'string' ? encoder.encode(out) : (out as Uint8Array | ArrayBuffer);
    },
  };
}

/**
 * Construit l'objet attendu par la page et le pose sur `globalThis`. Rend ce
 * même objet (utile aux tests). Jette un message LISIBLE sur une définition
 * fautive : la page l'affiche tel quel dans le bandeau `mount-error`.
 */
export function defineExtension(def: ExtensionDefinition): SandboxedPlugin {
  if (!def || typeof def !== 'object') {
    throw new Error('defineExtension : il faut un objet { id, editor?, functions?, block?, widget? }');
  }
  if (typeof def.id !== 'string' || !SLUG_RE.test(def.id)) {
    throw new Error(
      `defineExtension : identifiant « ${String(def.id)} » invalide (attendu ^[a-z][a-z0-9-]{1,63}$, celui du manifeste)`
    );
  }
  if (!def.editor && !def.functions && !def.block && !def.widget) {
    throw new Error('defineExtension : rien à exposer (editor, functions, block ou widget)');
  }
  const plugin: SandboxedPlugin = {};
  if (def.editor) {
    if (typeof def.editor.mount !== 'function') {
      throw new Error('defineExtension : editor.mount doit être une fonction');
    }
    const mount = def.editor.mount.bind(def.editor);
    plugin.editors = editorIdsFor(def.id, def.devLocalAliases !== false).map(
      (id): EditorEntry => ({ id, mount })
    );
  }
  if (def.functions) plugin.functions = withBytesExport(def.functions);
  if (def.block) {
    if (typeof def.block.mount !== 'function') {
      throw new Error('defineExtension : block.mount doit être une fonction');
    }
    plugin.block = def.block;
  }
  if (def.widget) {
    if (typeof def.widget.mount !== 'function') {
      throw new Error('defineExtension : widget.mount doit être une fonction');
    }
    plugin.widget = def.widget;
  }
  (globalThis as { filarrSandboxedPlugin?: SandboxedPlugin }).filarrSandboxedPlugin = plugin;
  return plugin;
}
