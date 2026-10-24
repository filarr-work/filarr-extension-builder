/**
 * host — le contrat INVITÉ, tel que la page bac à sable de Filarr le construit
 * (`public/plugin-sandbox.html`, protocole v2) et le passe à `mount()`.
 *
 * Rien n'est inventé ici : chaque champ existe dans la page, et aucun autre
 * n'existe. Pas de jeton, pas d'identifiant de coffre, pas d'URL — par
 * construction du message `init`. Quand la page et ces types divergent, c'est
 * la page qui a raison : `npm run sync` et le test de dérive sont là pour que
 * la divergence se voie.
 *
 * Les API derrière une CAPACITÉ (`storage`, `pick`, `network`, `collab`) sont
 * optionnelles dans les types parce qu'elles le sont à l'exécution : la page
 * ne les pose que si la capacité est déclarée dans le manifeste signé ET
 * acceptée par l'utilisateur. Testez leur présence avant de vous en servir.
 */

import type { ExportTarget } from './vendor/extensionCapabilities';

export type { ExportTarget };

/** Ce que la page accepte partout où elle attend des octets : elle en fait une copie. */
export type BytesLike = Uint8Array | ArrayBuffer | ArrayLike<number> | string;

/** Le point d'entrée monté. Une page de fonctions ne reçoit pas de `host`. */
export type SandboxMode = 'editor' | 'function' | 'block' | 'widget';

/**
 * Les variables CSS que l'hôte passe — la liste est le contrat
 * (`sandboxTheme.ts`, `SANDBOX_THEME_TOKENS`), pas un échantillon. Elles sont
 * déjà posées sur `host.container` : `var(--color-text-primary)` y vaut ce
 * qu'il vaut dans Filarr.
 */
export const THEME_TOKENS = [
  '--color-background',
  '--color-background-secondary',
  '--color-background-elevated',
  '--color-surface',
  '--color-surface-hover',
  '--color-border',
  '--color-border-light',
  '--color-border-strong',
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-tertiary',
  '--color-text-inverted',
  '--color-text-on-primary',
  '--color-link',
  '--color-focus-ring',
  '--color-primary-fill',
  '--color-primary-fill-hover',
  '--color-selected',
  '--color-success-on-background',
  '--color-warning-on-background',
  '--color-error-on-background',
  '--color-info-on-background',
  '--font-family-base',
  '--font-family-mono',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
] as const;

export type ThemeTokenName = (typeof THEME_TOKENS)[number];

export interface HostTheme {
  /** Lu sur ce qui est peint (la luminance du fond), pas sur le nom du thème. */
  readonly scheme: 'light' | 'dark';
  /** Au plus 64 jetons, déjà filtrés par l'hôte ET par la page. */
  readonly tokens: Readonly<Partial<Record<ThemeTokenName, string>> & Record<string, string>>;
}

/**
 * Les codes stables d'un rejet de `saveBytes` (`e.message`). Une autre valeur
 * est une clé d'erreur de l'hôte (hors ligne, quota…) : affichez-la telle quelle.
 */
export type SaveErrorCode = 'item_version_conflict' | 'read_only' | 'save_in_flight';

/** Les codes de refus d'une requête `host.*` (stockage, sélecteur, réseau). */
export type RequestErrorCode =
  | 'capability_denied'
  | 'rate_limited'
  | 'too_many_requests'
  | 'sandbox_disposed'
  | 'quota_exceeded'
  | 'storage_too_many_keys'
  | 'storage_locked'
  | 'storage_corrupted'
  | 'storage_unavailable'
  | 'unknown_handle'
  | 'read_only'
  | 'busy'
  | 'unavailable'
  | 'net_invalid'
  | 'net_domain'
  | 'net_header'
  | 'net_refused'
  | 'net_redirect'
  | 'net_unreachable'
  | 'net_too_large';

