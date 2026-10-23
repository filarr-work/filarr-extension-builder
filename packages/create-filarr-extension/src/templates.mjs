/**
 * templates — les fichiers d'un projet neuf, par modèle.
 *
 * Quatre modèles, chacun complet et conforme au contrat dès la création (il
 * passe `filarr-ext check` tel quel) :
 *  · `texte`   : un éditeur de texte brut, enregistrement automatique à 2 s ;
 *  · `json`    : un éditeur de JSON qui refuse d'enregistrer un JSON invalide ;
 *  · `binaire` : une visionneuse d'octets, qui ne réécrit jamais le fichier ;
 *  · `nocode`  : une extension SANS CODE (une configuration `nocode.json`).
 *
 * Les textes d'interface sont en français, avec l'anglais selon `host.locale`.
 */

export const TEMPLATES = ['texte', 'json', 'binaire', 'nocode'];
export const LANGS = ['ts', 'js'];

const ICONS = { texte: '📝', json: '🧩', binaire: '🔢', nocode: '🗂️' };

/** Le cœur commun des éditeurs avec code : barre d'état, enregistrement, thème, langue. */
function editorCore(ts) {
  const t = (s) => (ts ? s : '');
  return `const AUTOSAVE_MS = 2000; // jamais moins : chaque enregistrement chiffre et versionne

const WORDS = {
  fr: { saved: 'Enregistré', saving: 'Enregistrement…', modified: 'Modifié', readOnly: 'Lecture seule', conflict: 'Conflit : le document a été enregistré ailleurs. Enregistrez pour écraser, ou rouvrez-le.', failed: 'Échec de l’enregistrement' },
  en: { saved: 'Saved', saving: 'Saving…', modified: 'Edited', readOnly: 'Read-only', conflict: 'Conflict: the document was saved elsewhere. Save to overwrite, or reopen it.', failed: 'Save failed' },
};

/** La barre d'état et l'enregistrement : onDirty à CHAQUE mutation, false seulement après un succès. */
function createSaver(host${t(': EditorHost')}, status${t(': HTMLElement')}, serialize${t(': () => Uint8Array | null')}) {
  const w = host.locale.startsWith('en') ? WORDS.en : WORDS.fr;
  let timer${t(': ReturnType<typeof setTimeout> | null')} = null;
  let seq = 0;
  let conflict = false;
  const save = async (manual = false) => {
    if (host.readOnly || (conflict && !manual)) return;
    if (timer) clearTimeout(timer);
    timer = null;
    const bytes = serialize();
    if (!bytes) return; // rien d'enregistrable (contenu invalide) : on reste « sale »
    const mine = seq;
    status.textContent = w.saving;
    try {
      await host.saveBytes(bytes);
      conflict = false;
      if (mine === seq) {
        host.onDirty(false);
        status.textContent = w.saved;
      }
    } catch (e) {
      // Le rejet porte un CODE stable, jamais une phrase : on le traduit ici.
      const code = e instanceof Error ? e.message : String(e);
      if (code === 'item_version_conflict') conflict = true;
      status.textContent = code === 'item_version_conflict' ? w.conflict : \`\${w.failed} (\${code})\`;
    }
  };
  return {
    words: w,
    changed() {
      if (host.readOnly) return;
      seq++;
      host.onDirty(true);
      status.textContent = w.modified;
      if (timer) clearTimeout(timer);
      if (!conflict) timer = setTimeout(() => void save(), AUTOSAVE_MS);
    },
    save,
    destroy() {
      if (timer) clearTimeout(timer);
    },
  };
}

/** Une mise en page qui suit le thème de Filarr (variables --color-* posées sur host.container). */
function layout(host${t(': EditorHost')}) {
  host.container.textContent = ''; // l'hôte possède ce nœud ; jamais d'innerHTML
  const root = document.createElement('div');
  root.style.cssText =
    'position:absolute;inset:0;display:flex;flex-direction:column;' +
    'background:var(--color-background,Canvas);color:var(--color-text-primary,CanvasText);' +
    'font:14px/1.5 var(--font-family-base,system-ui,sans-serif)';
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:12px;align-items:center;padding:6px 12px;border-bottom:1px solid var(--color-border,#8884)';
  const name = document.createElement('strong');
  name.textContent = host.fileName; // texte, jamais du HTML
  const status = document.createElement('span');
  status.style.cssText = 'margin-left:auto;opacity:.75;font-size:12px';
  bar.append(name, status);
  root.append(bar);
  host.container.append(root);
  return { root, status };
}
`;
}

