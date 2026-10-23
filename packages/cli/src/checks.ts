/**
 * checks — les contrôles du BUNDLE, partagés par `check` (un projet) et
 * `verify` (un paquet).
 *
 * Ce que Filarr et son serveur refuseraient est une erreur ; ce qui passerait
 * mais casserait chez l'utilisateur (une API que la page bac à sable ferme)
 * est un avertissement, avec le pourquoi.
 */

import vm from 'node:vm';
import { editorIdsFor, MAX_BUNDLE_BYTES, type ExtensionManifest } from '@filarr/extension-api';
import { formatBytes, type Report } from './report';

/** Les API que la page ferme, et ce qu'en dira l'utilisateur. */
export const API_WARNINGS: { code: string; re: RegExp; why: string }[] = [
  { code: 'uses_fetch', re: /\bfetch\s*\(/, why: '`fetch` est refusé par la CSP de la page (default-src \'none\') — passez par la capacité `network` (host.network.request)' },
  { code: 'uses_xhr', re: /\bXMLHttpRequest\b/, why: '`XMLHttpRequest` est refusé par la CSP de la page — aucun réseau hors de la capacité `network`' },
  { code: 'uses_websocket', re: /\bWebSocket\b/, why: '`WebSocket` est refusé par la CSP de la page' },
  { code: 'uses_eventsource', re: /\bEventSource\b/, why: '`EventSource` est refusé par la CSP de la page' },
  { code: 'uses_sendbeacon', re: /\bsendBeacon\b/, why: '`sendBeacon` est refusé par la CSP de la page (il rend false)' },
  { code: 'uses_localstorage', re: /\blocalStorage\b/, why: '`localStorage` jette dans une origine opaque — utilisez la capacité `storage` (host.storage)' },
  { code: 'uses_indexeddb', re: /\bindexedDB\b/, why: '`indexedDB` est indisponible dans une origine opaque — utilisez la capacité `storage`' },
  { code: 'uses_eval', re: /\beval\s*\(/, why: '`eval` exécute une chaîne : un texte du document ne doit jamais devenir du code' },
  { code: 'uses_new_function', re: /\bnew\s+Function\s*\(/, why: '`new Function` exécute une chaîne : un texte du document ne doit jamais devenir du code' },
  { code: 'uses_innerhtml', re: /\binnerHTML\b/, why: '`innerHTML` : vérifiez qu’aucun contenu de document n’y passe (un coffre partagé peut contenir un fichier fabriqué) — préférez createElement et textContent' },
];

/** Les occurrences d'API que la page ferme, une ligne par API. */
export function scanApis(code: string, report: Report): void {
  for (const w of API_WARNINGS) {
    const n = code.match(new RegExp(w.re.source, 'g'))?.length ?? 0;
    if (n > 0) report.warn(w.code, `${w.why} (${n} occurrence${n > 1 ? 's' : ''})`, 'bundle.js');
  }
  if (/\bimport\s*\(/.test(code)) report.warn('uses_dynamic_import', '`import()` ne charge rien dans la page (CSP) : tout doit être dans le bundle', 'bundle.js');
  if (/sourceMappingURL=data:/.test(code)) report.warn('inline_sourcemap', 'carte de sources embarquée : elle alourdit le bundle sans servir à l’utilisateur', 'bundle.js');
}

/** Taille, syntaxe de corps de fonction, présence du global. Rend `false` si le bundle est inutilisable. */
export function checkBundleShape(code: string, bytes: number, report: Report): boolean {
  let ok = true;
  if (bytes < 1) {
    report.error('bundle_empty', 'bundle vide', 'bundle.js');
    return false;
  }
  if (bytes > MAX_BUNDLE_BYTES) {
    report.error('bundle_too_large', `bundle de ${formatBytes(bytes)} : le serveur refuse au-delà de 4 Mio (bundle_too_large)`, 'bundle.js');
    ok = false;
  } else if (bytes > 1024 * 1024) {
    report.warn('bundle_large', `bundle de ${formatBytes(bytes)} : visez 1 Mio au plus pour garder de la marge`, 'bundle.js');
  } else {
    report.ok('bundle_size', `taille du bundle : ${formatBytes(bytes)} (≤ 4 Mio)`);
  }
  try {
    // COMPILÉ, jamais exécuté : c'est exactement ce que fait la page avant de l'appeler.
    new Function('globalThis', code);
    report.ok('bundle_syntax', 'se compile comme corps de fonction : IIFE, sans import ni export au niveau haut');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint = /import|export/i.test(msg) ? ' — construisez en IIFE (format: "iife"), pas en ESM' : '';
    report.error('bundle_syntax', `ne se compile pas comme corps de fonction : ${msg}${hint}`, 'bundle.js');
    ok = false;
  }
  if (!code.includes('filarrSandboxedPlugin')) {
    report.error('bundle_no_global', 'le bundle ne pose pas globalThis.filarrSandboxedPlugin (sandbox_no_plugin au montage)', 'bundle.js');
    ok = false;
  }
  return ok;
}

interface Probe {
  editors: string[];
  functions: string[];
  block: boolean;
  widget: boolean;
}

/**
 * Exécute le bundle À BLANC, dans un contexte `vm` sans DOM ni réseau, pour
 * lire ce qu'il pose sur `globalThis`. Réservé au projet de l'auteur (`check`) :
 * `vm` n'est pas une frontière de sécurité, et `verify` ne l'utilise jamais
 * sur un paquet venu d'ailleurs.
 */
export function probeBundle(code: string): { ok: true; probe: Probe } | { ok: false; reason: string } {
  const noop = () => undefined;
  const context = vm.createContext({
    console: { log: noop, info: noop, warn: noop, error: noop, debug: noop },
    TextEncoder,
    TextDecoder,
    URL,
    atob,
    btoa,
    queueMicrotask: noop,
    setTimeout: () => 0,
    clearTimeout: noop,
    setInterval: () => 0,
    clearInterval: noop,
  });
  try {
    vm.runInContext(`(function (globalThis) {\n${code}\n})(globalThis);`, context, { timeout: 2000 });
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  const plugin = (context as { filarrSandboxedPlugin?: Record<string, unknown> }).filarrSandboxedPlugin;
  if (!plugin || typeof plugin !== 'object') return { ok: false, reason: 'globalThis.filarrSandboxedPlugin absent après exécution' };
  const editors = Array.isArray(plugin.editors)
    ? (plugin.editors as { id?: unknown; mount?: unknown }[]).filter((e) => typeof e?.mount === 'function').map((e) => String(e.id))
    : [];
  const fns = plugin.functions && typeof plugin.functions === 'object' ? plugin.functions as Record<string, unknown> : {};
  return {
    ok: true,
    probe: {
      editors,
      functions: Object.keys(fns).filter((k) => typeof fns[k] === 'function'),
      block: typeof (plugin.block as { mount?: unknown } | undefined)?.mount === 'function',
      widget: typeof (plugin.widget as { mount?: unknown } | undefined)?.mount === 'function',
    },
  };
}

/** Ce que le manifeste promet, le bundle le pose-t-il ? */
export function checkEntryPoints(code: string, manifest: ExtensionManifest, report: Report, opts: { execute: boolean }): void {
  const editorId = `${manifest.id}-editor`;
  const caps = manifest.capabilities ?? {};
  if (!opts.execute) {
    if (code.includes(editorId) || code.includes('dev-local-1-editor')) report.ok('editor_id', `l’identifiant d’éditeur « ${editorId} » figure dans le bundle`);
    else report.warn('editor_id_unseen', `« ${editorId} » n’apparaît pas tel quel dans le bundle : vérifiez l’identifiant de l’éditeur (sandbox_editor_not_found sinon)`, 'bundle.js');
    return;
  }
  const r = probeBundle(code);
  if (!r.ok) {
    report.warn('probe_failed', `exécution à blanc impossible (${r.reason.slice(0, 160)}) : le global est contrôlé par lecture seulement — le bundle touche-t-il le DOM au chargement ?`, 'bundle.js');
    checkEntryPoints(code, manifest, report, { execute: false });
    return;
  }
  const p = r.probe;
  if (p.editors.includes(editorId)) {
    report.ok('editor_id', `éditeur « ${editorId} » posé`);
  } else {
    report.error('editor_id', `aucun éditeur « ${editorId} » (trouvés : ${p.editors.slice(0, 5).join(', ') || 'aucun'}) — l’hôte demande <id>-editor : sandbox_editor_not_found`, 'bundle.js');
  }
  const extras = p.editors.filter((id) => !editorIdsFor(manifest.id).includes(id));
  if (extras.length) report.warn('editor_extra', `éditeurs que l’hôte ne demandera jamais : ${extras.join(', ')}`, 'bundle.js');
  const fn = caps.functions;
  const wanted: [string, boolean | undefined][] = [
    ['extractText', fn?.extractText],
    ['thumbnail', fn?.thumbnail],
    ['fields', fn?.fields !== undefined],
    ['export', fn?.exports !== undefined],
  ];
  for (const [name, declared] of wanted) {
    if (declared && !p.functions.includes(name)) report.error('function_missing', `la capacité functions déclare « ${name} » mais plugin.functions.${name} n’existe pas`, 'bundle.js');
    if (!declared && p.functions.includes(name)) report.warn('function_undeclared', `plugin.functions.${name} existe mais le manifeste ne la déclare pas : Filarr ne l’appellera pas`, 'bundle.js');
  }
  if (caps.noteBlock && !p.block) report.error('block_missing', 'la capacité noteBlock est déclarée mais plugin.block.mount n’existe pas', 'bundle.js');
  if (caps.homeWidget && !p.widget) report.error('widget_missing', 'la capacité homeWidget est déclarée mais plugin.widget.mount n’existe pas', 'bundle.js');
  if (p.block && !caps.noteBlock) report.warn('block_undeclared', 'plugin.block existe mais la capacité noteBlock n’est pas déclarée', 'bundle.js');
  if (p.widget && !caps.homeWidget) report.warn('widget_undeclared', 'plugin.widget existe mais la capacité homeWidget n’est pas déclarée', 'bundle.js');
}
