/**
 * manifest — le manifeste NON SIGNÉ d'une extension, et les bornes que le
 * serveur lui appliquera.
 *
 * `validateManifest` rejoue, dans le même ordre, ce que fait `validateManifest`
 * du worker (`infra/cloudflare-worker/src/marketplace.ts`, PUBLISHING.md §2) et
 * le validateur de capacités PARTAGÉ (copie vendorisée, à l'identique). Le but
 * n'est pas de remplacer le serveur — il revérifiera tout après la signature —
 * mais qu'un refus se voie AVANT de dépenser une des dix publications du jour.
 *
 * Deux différences voulues avec le serveur, toutes deux plus strictes :
 *  · les champs que Filarr CALCULE (`bundleHash`, `publisherFingerprint`,
 *    `trust`, `previews`) sont refusés : un paquet qui les porte est refusé
 *    par Filarr (PACKAGE.md §3) ;
 *  · un champ inconnu est refusé : le serveur l'ignorerait, mais il voyagerait
 *    signé sans que personne ne l'ait relu.
 *
 * Les longueurs se comptent comme le serveur les compte : `name` et
 * `description` en unités UTF-16 (`.length`), l'icône et l'auteur en points de
 * code. Un écart ici serait un manifeste accepté puis refusé.
 */

import {
  readExtensionCapabilities,
  type CapabilityRefusal,
  type ExtensionCapabilities,
} from './vendor/extensionCapabilities';

// ── Les bornes du serveur (marketplace.ts) ──────────────────────────────────

export const SLUG_RE = /^[a-z][a-z0-9-]{1,63}$/;
export const SEMVER_RE = /^\d+\.\d+\.\d+$/;
export const EXTENSION_RE = /^[a-z0-9]{1,10}$/;
export const MAX_NAME_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_EXTENSIONS = 10;
export const MAX_ICON_CODE_POINTS = 8;
/** `LAYOUT_LIMITS.slotLabel` — la borne de `readPublisherName`. */
export const MAX_AUTHOR_CODE_POINTS = 80;
/** `MAX_PLUGIN_BUNDLE_BYTES`. */
export const MAX_BUNDLE_BYTES = 4 * 1024 * 1024;
/**
 * `MAX_MANIFEST_BYTES` du worker : 640 Kio d'octets UTF-8 depuis que le
 * manifeste porte les captures (`previews`). PUBLISHING.md dit encore 64 Kio ;
 * c'est le code du serveur qui tranche.
 */
export const MAX_SIGNED_MANIFEST_BYTES = 640 * 1024;

export const MARKETPLACE_CATEGORIES = [
  'editors',
  'productivity',
  'data',
  'media',
  'fun',
  'other',
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];

/** Les champs qu'un auteur décide — et rien d'autre (PACKAGE.md §3). */
export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  /** Obligatoire, peut être vide. Texte brut. */
  description: string;
  extensions: string[];
  /** Un emoji : 1 à 8 points de code, au moins un pictogramme. */
  icon?: string;
  category?: MarketplaceCategory;
  /** Le pseudonyme revendiqué — signé, il ne prouve rien. */
  author?: string;
  capabilities?: ExtensionCapabilities;
}

export const MANIFEST_FIELDS = [
  'id',
  'name',
  'version',
  'description',
  'extensions',
  'icon',
  'category',
  'author',
  'capabilities',
] as const;

/** Calculés par Filarr à la signature ; un paquet qui les porte est refusé. */
export const COMPUTED_MANIFEST_FIELDS = [
  'bundleHash',
  'publisherFingerprint',
  'trust',
  'previews',
] as const;

export interface Issue {
  level: 'error' | 'warning';
  /** Un code stable, pour les outils. */
  code: string;
  /** Le champ en cause (`manifest.version`, `listing.sourceUrl`…). */
  field: string;
  /** Une phrase lisible, en français. */
  message: string;
}

export interface ManifestVerdict {
  ok: boolean;
  issues: Issue[];
  /** Présent quand `ok` : le manifeste tel quel (rien n'est réécrit). */
  manifest?: ExtensionManifest;
}

const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

