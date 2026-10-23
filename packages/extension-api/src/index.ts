/**
 * @filarr/extension-api — le contrat des extensions Filarr, en types et en
 * contrôles, sans aucune dépendance.
 *
 *  · `host.ts`     : ce que la page bac à sable passe à `mount()` (protocole v2) ;
 *  · `define.ts`   : `defineExtension`, qui pose `globalThis.filarrSandboxedPlugin` ;
 *  · `manifest.ts` : le manifeste et les bornes du serveur (`validateManifest`) ;
 *  · `package.ts`  : le paquet `.filarrext` (PACKAGE.md, format 1) ;
 *  · `vendor/`     : le validateur de capacités de Filarr, recopié à l'identique.
 */

export * from './host';
export * from './define';
export * from './manifest';
export * from './package';
export {
  CAPABILITY_KEYS,
  MAX_EXPORTS,
  MAX_FIELDS,
  MAX_IMPORTS,
  MAX_LABEL_CODE_POINTS,
  MAX_NETWORK_DOMAINS,
  MAX_NETWORK_SECRETS,
  MAX_NEW_DOCUMENTS,
  MAX_OPEN_BYTES,
  MAX_PICKER_EXTENSIONS,
  MAX_SEED_BYTES,
  MAX_STORAGE_QUOTA,
  MIN_STORAGE_QUOTA,
  canonicalCapabilitiesJson,
  declaredCapabilityKeys,
  isNetworkDomain,
  isSecretHeader,
  readExtensionCapabilities,
} from './vendor/extensionCapabilities';
export type {
  CapabilitiesVerdict,
  CapabilityKey,
  CapabilityRefusal,
  ExportDeclaration,
  ExtensionCapabilities,
  FieldDeclaration,
  FieldType,
  NetworkSecret,
  NewDocumentCapability,
} from './vendor/extensionCapabilities';
