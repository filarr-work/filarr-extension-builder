/**
 * Les versions que le Builder déclare. `build.tool` d'un paquet est
 * DÉCLARATIF (PACKAGE.md §3) : Filarr l'affiche comme « déclaré par l'outil ».
 * On y écrit donc ce qui a vraiment fabriqué le paquet — le Builder — et pas
 * `filarr-ext`, même si les contrôles et l'assemblage sont les siens.
 */
import pkg from '../../package.json';

export const BUILDER_VERSION: string = pkg.version;
export const BUILDER_TOOL = `Filarr Builder ${BUILDER_VERSION}`;
/** La version d'`@filarr/extension-cli` qu'un projet exporté installe. */
export const CLI_RANGE = '^1.0.0';
/** esbuild-wasm, aligné sur l'esbuild de `filarr-ext` : même sortie pour les mêmes sources. */
export const ESBUILD_VERSION = '0.24.2';
