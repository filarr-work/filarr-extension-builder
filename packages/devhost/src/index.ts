/**
 * @filarr/extension-devhost — le SIMULATEUR local des extensions Filarr.
 *
 * Un petit serveur Node qui sert la page bac à sable de Filarr (copie
 * vendorisée, identique) et un hôte navigateur qui rejoue le protocole v2 du
 * côté de Filarr (pont vendorisé), avec des services simulés : stockage en
 * mémoire, sélecteur sur les fichiers d'exemple, réseau montré puis émis vers
 * les seuls domaines déclarés, co-édition entre deux pages. Lancé par
 * `filarr-ext dev`.
 */
export { startDevHost, SANDBOX_HEADERS, sandboxHeaders, sandboxScriptHashes, type DevBuild, type DevHost, type DevHostOptions } from './server';
export { judgeRequest, relayRequest, isPublicAddress, type NetGrant, type NetInput, type NetOutcome } from './netRelay';