/** `isValidPluginIcon` du worker : liste blanche PAR POINT DE CODE. */
export function isValidPluginIcon(icon: string): boolean {
  const points = [...icon];
  if (points.length < 1 || points.length > MAX_ICON_CODE_POINTS) return false;
  let pictogramme = false;
  for (const ch of points) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0xfe0f || cp === 0x200d) continue;
    if (cp >= 0x1f3fb && cp <= 0x1f3ff) continue;
    if (!EXTENDED_PICTOGRAPHIC.test(ch)) return false;
    pictogramme = true;
  }
  return pictogramme;
}

/** `isInvisibleOrDirectional` de `layoutMarketTypesCore.ts`, énuméré comme là-bas. */
function isInvisibleOrDirectional(cp: number): boolean {
  if (cp <= 0x1f || cp === 0x7f) return true;
  if (cp >= 0x80 && cp <= 0x9f) return true;
  if (cp === 0x200e || cp === 0x200f) return true;
  if (cp >= 0x202a && cp <= 0x202e) return true;
  if (cp >= 0x2066 && cp <= 0x2069) return true;
  return false;
}

/** `readPublisherName` : non vide une fois rogné, ≤ 80 points de code, rien d'invisible. */
export function readPublisherName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '' || [...trimmed].length > MAX_AUTHOR_CODE_POINTS) return null;
  for (const ch of trimmed) {
    if (isInvisibleOrDirectional(ch.codePointAt(0) ?? 0)) return null;
  }
  return trimmed;
}

