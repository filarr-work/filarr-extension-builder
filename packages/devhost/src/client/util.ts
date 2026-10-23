/**
 * util — les petits outils de la page hôte du simulateur.
 *
 * La page hôte affiche ce que l'extension lui envoie (messages d'erreur, noms,
 * octets) : comme dans Filarr, c'est du TEXTE, posé par `textContent`.
 */

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; title?: string; type?: string; on?: Record<string, (e: Event) => void> } = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.title) el.title = props.title;
  if (props.type) el.setAttribute('type', props.type);
  for (const [k, fn] of Object.entries(props.on ?? {})) el.addEventListener(k, fn);
  for (const c of children) if (c !== null && c !== undefined) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Kio`;
  return `${(n / 1024 / 1024).toFixed(2)} Mio`;
}

/** Les octets lisibles : du texte UTF-8 si c'en est, sinon un aperçu hexadécimal. */
export function preview(bytes: Uint8Array, max = 4000): string {
  try {
    const t = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return t.length > max ? `${t.slice(0, max)}…` : t;
  } catch {
    const hex = Array.from(bytes.slice(0, 256), (b) => b.toString(16).padStart(2, '0')).join(' ');
    return `(binaire, ${formatBytes(bytes.byteLength)}) ${hex}${bytes.byteLength > 256 ? ' …' : ''}`;
  }
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Une poignée de sélecteur comme Filarr en donne : 24 caractères aléatoires, opaques. */
export function randomHandle(): string {
  const octets = crypto.getRandomValues(new Uint8Array(18));
  return toBase64(octets).replace(/\+/g, '-').replace(/\//g, '_');
}

export function download(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes]));
  const a = h('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Un résumé d'un message du protocole : le type, les champs, la taille des octets. */
export function summarize(data: unknown): string {
  if (!data || typeof data !== 'object') return String(data);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (k === 'kind') continue;
    if (k === 'code' && typeof v === 'string') parts.push(`code=${formatBytes(v.length)}`);
    else if (v instanceof ArrayBuffer) parts.push(`${k}=${formatBytes(v.byteLength)}`);
    else if (Array.isArray(v) && v.every((x) => x instanceof ArrayBuffer)) parts.push(`${k}=[${v.length} update(s)]`);
    else if (k === 'grants' || k === 'theme') parts.push(`${k}=${JSON.stringify(v).slice(0, 80)}`);
    else {
      const s = JSON.stringify(v);
      parts.push(`${k}=${s && s.length > 120 ? `${s.slice(0, 120)}…` : s}`);
    }
  }
  return `${String((data as { kind?: unknown }).kind ?? '?')} ${parts.join(' ')}`;
}
