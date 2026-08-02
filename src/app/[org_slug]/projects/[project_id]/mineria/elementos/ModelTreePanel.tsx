'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, ChevronRight, ChevronDown, Crosshair, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ForgeViewerHandle } from '@/components/awp/ForgeViewer';
import { valorDeLlave } from '@/lib/llaves-modelo';
import { fetchWithRetry, parseJsonOrThrow } from './elementos-red';
import { NIVEL_LABEL, type CoverageState, type Nivel, type TreeCoverageApi, type TreeNode } from './elementos-tipos';

// Ramas con más hojas que esto no se calculan automático — leer sus propiedades (getLeafDbIds +
// loadBulkElementProps) es trabajo síncrono pesado del SDK de Forge que congela el frame del
// navegador varios segundos en ramas grandes (medido: ~8s con 8000 hojas). Quedan con "—" y el
// usuario puede usar el botón de aislar para revisarlas igual.
const COVERAGE_MAX_LEAVES = 1500;
// Pausa entre cada rama de la cola — sin esto, el navegador encola decenas de ramas pesadas de
// seguido al abrir el árbol y queda "pegado" varios segundos seguidos sin poder repintar nada.
const COVERAGE_QUEUE_DELAY_MS = 400;

// Navega el árbol NATIVO del modelo (assemblies/grupos tal como vienen del CAD) cargando hijos a demanda
// con getChildren — nunca carga todo el árbol de una sola vez. Cada rama solo se RESUELVE a dbIds reales
// (y se pide confirmación con el conteo) cuando el usuario hace click en el botón de "usar esta rama";
// este componente nunca escribe nada en la BD por sí mismo.
export default function ModelTreePanel({ viewerRef, viewerReady, onPreviewBranch, revealDbId, projectId, activeNivel, coverageApiRef, llaves }: {
  llaves: string[];
  viewerRef: { current: ForgeViewerHandle | null };
  viewerReady: boolean;
  onPreviewBranch: (dbId: number, name: string) => void;
  revealDbId: { dbId: number; ts: number } | null;
  projectId: string;
  activeNivel: Nivel;
  coverageApiRef?: { current: TreeCoverageApi | null };
}) {
  const [rootId, setRootId] = useState<number | null>(null);
  const [childrenCache, setChildrenCache] = useState<Map<number, TreeNode[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [highlightDbId, setHighlightDbId] = useState<number | null>(null);
  const [treeLoadError, setTreeLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  // Cobertura (% de elementos ya vinculados al nivel activo) por rama — se calcula UNA vez por
  // dbId la primera vez que su fila se monta, en cola (1 a la vez) para no saturar el visor/API
  // cuando se expanden muchas ramas de golpe. Se reinicia si cambia el nivel activo (CWA/CV/CWP/SWP),
  // porque el % es relativo a ESE nivel.
  const [coverage, setCoverage] = useState<Map<number, CoverageState>>(new Map());
  const coverageQueueRef = useRef<number[]>([]);
  const coverageBusyRef = useRef(false);
  const coverageSeenRef = useRef<Set<number>>(new Set());
  // `llaves` llega como un array nuevo en cada render del padre. Guardarlo en un ref deja la cola de
  // cobertura con identidad estable (no se recrea en cada render) pero leyendo siempre el valor vigente.
  const llavesRef = useRef(llaves);
  llavesRef.current = llaves;

  useEffect(() => {
    setCoverage(new Map());
    coverageQueueRef.current = [];
    coverageSeenRef.current = new Set();
  }, [activeNivel]);

  const pumpCoverageQueue = useCallback(() => {
    if (coverageBusyRef.current) return;
    const dbId = coverageQueueRef.current.shift();
    if (dbId == null) return;
    coverageBusyRef.current = true;
    setCoverage(prev => new Map(prev).set(dbId, 'loading'));
    (async () => {
      let result: CoverageState = 'error';
      try {
        const v = viewerRef.current;
        if (v) {
          const leafDbIds = v.getLeafDbIds([dbId]);
          if (!leafDbIds.length) result = { vinculados: 0, total: 0 };
          else if (leafDbIds.length > COVERAGE_MAX_LEAVES) result = 'too-big';
          else {
            const ll = llavesRef.current;
            const props = await v.loadBulkElementProps(leafDbIds, ll);
            const monikers = [...new Set(props.map(p => valorDeLlave(p.props as Record<string, string>, ll)).filter(Boolean) as string[])];
            let vinculados = 0;
            if (monikers.length) {
              const r = await fetchWithRetry('/api/mining-elementos/cobertura', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project_id: projectId, nivel: activeNivel, monikers }),
              });
              const d = await parseJsonOrThrow(r);
              vinculados = d.vinculados ?? 0;
            }
            result = { vinculados, total: leafDbIds.length };
          }
        }
      } catch {
        result = 'error';
      }
      setCoverage(prev => new Map(prev).set(dbId, result));
      coverageBusyRef.current = false;
      setTimeout(pumpCoverageQueue, COVERAGE_QUEUE_DELAY_MS);
    })();
  }, [viewerRef, projectId, activeNivel]);

  const requestCoverage = useCallback((dbId: number) => {
    if (coverageSeenRef.current.has(dbId)) return;
    coverageSeenRef.current.add(dbId);
    coverageQueueRef.current.push(dbId);
    pumpCoverageQueue();
  }, [pumpCoverageQueue]);

  // Recalcula UNA rama puntual (ej. justo después de asignarle un CWP desde el banner del visor) —
  // se "olvida" de que ya la había visto para que requestCoverage la vuelva a encolar.
  const refreshCoverage = useCallback((dbId: number) => {
    coverageSeenRef.current.delete(dbId);
    requestCoverage(dbId);
  }, [requestCoverage]);

  // Recalcula TODAS las ramas YA RENDERIZADAS al menos una vez (todo lo que hay en childrenCache,
  // colapsado o no) — el % NUNCA se calcula solo al abrir/expandir (eso es lo que congelaba el
  // navegador, ver COVERAGE_QUEUE_DELAY_MS arriba); solo corre cuando el usuario aprieta este botón.
  const refreshAllCoverage = useCallback(() => {
    const dbIds = new Set<number>();
    for (const kids of childrenCache.values()) for (const k of kids) dbIds.add(k.dbId);
    setCoverage(new Map());
    coverageQueueRef.current = [];
    coverageSeenRef.current = new Set();
    dbIds.forEach(requestCoverage);
  }, [childrenCache, requestCoverage]);

  useEffect(() => {
    if (coverageApiRef) coverageApiRef.current = { refresh: refreshCoverage, refreshAll: refreshAllCoverage };
  }, [coverageApiRef, refreshCoverage, refreshAllCoverage]);

  const ensureChildren = useCallback((dbId: number) => {
    setChildrenCache(prev => {
      if (prev.has(dbId) || !viewerRef.current) return prev;
      const kids = viewerRef.current.getChildren(dbId);
      const next = new Map(prev);
      next.set(dbId, kids);
      return next;
    });
  }, [viewerRef]);

  // getRootId() depende de que el instance tree ya esté armado — viewerReady puede activarse antes
  // de que el tree termine de poblarse, y en modelos pesados eso puede demorar minutos (el resto del
  // visor ya espera esto con waitForInstanceTree, hasta 5 min). Antes se pateaba con un poll de 10s
  // hecho a mano, que se quedaba en "Cargando árbol…" para siempre en modelos grandes.
  useEffect(() => {
    if (!viewerReady || !viewerRef.current) return;
    setTreeLoadError(false);
    let cancelled = false;
    const v = viewerRef.current;

    // Fallback por si el bundle del navegador quedó desactualizado (hot-reload no recargó el método
    // nuevo del visor) — sin esto, llamar a una función inexistente tira un TypeError silencioso
    // dentro del efecto y la UI se queda pegada en "Cargando árbol…" sin ningún aviso.
    if (typeof v.waitForInstanceTree !== 'function') {
      let attempts = 0;
      const tryLoad = () => {
        if (cancelled) return;
        const r = viewerRef.current?.getRootId() ?? null;
        if (r != null) { setRootId(r); ensureChildren(r); }
        else if (attempts++ < 150) setTimeout(tryLoad, 200);
        else setTreeLoadError(true);
      };
      tryLoad();
      return () => { cancelled = true; };
    }

    v.waitForInstanceTree()
      .then(() => {
        if (cancelled) return;
        const r = viewerRef.current?.getRootId() ?? null;
        if (r != null) { setRootId(r); ensureChildren(r); }
        else setTreeLoadError(true);
      })
      .catch(() => { if (!cancelled) setTreeLoadError(true); });
    return () => { cancelled = true; };
  }, [viewerReady, viewerRef, ensureChildren, retryToken]);

  // Click en el visor (rama "árbol del modelo" activa) → expande todos los ancestros del dbId
  // clickeado para revelarlo en el árbol, hace scroll hasta él y lo resalta.
  useEffect(() => {
    if (!revealDbId || !viewerRef.current) return;
    const info = viewerRef.current.getNodeInfo(revealDbId.dbId);
    if (!info) return;
    setExpanded(prev => {
      const next = new Set(prev);
      for (const a of info.ancestors) next.add(a.dbId);
      return next;
    });
    for (const a of info.ancestors) ensureChildren(a.dbId);
    setHighlightDbId(revealDbId.dbId);
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.getElementById(`tree-node-${revealDbId.dbId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    });
  }, [revealDbId, viewerRef, ensureChildren]);

  const toggle = (dbId: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(dbId)) next.delete(dbId);
      else { next.add(dbId); ensureChildren(dbId); }
      return next;
    });
  };

  if (!viewerReady) return <div className="p-4 text-center text-[11px] text-slate-400 italic">Abre el modelo 3D primero.</div>;
  if (treeLoadError) {
    return (
      <div className="p-4 text-center text-[11px] text-slate-400 flex flex-col items-center gap-2">
        <span>No se pudo armar el árbol del modelo (demoró demasiado en cargar).</span>
        <button
          onClick={() => { setTreeLoadError(false); setRetryToken(t => t + 1); }}
          className="text-blue-600 font-bold hover:text-blue-700"
        >
          Reintentar
        </button>
      </div>
    );
  }
  if (rootId == null) {
    return (
      <div className="p-4 text-center text-[11px] text-slate-400 italic flex items-center justify-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> Cargando árbol… (puede demorar harto en modelos pesados)
      </div>
    );
  }
  const rootKids = childrenCache.get(rootId) ?? [];
  return (
    <div className="flex-1 overflow-y-auto p-2">
      <div className="flex items-start gap-1.5 px-1 pb-2">
        <p className="text-[9.5px] text-slate-400 leading-snug flex-1">
          Navega el árbol nativo del modelo. Click en <Crosshair className="w-2.5 h-2.5 inline" /> de una rama para aislarla
          y ver cuántos elementos tiene — nunca se asigna nada hasta que confirmes en el banner del visor.
          Click en un elemento del visor para ubicarlo aquí. El % (cuántos elementos ya están vinculados
          al nivel {NIVEL_LABEL[activeNivel]} activo en Revisión) NO se calcula solo — click en el &quot;%&quot; de
          una rama para calcularla, o usa &quot;Actualizar %&quot; para calcular todas las que ya viste.
        </p>
        <button
          onClick={refreshAllCoverage}
          title="Recalcular el % de todas las ramas que ya se han mostrado en este árbol"
          className="shrink-0 flex items-center gap-1 px-1.5 py-1 rounded bg-slate-100 hover:bg-blue-100 text-slate-500 hover:text-blue-700 text-[9px] font-bold whitespace-nowrap"
        >
          <RefreshCw className="w-3 h-3" /> Actualizar %
        </button>
      </div>
      {rootKids.length ? rootKids.map(k => (
        <TreeNodeRow
          key={k.dbId} node={k} depth={0}
          expanded={expanded} childrenCache={childrenCache} highlightDbId={highlightDbId}
          onToggle={toggle} onPreviewBranch={onPreviewBranch}
          coverageMap={coverage} requestCoverage={requestCoverage}
        />
      )) : (
        <p className="text-[10.5px] text-slate-400 italic px-1">Esta rama no tiene hijos.</p>
      )}
    </div>
  );
}

// El % NUNCA se calcula solo: o lo pide el usuario click-eando este badge (una rama puntual) o con
// el botón "Actualizar %" de arriba (todas las renderizadas) — antes se disparaba en cuanto la fila
// se montaba, lo que en este modelo (57k elementos) congelaba el navegador varios segundos por rama.
function CoverageBadge({ state, onRequest }: { state: CoverageState | undefined; onRequest: () => void }) {
  if (!state) {
    return (
      <button onClick={onRequest} title="Calcular el % de esta rama" className="w-7 shrink-0 text-[9px] text-slate-300 hover:text-blue-500">
        %
      </button>
    );
  }
  if (state === 'loading') return <Loader2 className="w-3 h-3 text-slate-300 animate-spin shrink-0" />;
  if (state === 'too-big') return <span className="text-[8.5px] text-slate-300 shrink-0" title="Rama muy grande para calcular automático — usa el botón de aislar para revisarla">—</span>;
  if (state === 'error') return <span className="text-[9px] text-red-300 shrink-0" title="No se pudo calcular la cobertura">⚠</span>;
  if (!state.total) return <span className="w-7 shrink-0" />;
  const pct = Math.round((state.vinculados / state.total) * 100);
  const color = pct >= 90 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500';
  return (
    <span className={cn('text-[9px] font-mono font-bold shrink-0 w-9 text-right', color)} title={`${state.vinculados.toLocaleString('es-CL')} de ${state.total.toLocaleString('es-CL')} elementos vinculados`}>
      {pct}%
    </span>
  );
}

function TreeNodeRow({ node, depth, expanded, childrenCache, highlightDbId, onToggle, onPreviewBranch, coverageMap, requestCoverage }: {
  node: TreeNode; depth: number;
  expanded: Set<number>; childrenCache: Map<number, TreeNode[]>; highlightDbId: number | null;
  onToggle: (dbId: number) => void; onPreviewBranch: (dbId: number, name: string) => void;
  coverageMap: Map<number, CoverageState>; requestCoverage: (dbId: number) => void;
}) {
  const isOpen = expanded.has(node.dbId);
  const kids = childrenCache.get(node.dbId);
  const isHighlighted = highlightDbId === node.dbId;
  return (
    <div>
      <div
        id={`tree-node-${node.dbId}`}
        className={cn('flex items-center gap-1 py-1 hover:bg-blue-50 rounded', isHighlighted && 'bg-amber-100 ring-1 ring-amber-400')}
        style={{ paddingLeft: depth * 14 + 4 }}
      >
        {node.childCount > 0 ? (
          <button onClick={() => onToggle(node.dbId)} className="shrink-0 p-0.5">
            {isOpen ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
          </button>
        ) : <span className="w-4 shrink-0" />}
        <span className="text-[11px] text-slate-700 truncate flex-1" title={node.name}>{node.name || `#${node.dbId}`}</span>
        <CoverageBadge state={coverageMap.get(node.dbId)} onRequest={() => requestCoverage(node.dbId)} />
        {node.childCount > 0 && <span className="text-[9px] text-slate-400 font-mono shrink-0">{node.childCount}</span>}
        <button
          onClick={() => onPreviewBranch(node.dbId, node.name || `#${node.dbId}`)}
          title="Aislar esta rama y ver cuántos elementos tiene, antes de clasificarla"
          className="shrink-0 p-1 rounded bg-slate-100 hover:bg-blue-100 text-blue-600"
        >
          <Crosshair className="w-3 h-3" />
        </button>
      </div>
      {isOpen && kids?.map(k => (
        <TreeNodeRow
          key={k.dbId} node={k} depth={depth + 1}
          expanded={expanded} childrenCache={childrenCache} highlightDbId={highlightDbId}
          onToggle={onToggle} onPreviewBranch={onPreviewBranch}
          coverageMap={coverageMap} requestCoverage={requestCoverage}
        />
      ))}
    </div>
  );
}
