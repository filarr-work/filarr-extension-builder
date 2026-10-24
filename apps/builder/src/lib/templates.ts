/**
 * templates — les modèles de départ : ceux de `create-filarr-extension`
 * (repris tels quels, pour qu'un projet du Builder soit un projet du terminal),
 * un modèle vierge, et les vingt exemples du dépôt.
 */

import { projectFiles } from '@filarr-create/templates.mjs';
import { fromBase64, text, utf8 } from './bytes';
import { BUILDER_FILE, jsonFile, PROJECT_FILE, type FileMap } from './project';
import { BUILDER_VERSION, CLI_RANGE } from './version';

export type Mode = 'nocode' | 'code';
export type Lang = 'fr' | 'en';
type L = { fr: string; en: string };

export interface TemplateInfo {
  id: string;
  mode: Mode;
  /** Un modèle de l'outil, ou un exemple du dépôt. */
  source: 'base' | 'example';
  name: L;
  desc: L;
  accent: string;
  bars: [string, string, string];
  /** Exemple : ce qu'il impose (on préremplit le formulaire avec). */
  example?: { slug: string; id: string; name: string; extensions: string[]; icon?: string };
}

export const BASE_TEMPLATES: TemplateInfo[] = [
  { id: 'nocode-vierge', mode: 'nocode', source: 'base', name: { fr: 'À partir de votre fichier', en: 'From your file' }, desc: { fr: 'Montrez un exemple : le Builder devine les champs et compose une première vue.', en: 'Show an example: the Builder guesses the fields and drafts a first view.' }, accent: '#87ceeb', bars: ['70%', '45%', '60%'] },
  { id: 'nocode-fiche', mode: 'nocode', source: 'base', name: { fr: 'Fiche', en: 'Record card' }, desc: { fr: 'Titre, étiquettes, note et texte : le modèle sans code de create-filarr-extension.', en: 'Title, tags, rating and text: the no-code template of create-filarr-extension.' }, accent: '#6ee7b7', bars: ['80%', '50%', '90%'] },
  { id: 'texte', mode: 'code', source: 'base', name: { fr: 'Texte', en: 'Text' }, desc: { fr: 'Un format texte : zone d’édition, enregistrement automatique.', en: 'A text format: editing area, autosave.' }, accent: '#87ceeb', bars: ['80%', '60%', '70%'] },
  { id: 'json', mode: 'code', source: 'base', name: { fr: 'Données JSON', en: 'JSON data' }, desc: { fr: 'Un JSON qu’on ne peut pas enregistrer invalide.', en: 'JSON that cannot be saved invalid.' }, accent: '#6ee7b7', bars: ['90%', '90%', '90%'] },
  { id: 'binaire', mode: 'code', source: 'base', name: { fr: 'Visionneuse', en: 'Viewer' }, desc: { fr: 'Lecture seule : afficher sans jamais écrire.', en: 'Read-only: display, never write.' }, accent: '#fcd34d', bars: ['70%', '70%', '35%'] },
  { id: 'vierge', mode: 'code', source: 'base', name: { fr: 'Vierge', en: 'Blank' }, desc: { fr: 'Juste mount(), getBytes() et destroy().', en: 'Just mount(), getBytes() and destroy().' }, accent: '#2a3245', bars: ['30%', '20%', '25%'] },
];

const EXAMPLE_ACCENTS = ['#c4b5fd', '#fda4af', '#fcd34d', '#6ee7b7', '#87ceeb', '#f9a8d4', '#a5b4fc', '#fdba74', '#86efac', '#93c5fd'];

type ExampleRecord = { kind: Mode; slug: string; files: { path: string; text?: string; base64?: string }[] };
let examplesP: Promise<ExampleRecord[]> | null = null;

/** Les exemples, chargés à la demande (≈ 1,5 Mio) : l'accueil n'attend pas. */
export function loadExamples(): Promise<ExampleRecord[]> {
  examplesP ??= import('virtual:filarr/examples').then((m) => m.default as ExampleRecord[]);
  return examplesP;
}

function exampleFiles(rec: ExampleRecord): FileMap {
  const files: FileMap = {};
  for (const f of rec.files) files[f.path] = f.text !== undefined ? utf8(f.text) : fromBase64(f.base64 ?? '');
  return files;
}

