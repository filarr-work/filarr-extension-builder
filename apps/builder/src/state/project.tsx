/**
 * project — le projet ouvert : ses fichiers (la seule source de vérité),
 * enregistrés dans ce navigateur à chaque modification, et ce qu'on en tire —
 * le descripteur, la construction (relancée quand une source change), le
 * verdict du simulateur et les contrôles.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { NocodeConfig } from '@filarr/nocode-engine';
import { buildProject, type BuildResult } from '../lib/build';
import { runChecks, type CheckOutcome, type SandboxProbe } from '../lib/checks';
import { jsonFile, readJson, readMeta, tryParseProject, updateProjectJson, writeMeta, BUILDER_FILE, PROJECT_FILE, type BuilderMeta, type FileMap, type ProjectDescriptor } from '../lib/project';
import { loadProject, saveProject } from '../lib/store';

interface ProjectCtx {
  key: string;
  files: FileMap;
  setFiles(next: FileMap | ((f: FileMap) => FileMap)): void;
  project: ProjectDescriptor | null;
  projectError: string | null;
  mode: 'code' | 'nocode';
  meta: BuilderMeta;
  setMeta(fn: (m: BuilderMeta) => BuilderMeta): void;
  /** Réécrit `filarr.extension.json` (son JSON brut). */
  updateProject(mutate: (raw: Record<string, unknown>) => void): void;
  /** La configuration sans code telle qu'écrite (peut être invalide pendant qu'on la compose). */
  config: NocodeConfig | null;
  setConfig(fn: (c: NocodeConfig) => NocodeConfig): void;
  build: BuildResult | null;
  building: boolean;
  rebuild(): void;
  probe: SandboxProbe | null;
  setProbe(p: SandboxProbe | null): void;
  check: CheckOutcome;
  savedAt: number | null;
  saveError: string | null;
}

const Ctx = createContext<ProjectCtx | null>(null);

/** Ce dont dépend le bundle : on ne reconstruit pas pour une retouche de la fiche. */
function buildSignature(files: FileMap, project: ProjectDescriptor | null): string {
  if (!project) return '';
  const parts: string[] = [JSON.stringify(project.build)];
  const skip = (p: string) => p === PROJECT_FILE || p === BUILDER_FILE || p === 'README.md' || p === 'package.json' || p.startsWith(`${project.samples}/`) || p.startsWith('captures/');
  const paths = project.build.kind === 'nocode' ? [project.build.config] : Object.keys(files).filter((p) => !skip(p)).sort();
  for (const p of paths) {
    const b = files[p];
    if (!b) continue;
    let h = 0x811c9dc5;
    for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193);
    parts.push(`${p}:${b.length}:${(h >>> 0).toString(16)}`);
  }
  return parts.join('|');
}

export function ProjectProvider({ storeKey, children, fallback }: { storeKey: string; children: ReactNode; fallback: (state: 'loading' | 'missing') => ReactNode }) {
  const [files, setFilesState] = useState<FileMap | null>(null);
  const [missing, setMissing] = useState(false);
  const created = useRef(Date.now());
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setFilesState(null);
    setMissing(false);
    loadProject(storeKey)
      .then((p) => {
        if (!alive) return;
        if (!p) setMissing(true);
        else {
          created.current = p.createdAt;
          setFilesState(p.files);
          setSavedAt(p.updatedAt);
        }
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [storeKey]);

  // ── L'enregistrement dans ce navigateur ─────────────────────────────────
  const dirty = useRef(false);
  useEffect(() => {
    if (!files || !dirty.current) return;
    const t = setTimeout(() => {
      const now = Date.now();
      saveProject({ key: storeKey, createdAt: created.current, updatedAt: now, files })
        .then(() => {
          setSavedAt(now);
          setSaveError(null);
        })
        .catch((e) => setSaveError(e instanceof Error ? e.message : String(e)));
    }, 350);
    return () => clearTimeout(t);
  }, [files, storeKey]);

  const setFiles = useCallback((next: FileMap | ((f: FileMap) => FileMap)) => {
    dirty.current = true;
    setFilesState((cur) => (cur === null ? cur : typeof next === 'function' ? next(cur) : next));
  }, []);

  const parsed = useMemo(() => (files ? tryParseProject(files) : null), [files]);
  const project = parsed?.ok ? parsed.project : null;
  const meta = useMemo(() => (files ? readMeta(files) : { builder: 1 as const }), [files]);

  const config = useMemo<NocodeConfig | null>(() => {
    if (!files || !project || project.build.kind !== 'nocode') return null;
    try {
      return readJson(files, project.build.config, 256 * 1024) as NocodeConfig;
    } catch {
      return null;
    }
  }, [files, project]);

  // ── La construction, relancée quand une source change ───────────────────
  const [build, setBuild] = useState<BuildResult | null>(null);
  const [building, setBuilding] = useState(false);
  const [probe, setProbe] = useState<SandboxProbe | null>(null);
  const seq = useRef(0);
  const [force, setForce] = useState(0);
  const signature = useMemo(() => (files ? buildSignature(files, project) : ''), [files, project]);
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => {
    const f = filesRef.current;
    if (!f || !project) return;
    const mine = ++seq.current;
    const delay = force > 0 ? 0 : project.build.kind === 'nocode' ? 200 : 700;
    const t = setTimeout(() => {
      setBuilding(true);
      buildProject(f, project)
        .then((r) => {
          if (mine !== seq.current) return;
          setBuild(r);
          setProbe(null);
        })
        .finally(() => mine === seq.current && setBuilding(false));
    }, delay);
    return () => clearTimeout(t);
    // La signature, pas `files` : une retouche de la fiche ne reconstruit pas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, force]);

  const check = useMemo(() => (files ? runChecks(files, build, { probe }) : { report: runChecks({}, null).report, screenshots: [] }), [files, build, probe]);

  const value = useMemo<ProjectCtx | null>(() => {
    if (!files) return null;
    return {
      key: storeKey,
      files,
      setFiles,
      project,
      projectError: parsed && !parsed.ok ? parsed.error.message : null,
      mode: project?.build.kind ?? 'code',
      meta,
      setMeta: (fn) => setFiles((f) => writeMeta(f, fn(readMeta(f)))),
      updateProject: (mutate) => setFiles((f) => updateProjectJson(f, mutate)),
      config,
      setConfig: (fn) =>
        setFiles((f) => {
          const p = tryParseProject(f);
          if (!p.ok || p.project.build.kind !== 'nocode') return f;
          let cur: NocodeConfig;
          try {
            cur = readJson(f, p.project.build.config, 256 * 1024) as NocodeConfig;
          } catch {
            return f;
          }
          return { ...f, [p.project.build.config]: jsonFile(fn(cur)) };
        }),
      build,
      building,
      rebuild: () => setForce((n) => n + 1),
      probe,
      setProbe,
      check,
      savedAt,
      saveError,
    };
  }, [files, storeKey, setFiles, project, parsed, meta, config, build, building, probe, check, savedAt, saveError]);

  if (missing) return <>{fallback('missing')}</>;
  if (!value) return <>{fallback('loading')}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProject(): ProjectCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('ProjectProvider manquant');
  return v;
}
