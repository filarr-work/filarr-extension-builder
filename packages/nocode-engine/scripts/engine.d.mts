/** Les déclarations de `engine.mjs` (construire le moteur sans code). */
export declare const packageDir: string;
export declare function engineVersion(): string;
export declare function buildEngineSource(): Promise<string>;
export declare function buildEngineSourceSync(): string;