function textEditor(id, ts) {
  const imp = ts ? `import { defineExtension, type EditorHost } from '@filarr/extension-api';` : `import { defineExtension } from '@filarr/extension-api';`;
  const t = (s) => (ts ? s : '');
  return `${imp}

${editorCore(ts)}
defineExtension({
  id: '${id}', // l'identifiant du manifeste : l'éditeur est monté sous « ${id}-editor »
  editor: {
    mount(host${t(': EditorHost')}) {
      const { root, status } = layout(host);
      const area = document.createElement('textarea');
      area.style.cssText = 'flex:1;border:0;outline:none;resize:none;padding:12px;background:transparent;color:inherit;font:14px/1.6 var(--font-family-mono,monospace)';
      area.value = new TextDecoder().decode(host.initialBytes); // 0 octet = document neuf, cas normal
      area.readOnly = host.readOnly; // une obligation, pas un conseil
      root.append(area);
      const saver = createSaver(host, status, () => new TextEncoder().encode(area.value));
      if (host.readOnly) status.textContent = saver.words.readOnly;
      area.addEventListener('input', () => saver.changed());
      const onKey = (e${t(': KeyboardEvent')}) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          void saver.save(true);
        }
      };
      root.addEventListener('keydown', onKey);
      return {
        destroy() {
          saver.destroy(); // aucune sauvegarde ici : le port se ferme juste après
          root.removeEventListener('keydown', onKey);
          root.remove();
        },
        getBytes: () => new TextEncoder().encode(area.value), // total, borné, synchrone
      };
    },
  },
});
`;
}

function jsonEditor(id, ts) {
  const imp = ts ? `import { defineExtension, type EditorHost } from '@filarr/extension-api';` : `import { defineExtension } from '@filarr/extension-api';`;
  const t = (s) => (ts ? s : '');
  return `${imp}

${editorCore(ts)}
/** Lit le document : 0 octet = un objet vide ; un JSON invalide est MONTRÉ, jamais écrasé. */
function parse(bytes${t(': Uint8Array')})${t(': { ok: true; text: string } | { ok: false; text: string; error: string }')} {
  const text = new TextDecoder().decode(bytes);
  if (text.trim() === '') return { ok: true, text: '{\\n}\\n' };
  try {
    return { ok: true, text: JSON.stringify(JSON.parse(text), null, 2) + '\\n' };
  } catch (e) {
    return { ok: false, text, error: e instanceof Error ? e.message : String(e) };
  }
}

defineExtension({
  id: '${id}',
  editor: {
    mount(host${t(': EditorHost')}) {
      const { root, status } = layout(host);
      const first = parse(host.initialBytes);
      const error = document.createElement('div');
      error.style.cssText = 'padding:6px 12px;color:var(--color-error-on-background,#b91c1c);font-size:12px';
      const area = document.createElement('textarea');
      area.style.cssText = 'flex:1;border:0;outline:none;resize:none;padding:12px;background:transparent;color:inherit;font:13px/1.6 var(--font-family-mono,monospace)';
      area.spellcheck = false;
      area.value = first.text;
      area.readOnly = host.readOnly;
      if (!first.ok) error.textContent = first.error;
      root.append(error, area);
      let edited = false;
      // On n'enregistre qu'un JSON valide : un brouillon cassé reste « sale », jamais écrit.
      const valid = ()${t(': Uint8Array | null')} => {
        try {
          JSON.parse(area.value);
          error.textContent = '';
          return new TextEncoder().encode(area.value);
        } catch (e) {
          error.textContent = e instanceof Error ? e.message : String(e);
          return null;
        }
      };
      const saver = createSaver(host, status, valid);
      if (host.readOnly) status.textContent = saver.words.readOnly;
      area.addEventListener('input', () => {
        edited = true;
        valid();
        saver.changed();
      });
      return {
        destroy() {
          saver.destroy();
          root.remove();
        },
        // Tant que rien n'a été touché, on rend les octets reçus, tels quels.
        getBytes: () => (edited ? new TextEncoder().encode(area.value) : host.initialBytes),
      };
    },
  },
});
`;
}