export async function exampleTemplates(): Promise<TemplateInfo[]> {
  const list = await loadExamples();
  return list.map((rec, i) => {
    const pj = JSON.parse(text(exampleFiles(rec)[PROJECT_FILE])) as { manifest: { id: string; name: string; description: string; extensions: string[]; icon?: string } };
    const m = pj.manifest;
    const short = m.description.length > 110 ? `${m.description.slice(0, 108)}…` : m.description;
    return {
      id: `exemple:${rec.kind}:${rec.slug}`,
      mode: rec.kind,
      source: 'example',
      name: { fr: m.name, en: m.name },
      desc: { fr: short, en: short },
      accent: EXAMPLE_ACCENTS[i % EXAMPLE_ACCENTS.length],
      bars: [`${40 + ((i * 17) % 50)}%`, `${35 + ((i * 29) % 55)}%`, `${30 + ((i * 41) % 60)}%`],
      example: { slug: rec.slug, id: m.id, name: m.name, extensions: m.extensions, icon: m.icon },
    } satisfies TemplateInfo;
  });
}

export interface NewProjectOptions {
  mode: Mode;
  name: string;
  id: string;
  extensions: string[];
  template: string;
  lang: 'ts' | 'js';
}

function vierge(id: string, ts: boolean): string {
  return `${ts ? `import { defineExtension, type EditorHost } from '@filarr/extension-api';` : `import { defineExtension } from '@filarr/extension-api';`}

/**
 * Le minimum : un éditeur qui montre le nom du fichier et sa taille, et rend
 * les octets reçus tels quels. defineExtension pose globalThis.filarrSandboxedPlugin
 * et monte l'éditeur sous « ${id}-editor ».
 */
defineExtension({
  id: '${id}',
  editor: {
    mount(host${ts ? ': EditorHost' : ''}) {
      host.container.textContent = ''; // jamais d'innerHTML
      const p = document.createElement('p');
      p.style.cssText = 'margin:16px;font:14px/1.5 var(--font-family-base,system-ui);color:var(--color-text-primary,CanvasText)';
      p.textContent = host.fileName + ' — ' + host.initialBytes.byteLength + ' octets';
      host.container.append(p);
      return {
        getBytes: () => host.initialBytes,
        destroy: () => p.remove(),
      };
    },
  },
});
`;
}

function toFileMap(raw: Record<string, string | Uint8Array>): FileMap {
  const out: FileMap = {};
  for (const [k, v] of Object.entries(raw)) out[k] = typeof v === 'string' ? utf8(v) : v;
  return out;
}

/** Un `package.json` autonome : le projet exporté se construit avec `filarr-ext`, sans le dépôt. */
function standalonePackage(id: string, version: string, mode: Mode, usesYjs: boolean, ts: boolean): Uint8Array {
  return jsonFile({
    name: id,
    version,
    private: true,
    type: 'module',
    scripts: { dev: 'filarr-ext dev', build: 'filarr-ext build', check: 'filarr-ext check', pack: 'filarr-ext pack', ...(ts ? { typecheck: 'tsc --noEmit' } : {}) },
    ...(usesYjs ? { dependencies: { yjs: '^13.6.20' } } : {}),
    devDependencies: { '@filarr/extension-cli': CLI_RANGE, ...(ts ? { typescript: '^5.6.0' } : {}) },
  });
}

function patchManifest(files: FileMap, o: NewProjectOptions): FileMap {
  const raw = JSON.parse(text(files[PROJECT_FILE])) as Record<string, Record<string, unknown>>;
  raw.manifest.id = o.id;
  raw.manifest.name = o.name;
  raw.manifest.extensions = [...o.extensions];
  return { ...files, [PROJECT_FILE]: jsonFile(raw) };
}