/** Ce que veut dire chaque refus du validateur de capacités, pour un humain. */
export const CAPABILITY_REFUSAL_MESSAGES: Record<CapabilityRefusal, string> = {
  not_object: '`capabilities` doit être un objet',
  unknown_capability:
    'capacité inconnue — liste fermée : newDocument, maxBytes, imports, storage, collab, functions, picker, noteBlock, homeWidget, network',
  bad_new_document:
    '`newDocument` : 1 à 4 offres { ext, label, seed? }, ext parmi `extensions`, sans doublon, seed base64 ≤ 64 Kio décodés',
  bad_max_bytes: '`maxBytes` : un entier de 1 à 64 Mio',
  bad_imports: '`imports` : 1 à 10 extensions uniques, de forme ^[a-z0-9]{1,10}$, hors de `extensions`',
  bad_storage: '`storage` : { quota } entier de 1 Kio à 16 Mio',
  bad_collab: '`collab` ne peut valoir que true',
  bad_functions:
    '`functions` : { extractText?: true, thumbnail?: true, fields?: 1–32 { key, label, type }, exports?: 1–4 { to, label } }',
  bad_picker: '`picker` : { access: "read" | "readwrite", extensions?: 1–10 uniques }',
  bad_note_block: '`noteBlock` : { label } (1 à 60 points de code, rien d’invisible)',
  bad_home_widget: '`homeWidget` : { label } (1 à 60 points de code, rien d’invisible)',
  bad_network:
    '`network` : { domains: 1–8 hôtes exacts en minuscules, secrets?: 1–4 { id, label, header } }',
  network_exclusive: '`network` est exclusif de `picker`, `storage`, `functions` et `noteBlock`',
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Le manifeste non signé tel qu'un paquet le porte. Ne jette jamais.
 *
 * Les erreurs empêchent la publication (le serveur ou Filarr refuseraient) ;
 * les avertissements signalent ce qui passerait mais se regrette.
 */
export function validateManifest(raw: unknown): ManifestVerdict {
  const issues: Issue[] = [];
  const err = (field: string, code: string, message: string) =>
    issues.push({ level: 'error', code, field: `manifest.${field}`, message });
  const warn = (field: string, code: string, message: string) =>
    issues.push({ level: 'warning', code, field: `manifest.${field}`, message });

  if (!isRecord(raw)) {
    err('', 'not_object', 'le manifeste doit être un objet JSON');
    return { ok: false, issues };
  }
  const m = raw;

  for (const cle of Object.keys(m)) {
    if ((COMPUTED_MANIFEST_FIELDS as readonly string[]).includes(cle)) {
      err(cle, 'computed_field', `« ${cle} » est calculé par Filarr à la signature : retirez-le`);
    } else if (!(MANIFEST_FIELDS as readonly string[]).includes(cle)) {
      err(cle, 'unknown_field', `champ inconnu « ${cle} »`);
    }
  }

  if (typeof m.id !== 'string' || !SLUG_RE.test(m.id)) {
    err('id', 'bad_id', 'identifiant attendu : ^[a-z][a-z0-9-]{1,63}$ (une lettre, puis 1 à 63 minuscules, chiffres ou tirets) — définitif une fois publié');
  }
  if (typeof m.version !== 'string' || !SEMVER_RE.test(m.version)) {
    err('version', 'bad_version', 'version attendue : trois nombres, « 1.2.0 » (ni « v », ni suffixe)');
  }
  if (typeof m.name !== 'string' || m.name.length < 1 || m.name.length > MAX_NAME_LENGTH) {
    err('name', 'bad_name', `nom attendu : 1 à ${MAX_NAME_LENGTH} caractères`);
  }
  if (typeof m.description !== 'string') {
    err('description', 'bad_description', 'description obligatoire (une chaîne, vide permise)');
  } else if (m.description.length > MAX_DESCRIPTION_LENGTH) {
    err('description', 'bad_description', `description trop longue (${m.description.length} > ${MAX_DESCRIPTION_LENGTH})`);
  } else if (m.description.trim() === '') {
    warn('description', 'empty_description', 'description vide : la fiche n’en dira rien');
  }

  let extensionsOk = false;
  if (!Array.isArray(m.extensions) || m.extensions.length === 0 || m.extensions.length > MAX_EXTENSIONS) {
    err('extensions', 'bad_extensions', `1 à ${MAX_EXTENSIONS} extensions de fichier`);
  } else if (!m.extensions.every((e) => typeof e === 'string' && EXTENSION_RE.test(e))) {
    err('extensions', 'bad_extensions', 'chaque extension : ^[a-z0-9]{1,10}$, sans point, en minuscules');
  } else {
    extensionsOk = true;
    if (new Set(m.extensions).size !== m.extensions.length) {
      warn('extensions', 'duplicate_extension', 'une extension est listée deux fois');
    }
  }

  if (m.icon !== undefined && (typeof m.icon !== 'string' || !isValidPluginIcon(m.icon))) {
    err('icon', 'bad_icon', 'icône : un emoji, 1 à 8 points de code dont au moins un pictogramme');
  }
  if (
    m.category !== undefined &&
    (typeof m.category !== 'string' || !(MARKETPLACE_CATEGORIES as readonly string[]).includes(m.category))
  ) {
    err('category', 'bad_category', `catégorie parmi : ${MARKETPLACE_CATEGORIES.join(', ')}`);
  }
  if (m.author !== undefined && readPublisherName(m.author) === null) {
    err('author', 'bad_author', 'auteur : 1 à 80 points de code, sans caractère invisible ni directionnel');
  }

  if (m.capabilities !== undefined) {
    const verdict = readExtensionCapabilities(
      m.capabilities,
      extensionsOk ? (m.extensions as string[]) : []
    );
    if (!verdict.ok) {
      err('capabilities', verdict.reason, CAPABILITY_REFUSAL_MESSAGES[verdict.reason]);
    }
  }

  const ok = !issues.some((i) => i.level === 'error');
  return ok ? { ok, issues, manifest: m as unknown as ExtensionManifest } : { ok, issues };
}

const ENC = /* @__PURE__ */ new TextEncoder();

/**
 * La taille du manifeste que Filarr SIGNERA : le vôtre, plus ce qu'il calcule
 * (empreinte du bundle, empreinte de la clé, `trust`, captures en data URL).
 * C'est elle que borne `MAX_SIGNED_MANIFEST_BYTES`.
 */
export function estimateSignedManifestBytes(
  manifest: ExtensionManifest,
  previews: { mime: string; bytes: number }[] = []
): number {
  const complet = {
    ...manifest,
    bundleHash: '0'.repeat(64),
    publisherFingerprint: '00000 00000 00000 00000 00000 00000',
    trust: 'sandboxed',
    ...(previews.length
      ? {
          previews: previews.map(
            (p) => `data:${p.mime};base64,${'A'.repeat(Math.ceil(p.bytes / 3) * 4)}`
          ),
        }
      : {}),
  };
  return ENC.encode(JSON.stringify(complet)).byteLength;
}