function binaryViewer(id, ts) {
  const imp = ts ? `import { defineExtension, type EditorHost } from '@filarr/extension-api';` : `import { defineExtension } from '@filarr/extension-api';`;
  const t = (s) => (ts ? s : '');
  return `${imp}

/**
 * Une visionneuse d'octets : elle ne réécrit JAMAIS le fichier (getBytes rend
 * les octets reçus), elle montre leur taille et un vidage hexadécimal.
 */
const ROW = 16;
const MAX_ROWS = 4096; // au-delà, on montre le début : l'affichage reste rapide

function hexLine(bytes${t(': Uint8Array')}, offset${t(': number')})${t(': string')} {
  const slice = bytes.subarray(offset, offset + ROW);
  const hex = Array.from(slice, (b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(ROW * 3 - 1, ' ');
  const ascii = Array.from(slice, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
  return offset.toString(16).padStart(8, '0') + '  ' + hex + '  ' + ascii;
}

defineExtension({
  id: '${id}',
  editor: {
    mount(host${t(': EditorHost')}) {
      host.container.textContent = '';
      const en = host.locale.startsWith('en');
      const root = document.createElement('div');
      root.style.cssText = 'position:absolute;inset:0;overflow:auto;padding:12px;background:var(--color-background,Canvas);color:var(--color-text-primary,CanvasText)';
      const title = document.createElement('div');
      title.style.cssText = 'font:600 14px var(--font-family-base,system-ui);margin-bottom:8px';
      const n = host.initialBytes.byteLength;
      title.textContent = host.fileName + ' — ' + n + (en ? ' bytes' : ' octets');
      const pre = document.createElement('pre');
      pre.style.cssText = 'margin:0;font:12px/1.5 var(--font-family-mono,monospace)';
      const lines${t(': string[]')} = [];
      for (let o = 0; o < n && lines.length < MAX_ROWS; o += ROW) lines.push(hexLine(host.initialBytes, o));
      if (n > MAX_ROWS * ROW) lines.push(en ? '… (truncated)' : '… (tronqué)');
      pre.textContent = lines.join('\\n'); // du texte : textContent, jamais innerHTML
      root.append(title, pre);
      host.container.append(root);
      return {
        destroy() {
          root.remove();
        },
        getBytes: () => host.initialBytes,
      };
    },
  },
});
`;
}

function nocodeConfig(id) {
  return {
    nocode: 1,
    id,
    format: { type: 'json' },
    accent: '#2f6fa8',
    fields: [
      { key: 'titre', type: 'text', label: { fr: 'Titre', en: 'Title' }, placeholder: { fr: 'Sans titre', en: 'Untitled' } },
      { key: 'etiquettes', type: 'tags', label: { fr: 'Étiquettes', en: 'Tags' } },
      { key: 'note', type: 'rating', label: { fr: 'Note', en: 'Rating' }, max: 5 },
      { key: 'texte', type: 'longtext', label: { fr: 'Texte', en: 'Text' } },
    ],
    view: [
      { type: 'title', field: 'titre' },
      { type: 'tags', field: 'etiquettes' },
      { type: 'rating', field: 'note' },
      { type: 'longtext', field: 'texte', rows: 10 },
    ],
    functions: { extractText: true },
  };
}

function sample(template, ext) {
  switch (template) {
    case 'texte':
      return 'Bonjour !\nCe fichier d’exemple s’ouvre dans le simulateur : npm run dev.\n';
    case 'json':
      return JSON.stringify({ titre: 'Exemple', valeurs: [1, 2, 3], actif: true }, null, 2) + '\n';
    case 'binaire':
      return new Uint8Array([0x46, 0x49, 0x4c, 0x41, 0x52, 0x52, 0x00, 0x01, 0xff, 0xfe, 0x10, 0x20, ...new TextEncoder().encode(`exemple .${ext}`)]);
    default:
      return JSON.stringify({ titre: 'Ma première fiche', etiquettes: ['exemple'], note: 4, texte: 'Une configuration, aucun code.' }, null, 2) + '\n';
  }
}

