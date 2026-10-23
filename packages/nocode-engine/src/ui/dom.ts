/**
 * dom — la SEULE façon dont le moteur fabrique de l'interface.
 *
 * Tout passe par `document.createElement` et `textContent`. Jamais
 * `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, ni aucune
 * forme d'évaluation : le document affiché peut avoir été fabriqué par
 * quelqu'un d'autre, et une valeur `<img src=x onerror=…>` doit s'afficher
 * comme ces caractères-là, rien de plus. Le test `security.test.ts` relit le
 * bundle du moteur pour s'en assurer.
 *
 * Les attributs passent par une LISTE BLANCHE : aucun `on…`, aucun `style`
 * libre, et `href` seulement par `safeHref` (http, https, mailto).
 */

const ATTRS = new Set([
  'type',
  'placeholder',
  'role',
  'title',
  'min',
  'max',
  'step',
  'rows',
  'tabindex',
  'inputmode',
  'autocomplete',
  'spellcheck',
  'lang',
  'dir',
  'scope',
  'target',
  'rel',
  'aria-label',
  'aria-checked',
  'aria-pressed',
  'aria-hidden',
  'aria-live',
  'aria-valuenow',
  'aria-valuemin',
  'aria-valuemax',
  'aria-describedby',
  'data-nc-key',
  'data-scheme',
  'data-type',
]);

export type Child = Node | string | null | undefined | false;

export interface Props {
  class?: string;
  /** Posé par `textContent` : du texte, jamais du balisage. */
  text?: string;
  attrs?: Record<string, string | undefined>;
  on?: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) {
      if (v === undefined) continue;
      if (!ATTRS.has(k)) throw new Error(`nocode_attr_refused:${k}`);
      node.setAttribute(k, v);
    }
  }
  if (props.on) {
    for (const [k, fn] of Object.entries(props.on)) {
      if (fn) node.addEventListener(k, fn as EventListener);
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

const EMAIL_RE = /^[^\s@<>"'()\\,;:]+@[^\s@<>"'()\\,;:]+\.[^\s@<>"'()\\,;:]+$/;

/**
 * Une adresse qu'on peut mettre dans un `href` : http(s) seulement pour une
 * URL (jamais `javascript:`, `data:`, `file:`…), `mailto:` pour une adresse
 * électronique bien formée. `null` sinon — on affiche alors le texte seul.
 */
export function safeHref(value: string, kind: 'url' | 'email'): string | null {
  const v = value.trim();
  if (v === '' || v.length > 2048) return null;
  if (kind === 'email') return EMAIL_RE.test(v) ? `mailto:${v}` : null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Un lien sortant : la page bac à sable ne navigue pas, mais le lien reste lisible et copiable. */
export function link(href: string, text: string): HTMLAnchorElement {
  const a = el('a', { class: 'nc-link', text, attrs: { target: '_blank', rel: 'noopener noreferrer' } });
  a.href = href;
  return a;
}

/** Pose une valeur CSS calculée par le moteur (nombre, couleur validée) — jamais une chaîne du document. */
export function setCssVar(node: HTMLElement, name: `--nc-${string}`, value: string): void {
  node.style.setProperty(name, value);
}