/** Les fichiers d'un projet neuf. */
export async function createProjectFiles(o: NewProjectOptions): Promise<FileMap> {
  const ext = o.extensions[0] ?? 'doc';
  let files: FileMap;
  if (o.template.startsWith('exemple:')) {
    const [, kind, slug] = o.template.split(':');
    const rec = (await loadExamples()).find((r) => r.kind === kind && r.slug === slug);
    if (!rec) throw new Error(`exemple introuvable : ${slug}`);
    files = exampleFiles(rec);
    const old = JSON.parse(text(files[PROJECT_FILE])) as { manifest: { id: string; version: string } };
    const oldId = old.manifest.id;
    if (kind === 'nocode' && files['nocode.json']) {
      const cfg = JSON.parse(text(files['nocode.json'])) as Record<string, unknown>;
      cfg.id = o.id;
      files['nocode.json'] = jsonFile(cfg);
    }
    let usesYjs = false;
    if (kind === 'code' && oldId !== o.id) {
      // Le code de l'exemple nomme son éditeur « <id>-editor » : on suit le nouvel identifiant.
      for (const [p, b] of Object.entries(files)) {
        if (!p.startsWith('src/')) continue;
        const t = text(b);
        if (t.includes(`${oldId}-editor`)) files[p] = utf8(t.split(`${oldId}-editor`).join(`${o.id}-editor`));
      }
    }
    for (const [p, b] of Object.entries(files)) if (p.startsWith('src/') && /from\s+['"]yjs['"]/.test(text(b))) usesYjs = true;
    files['package.json'] = standalonePackage(o.id, old.manifest.version, kind as Mode, usesYjs, kind === 'code' && !!files['tsconfig.json']);
    files = patchManifest(files, o);
  } else if (o.mode === 'nocode') {
    files = toFileMap(projectFiles({ id: o.id, name: o.name, description: 'Des fiches, sans une ligne de code.', ext, template: 'nocode', lang: 'js', toolVersion: '1.0.0' }));
    if (o.template === 'nocode-vierge') {
      delete files[`exemples/exemple.${ext}`];
      files['nocode.json'] = jsonFile({ nocode: 1, id: o.id, format: { type: 'json' }, fields: [], view: [], functions: { extractText: true } });
    }
    files = patchManifest(files, o);
  } else {
    const base = o.template === 'vierge' ? 'texte' : o.template;
    files = toFileMap(projectFiles({ id: o.id, name: o.name, description: `Un éditeur pour les fichiers .${ext}.`, ext, template: base, lang: o.lang, toolVersion: '1.0.0' }));
    if (o.template === 'vierge') files[`src/index.${o.lang}`] = utf8(vierge(o.id, o.lang === 'ts'));
    files = patchManifest(files, o);
  }
  files[BUILDER_FILE] = jsonFile({ builder: 1, template: o.template, createdWith: `Filarr Builder ${BUILDER_VERSION}` });
  return files;
}

/** L'arborescence d'un projet, pour l'aperçu « Le projet créé ». */
export function treeLines(root: string, paths: string[]): string[] {
  const visible = paths.filter((p) => !p.startsWith('.')).sort((a, b) => {
    const da = a.includes('/') ? 0 : 1;
    const db = b.includes('/') ? 0 : 1;
    return da - db || a.localeCompare(b);
  });
  const lines = [`${root}/`];
  const groups = new Map<string, string[]>();
  for (const p of visible) {
    const i = p.indexOf('/');
    const head = i < 0 ? p : `${p.slice(0, i)}/`;
    if (!groups.has(head)) groups.set(head, []);
    if (i >= 0) groups.get(head)!.push(p.slice(i + 1));
  }
  const heads = [...groups.keys()];
  heads.forEach((head, hi) => {
    const last = hi === heads.length - 1;
    const kids = groups.get(head)!;
    if (kids.length === 1 && !kids[0].includes('/')) {
      lines.push(`${last ? '└─' : '├─'} ${head}${kids[0]}`);
      return;
    }
    lines.push(`${last ? '└─' : '├─'} ${head}`);
    const shown = kids.slice(0, 6);
    shown.forEach((k, ki) => {
      const lastKid = ki === shown.length - 1 && kids.length <= 6;
      lines.push(`${last ? '  ' : '│ '} ${lastKid ? '└─' : '├─'} ${k}`);
    });
    if (kids.length > 6) lines.push(`${last ? '  ' : '│ '} └─ … (${kids.length - 6})`);
  });
  return lines;
}