function readme(o) {
  const nocode = o.template === 'nocode';
  return `# ${o.name}

Une extension Filarr pour les fichiers \`.${o.ext}\`${nocode ? ', **sans code** : tout est dans `nocode.json`' : ''}.

## Commandes

\`\`\`bash
npm install
npm run dev     # le simulateur local : http://127.0.0.1:5199
npm run check   # les contrôles du serveur et de Filarr, avant de publier
npm run pack    # dist/${o.id}-0.1.0.filarrext
\`\`\`

Puis, avec Filarr pour bureau : \`npx filarr-ext publish dist/${o.id}-0.1.0.filarrext\` — ou déposez le
fichier dans **Place de marché › Publier**. La signature se fait dans Filarr, sur votre appareil :
l’outil ne demande ni mot de passe ni clé.

## Le projet

- \`filarr.extension.json\` — le manifeste (non signé), la fiche et la construction ;
${nocode ? '- `nocode.json` — la configuration du moteur sans code (voir la documentation du Builder, `docs/nocode.md`) ;' : `- \`src/index.${o.lang}\` — l’éditeur, posé par \`defineExtension\` sous l’identifiant \`${o.id}-editor\` ;`}
- \`exemples/\` — les fichiers que le simulateur ouvre.

## À savoir avant de publier

- L’identifiant (\`${o.id}\`) est **définitif** une fois publié, et chaque version est immuable :
  commencez en \`0.1.0\` et itérez avec le simulateur.
- L’icône est l’emoji \`manifest.icon\` ; ajoutez jusqu’à quatre captures (PNG ou WebP, 96 Kio
  chacune) dans \`screenshots\`.
`;
}

/** Le slug d'un nom : minuscules, sans accents, tirets. */
export function slugify(name) {
  const s = String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const withLetter = /^[a-z]/.test(s) ? s : `ext-${s}`;
  return withLetter.length >= 2 ? withLetter.slice(0, 64).replace(/-+$/, '') : 'mon-extension';
}

/** Tous les fichiers du projet, chemin → contenu. */
export function projectFiles(o) {
  const files = {};
  const code = o.template !== 'nocode';
  files['filarr.extension.json'] = JSON.stringify(
    {
      manifest: {
        id: o.id,
        name: o.name,
        version: '0.1.0',
        description: o.description,
        extensions: [o.ext],
        icon: ICONS[o.template],
        category: o.template === 'binaire' ? 'data' : 'productivity',
        ...(o.template === 'nocode' ? { capabilities: { functions: { extractText: true } } } : {}),
      },
      listing: { releaseNotes: 'Première version.', license: 'MIT' },
      screenshots: [],
      build: code ? { kind: 'code', entry: `src/index.${o.lang}` } : { kind: 'nocode', config: 'nocode.json' },
    },
    null,
    2
  ) + '\n';
  const pkg = {
    name: o.id,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'filarr-ext dev',
      build: 'filarr-ext build',
      check: 'filarr-ext check',
      pack: 'filarr-ext pack',
      ...(code && o.lang === 'ts' ? { typecheck: 'tsc --noEmit' } : {}),
    },
    devDependencies: {
      '@filarr/extension-cli': `^${o.toolVersion}`,
      ...(code ? { '@filarr/extension-api': `^${o.toolVersion}` } : {}),
      ...(code && o.lang === 'ts' ? { typescript: '^5.6.0' } : {}),
    },
  };
  files['package.json'] = JSON.stringify(pkg, null, 2) + '\n';
  if (o.template === 'texte') files[`src/index.${o.lang}`] = textEditor(o.id, o.lang === 'ts');
  if (o.template === 'json') files[`src/index.${o.lang}`] = jsonEditor(o.id, o.lang === 'ts');
  if (o.template === 'binaire') files[`src/index.${o.lang}`] = binaryViewer(o.id, o.lang === 'ts');
  if (o.template === 'nocode') files['nocode.json'] = JSON.stringify(nocodeConfig(o.id), null, 2) + '\n';
  if (code && o.lang === 'ts') {
    files['tsconfig.json'] = JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          strict: true,
          noEmit: true,
          isolatedModules: true,
          skipLibCheck: true,
        },
        include: ['src'],
      },
      null,
      2
    ) + '\n';
  }
  files[`exemples/exemple.${o.ext}`] = sample(o.template, o.ext);
  files['README.md'] = readme(o);
  files['.gitignore'] = 'node_modules/\ndist/\n*.filarrext\n';
  return files;
}