/** `storage: { quota }` — chiffré, LOCAL à l'appareil, effacé à la désinstallation. */
export interface ExtensionStorageApi {
  /** Clé `^[a-z0-9._-]{1,64}$`. `null` quand rien n'est rangé sous cette clé. */
  get(key: string): Promise<Uint8Array | null>;
  /** 256 clés au plus ; le quota compte la taille EN CLAIR de toutes les valeurs. */
  set(key: string, bytes: BytesLike): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** Un fichier choisi par l'utilisateur dans le sélecteur DE FILARR. */
export interface PickedFile {
  /** Opaque, aléatoire, valable pour la session — jamais un identifiant d'élément. */
  handle: string;
  name: string;
}

export type NetMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface NetworkRequest {
  /** `GET` par défaut. Pas de corps sur un `GET` (`net_invalid`). */
  method?: NetMethod;
  /** HTTPS, hôte EXACTEMENT dans `network.domains`, 2048 caractères au plus. */
  url: string;
  /** 16 au plus ; noms passés en minuscules par la page. Jamais l'en-tête d'un secret. */
  headers?: Record<string, string>;
  /** 1 Mio au plus. */
  body?: BytesLike | null;
}

export interface NetworkResponse {
  /** Le statut tel quel : un 404 est une réponse, pas un rejet. */
  status: number;
  contentType: string;
  /** 1 Mio au plus (`net_too_large`). */
  body: Uint8Array;
}

export interface ExtensionNetworkApi {
  /**
   * Chaque envoi est MONTRÉ à l'utilisateur par Filarr avant de partir.
   * Bureau seulement : sur le web, la promesse rejette avec `unavailable`.
   */
  request(req: NetworkRequest): Promise<NetworkResponse>;
}

/** `collab: true`, en salle de coffre partagé — des octets, jamais un document partagé. */
export interface CollabApi {
  /** Vrai : la salle est vide, et c'est à CETTE page d'y verser `initialBytes`. */
  readonly seed: boolean;
  /** Ce que la salle contenait au montage, à appliquer avant tout. */
  readonly initialUpdates: Uint8Array[];
  /** L'élu qui enregistre pour la salle : n'appelez `saveBytes` que s'il est vrai. */
  isResponsible(): boolean;
  onResponsibleChange(cb: (responsible: boolean) => void): () => void;
  /** Les updates des autres pairs. Gardées tant que personne n'écoute. */
  onRemoteUpdate(cb: (bytes: Uint8Array) => void): () => void;
  /** Une update Yjs, 1 Mio au plus. Jette `read_only` en lecture seule. */
  sendUpdate(bytes: BytesLike): void;
  /** À appeler UNE fois, juste après avoir semé une salle vide. */
  seeded(): void;
}

/** Ce que la page passe à `mount()` (éditeur, bloc de note, widget d'accueil). */
export interface ExtensionHost<M extends Exclude<SandboxMode, 'function'> = Exclude<SandboxMode, 'function'>> {
  readonly mode: M;
  /** `#plugin-root`, `position:fixed; inset:0`, fond transparent. Appartient à l'hôte. */
  readonly container: HTMLElement;
  /** Le nom d'affichage du fichier — pas un chemin, contenu potentiellement hostile. */
  readonly fileName: string;
  /** Une OBLIGATION vérifiée : `saveBytes` rejette avec `read_only`. */
  readonly readOnly: boolean;
  /** Instantané des octets au montage ; 0 octet = document neuf, cas normal. */
  readonly initialBytes: Uint8Array;
  /** La langue de Filarr (`fr`, `en`…), 35 caractères au plus. */
  readonly locale: string;
  readonly theme: HostTheme;
  /** Prévient quand le thème change ; rend le désabonnement. */
  onThemeChange(cb: (theme: HostTheme) => void): () => void;
  /** Le SEUL chemin d'écriture. Rejette avec un code (`SaveErrorCode` ou clé de l'hôte). */
  saveBytes(bytes: BytesLike): Promise<void>;
  /** `true` à CHAQUE mutation ; `false` seulement après un `saveBytes` réussi. */
  onDirty(dirty: boolean): void;
  /** Présent seulement avec la capacité `collab`, en éditeur, dans une salle. */
  readonly collab?: CollabApi;
  /** Présent seulement avec la capacité `storage`. */
  readonly storage?: ExtensionStorageApi;
  /** Présent seulement avec la capacité `picker`. */
  pick?(opts?: { multiple?: boolean }): Promise<PickedFile[]>;
  readPicked?(handle: string): Promise<Uint8Array>;
  /** Présent seulement avec `picker: { access: 'readwrite' }`. */
  writePicked?(handle: string, bytes: BytesLike): Promise<void>;
  /** Présent seulement avec la capacité `network`. */
  readonly network?: ExtensionNetworkApi;
}

export type EditorHost = ExtensionHost<'editor'>;
/** Un bloc dans une note : les octets sont la charge du nœud (256 Kio au plus). */
export type BlockHost = ExtensionHost<'block'>;
/** Un widget d'accueil : `initialBytes` = sa `config` en UTF-8, en lecture seule. */
export type WidgetHost = ExtensionHost<'widget'>;

/** Ce que `mount()` rend (directement ou par une promesse). */
export interface ExtensionInstance {
  /** Synchrone. Libérez minuteurs et écouteurs ; ne lancez AUCUNE sauvegarde. */
  destroy(): void;
  /** L'état COURANT, ≤ 10 s, total : une exception devient un `fatal`. */
  getBytes(): BytesLike | Promise<BytesLike>;
}

export type MountResult = ExtensionInstance | Promise<ExtensionInstance>;

export interface EditorEntry {
  /** Pour une extension de la place de marché : `<id du manifeste>-editor`, exactement. */
  id: string;
  mount(host: EditorHost): MountResult;
}

export interface BlockEntry {
  mount(host: BlockHost): MountResult;
}

export interface WidgetEntry {
  mount(host: WidgetHost): MountResult;
}

/** Ce que reçoit une fonction pure — ni stockage, ni sélecteur, ni réseau, ni DOM visible. */
export interface FunctionContext {
  readonly fileName: string;
  /** La cible, pour `export` seulement. */
  readonly to?: ExportTarget;
  readonly locale: string;
}

export type FieldValue = string | number | boolean | null;

/**
 * Les fonctions pures (capacité `functions`). Filarr choisit le fichier ;
 * dix secondes par appel ; la valeur est relue par l'hôte (`readCallValue`).
 */
export interface ExtensionFunctions {
  /** Pour la recherche locale ; écrêté à 100 000 caractères. */
  extractText?(bytes: Uint8Array, ctx: FunctionContext): string | Promise<string>;
  /** PNG ou WebP reconnu par ses octets, 96 Kio au plus (JPEG refusé). */
  thumbnail?(bytes: Uint8Array, ctx: FunctionContext): Uint8Array | ArrayBuffer | Promise<Uint8Array | ArrayBuffer>;
  /** Seules les clés DÉCLARÉES passent, chacune au type déclaré ; texte ≤ 500 caractères. */
  fields?(bytes: Uint8Array, ctx: FunctionContext): Record<string, FieldValue> | Promise<Record<string, FieldValue>>;
  /** Des OCTETS (64 Mio au plus) : une chaîne rendue telle quelle serait refusée par l'hôte. */
  export?(
    bytes: Uint8Array,
    ctx: FunctionContext & { readonly to: ExportTarget }
  ): Uint8Array | ArrayBuffer | Promise<Uint8Array | ArrayBuffer>;
}

/** L'objet que le bundle pose sur `globalThis.filarrSandboxedPlugin`. */
export interface SandboxedPlugin {
  editors?: EditorEntry[];
  functions?: ExtensionFunctions;
  block?: BlockEntry;
  widget?: WidgetEntry;
}
