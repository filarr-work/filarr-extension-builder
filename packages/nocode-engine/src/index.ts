/**
 * @filarr/nocode-engine — le moteur SANS CODE des extensions Filarr.
 *
 * Deux usages, deux mondes :
 *  · dans la page bac à sable : le moteur (`dist/engine.js`, IIFE) lit une
 *    configuration déclarative et devient un éditeur complet ;
 *  · dans l'outil (Node ou navigateur) : valider une configuration, fabriquer
 *    le bundle au format de PACKAGE.md §4, le relire sans l'évaluer, vérifier
 *    qu'il s'accorde avec son manifeste.
 */

export * from './types';
export { validateConfig, rootFields, resolveField, implicitListKey, functionFieldTypes, manifestFieldType, MAX_CONFIG_BYTES, CONFIG_FORMAT, type ConfigVerdict } from './schema';
export { buildNocodeBundle, parseNocodeConfigFromBundle, serializeNocodeConfig, NocodeConfigError, EMBEDDED_ENGINE_SOURCE, BOOT_CALL, type BuildNocodeOptions, type ParsedNocodeBundle } from './bundle';
export { checkNocodeAgainstManifest } from './consistency';
export { openDocument, type DocumentResult, type NocodeDocument } from './formats/index';
export { createPlugin } from './plugin';
export { extractText, fieldValues, exportDocument } from './functions';
export { scanJson, checkValueTree, MAX_DOCUMENT_BYTES, MAX_DEPTH, FORBIDDEN_KEYS } from './safe';
export { ENGINE_VERSION } from './version';
