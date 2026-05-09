'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { get, set } from 'idb-keyval';

declare global { interface Window { Autodesk: any; } }

/**
 * Index del modelo — se cachea en Supabase para evitar re-escanear en cada carga.
 * guidIndex:       GUID (propiedad ITEM.GUID de Revit/NW) → dbId
 * propertyHeaders: todos los nombres de propiedad únicos encontrados en el modelo
 */
export interface ModelIndex {
  urn:             string;
  guidIndex:       Record<string, number>;
  propertyHeaders: string[];
  builtAt:         string;
}

/** Un elemento del mapeo ExternalId → dbId exportable */
export interface ModelIdEntry {
  externalId: string;   // GUID de Navisworks / Revit ElementId
  dbId:       number;   // ID runtime del viewer (no usar en BD)
  name?:      string;   // nombre del elemento (si está disponible)
}

export interface ElementProperty {
  category:     string;
  displayName:  string;
  displayValue: string | number;
  attributeName: string;
}

export interface ElementProperties {
  dbId:       number;
  name:       string;
  externalId: string;
  properties: ElementProperty[];
}

export interface NodeInfo {
  dbId:      number;
  name:      string;
  parentId:  number | null;
  childIds:  number[];
  /** Ruta de ancestros desde la raíz hasta el padre inmediato */
  ancestors: { dbId: number; name: string }[];
}

export interface ForgeViewerHandle {
  getSelectedIds:          () => number[];
  /** Expande dbIds padre → nodos hoja (geometría real). Usar antes de cachear dbIds. */
  getLeafDbIds:            (dbIds: number[]) => number[];
  highlight:               (dbIds: number[], rgba: { r: number; g: number; b: number; a: number }) => void;
  clearHighlights:         () => void;
  /** Limpia todos los colores y aplica el mapa hex→dbIds en UNA SOLA invalidation */
  applyThemingBatch:       (colorMap: Map<string, number[]>) => void;
  hide:                    (dbIds: number[]) => void;
  show:                    (dbIds: number[]) => void;
  showAll:                 () => void;
  select:                  (dbIds: number[]) => void;
  isolate:                 (dbIds: number[]) => void;
  fitToView:               (dbIds?: number[]) => void;
  navigateTo:              (dbId: number) => void;
  getNodeName:             (dbId: number) => string | null;
  getChildCount:           (dbId: number) => number;
  getNodeInfo:             (dbId: number) => NodeInfo | null;
  getProperties:           (dbId: number) => Promise<ElementProperties>;
  getExternalIdMapping:    () => Promise<Record<string, number>>;
  resolveExternalIds:      (externalIds: string[]) => Promise<number[]>;
  highlightByExternalIds:  (externalIds: string[], rgba: { r: number; g: number; b: number; a: number }) => Promise<void>;
  exportAllProperties:     (propNames: string[]) => Promise<string>;
  /** @deprecated usa buildPropertyIndex('GUID') */
  buildGuidIndex:          () => Promise<Record<string, number>>;
  /** @deprecated usa applyPropertyColorMap */
  applyGuidColorMap:       (map: Array<{ guid: string; r: number; g: number; b: number; a: number }>) => Promise<number>;
  /**
   * Construye (y cachea) un índice propValue → dbId para cualquier propiedad del modelo.
   * Si la propiedad ya fue indexada, devuelve el caché sin releer el modelo.
   */
  buildPropertyIndex:      (propName: string) => Promise<Record<string, number>>;
  /**
   * Aplica colores usando cualquier propiedad del modelo como clave de match.
   * @param propName  Nombre exacto de la propiedad Revit/Navis (ej: 'GUID', 'ID', 'Mark')
   * @param map       Array de { value, r, g, b, a } donde value es el valor de la propiedad
   * @returns Número de elementos que hicieron match
   */
  applyPropertyColorMap:   (propName: string, map: Array<{ value: string; r: number; g: number; b: number; a: number }>) => Promise<number>;
  /** Resuelve dbIds a partir de un valor de propiedad */
  resolveByProperty:       (propName: string, values: string[]) => Promise<number[]>;
  /** Construye índice universal: TODAS las propiedades de TODOS los elementos en un solo mapa */
  buildUniversalIndex:     (onProgress?: (pct: number) => void) => Promise<void>;
  /** Aplica colores buscando el value en CUALQUIER propiedad del modelo */
  applyUniversalColorMap:  (map: Array<{ value: string; r: number; g: number; b: number; a: number }>) => Promise<number>;
  /** Resuelve dbIds usando el índice universal de forma asíncrona */
  resolveByUniversal:      (values: string[]) => Promise<number[]>;
  /** Resuelve dbIds DE FORMA SÍNCRONA usando el índice universal cacheados. Ideal para bucles render blocking (30-60 UPS) */
  resolveByUniversalSync:  (values: string[]) => number[];
  /** Verdadero si el índice universal ya fue construido */
  isUniversalIndexReady:   () => boolean;
  isolateDbIds:            (dbIds: number[]) => void;
  setGhosting:             (enabled: boolean) => void;
  restoreAll:              () => void;
  /**
   * Pre-carga un ModelIndex guardado en Supabase.
   * Evita re-escanear el modelo si el URN coincide.
   */
  loadCachedIndex:         (index: ModelIndex) => void;
  /** Retorna los headers de propiedades ya descubiertos (vacío si aún no indexado) */
  getPropertyHeaders:      () => string[];
  /** True si el GUID index ya está listo (cacheado o recién construido) */
  isGuidIndexReady:        () => boolean;
}

interface ForgeViewerProps {
  urn:                string;
  onSelectionChange?: (dbIds: number[]) => void;
  onReady?:           () => void;
  /** Cache cargado desde Supabase — si el URN coincide, evita re-escanear */
  cachedIndex?:       ModelIndex | null;
  /** Dispara cuando el scan automático termina (GUID index + property headers) */
  onIndexReady?:      (index: ModelIndex) => void;
  /** 0–100 durante el scan; -1 cuando termina */
  onIndexProgress?:   (pct: number) => void;
}

const VIEWER_VERSION = '7.97';
const VIEWER_CSS = `https://developer.api.autodesk.com/modelderivative/v2/viewers/${VIEWER_VERSION}/style.css`;
const VIEWER_JS  = `https://developer.api.autodesk.com/modelderivative/v2/viewers/${VIEWER_VERSION}/viewer3D.min.js`;

/**
 * Builds a ModelIndex in two fast, non-blocking passes:
 *
 * Pass 1 — GUID index (0 → 70%):
 *   getBulkProperties(ALL dbIds, { propFilter: ['GUID'] })
 *   Requests ONLY the GUID property → tiny payload, completes in seconds even on 50k-element models.
 *
 * Pass 2 — Property headers (70 → 95%):
 *   getBulkProperties(first HEADER_SAMPLE elements, null)
 *   null = ALL properties, but we only sample a few hundred elements → still small payload.
 *   Gives us all distinct property names without scanning the whole model.
 *
 * IMPORTANT: never pass { propFilter: undefined } — the APS SDK ignores it and
 * falls back to returning ALL properties for ALL elements (O(n×m)), which hangs.
 * Use null for "all properties" and { propFilter: [name] } for a single prop.
 */
const HEADER_SAMPLE = 300; // elements sampled for property-headers discovery

async function buildIndexBackground(
  model:      any,
  viewer:     any,
  urn:        string,
  onProgress: (pct: number) => void,
): Promise<ModelIndex> {
  const tree = model.getInstanceTree?.();
  if (!tree) throw new Error('No instance tree');

  const allDbIds: number[] = [];
  tree.enumNodeChildren(tree.getRootId(), (id: number) => { allDbIds.push(id); }, true);

  onProgress(5); // signal start so the UI shows something immediately

  // ── Pass 1: GUID index ───────────────────────────────────────────────────
  // propFilter: ['GUID'] → only requests one property for all elements (fast)
  const guidIndex: Record<string, number> = await new Promise((resolve, reject) => {
    viewer.model.getBulkProperties(
      allDbIds,
      { propFilter: ['GUID'] },
      (results: any[]) => {
        const idx: Record<string, number> = {};
        for (const r of results) {
          const p = (r.properties ?? []).find((p: any) =>
            p.displayName === 'GUID' || p.attributeName === 'GUID'
          );
          if (p?.displayValue != null && p.displayValue !== '') {
            idx[String(p.displayValue).trim()] = r.dbId;
          }
          if (r.name && r.name.length >= 3) {
            idx[r.name.trim()] = r.dbId;
            idx[r.name.trim().toLowerCase()] = r.dbId;
          }
          if (r.externalId && r.externalId.length >= 3) {
            idx[r.externalId.trim()] = r.dbId;
            idx[r.externalId.trim().toLowerCase()] = r.dbId;
          }
        }
        resolve(idx);
      },
      (err: any) => reject(new Error(String(err)))
    );
  });

  onProgress(70); // pass 1 done

  // ── Pass 2: Property headers (sample) ───────────────────────────────────
  // null = ALL properties, only on a small sample → extracts header names cheaply
  const sampleIds  = allDbIds.slice(0, HEADER_SAMPLE);
  const headerSet  = new Set<string>();

  await new Promise<void>((resolve, reject) => {
    viewer.model.getBulkProperties(
      sampleIds,
      null,             // ← null means ALL properties (not undefined, not {})
      (results: any[]) => {
        for (const r of results) {
          for (const p of (r.properties ?? [])) {
            if (p.displayName) headerSet.add(p.displayName);
          }
        }
        resolve();
      },
      (err: any) => reject(new Error(String(err)))
    );
  });

  onProgress(95); // pass 2 done (caller will emit -1 on final .then())

  return {
    urn,
    guidIndex,
    propertyHeaders: [...headerSet].sort(),
    builtAt: new Date().toISOString(),
  };
}

function loadCSS(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.type = 'text/css'; l.href = href;
  document.head.appendChild(l);
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`) && window.Autodesk) { resolve(); return; }
    if (document.querySelector(`script[src="${src}"]`)) {
      const t = setInterval(() => { if (window.Autodesk) { clearInterval(t); resolve(); } }, 100);
      setTimeout(() => { clearInterval(t); reject(new Error('Timeout Forge SDK')); }, 15000);
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => {
      const t = setInterval(() => { if (window.Autodesk) { clearInterval(t); resolve(); } }, 50);
      setTimeout(() => { clearInterval(t); reject(new Error('Autodesk SDK no inicializó')); }, 10000);
    };
    s.onerror = () => reject(new Error(`Error cargando: ${src}`));
    document.head.appendChild(s);
  });
}

const ForgeViewer = forwardRef<ForgeViewerHandle, ForgeViewerProps>(
  ({ urn, onSelectionChange, onReady, cachedIndex, onIndexReady, onIndexProgress }, ref) => {
    const containerRef    = useRef<HTMLDivElement>(null);
    const viewerRef       = useRef<any>(null);
    const modelRef        = useRef<any>(null);
    // Cache by property name — avoids re-scanning for already indexed properties
    const propIndexCache  = useRef<Map<string, Record<string, number>>>(new Map());
    // Universal index: ANY property value → dbId[]
    const universalIndex  = useRef<Record<string, number[]> | null>(null);
    const universalBuildPromise = useRef<Promise<void> | null>(null);
    // Property headers discovered by the background scan
    const propHeadersRef  = useRef<string[]>([]);
    // GUID index (same as propIndexCache['GUID'] but kept separately for compat)
    const guidIndexRef2   = useRef<Record<string, number> | null>(null);
    // Keep latest callbacks in refs to avoid stale closures in useEffect
    const onIndexReadyRef    = useRef(onIndexReady);
    onIndexReadyRef.current  = onIndexReady;
    const onIndexProgressRef = useRef(onIndexProgress);
    onIndexProgressRef.current = onIndexProgress;
    const cachedIndexRef     = useRef(cachedIndex);
    cachedIndexRef.current   = cachedIndex;

    const [status,       setStatus]       = useState<'loading' | 'ready' | 'error'>('loading');
    const [errMsg,       setErrMsg]       = useState('');

    // Instance-tree readiness — resolves once OBJECT_TREE_CREATED fires
    const treeReadyRef       = useRef(false);
    const treeReadyWaiters   = useRef<Array<() => void>>([]);

    /** Resolves when the instance tree is available (waits up to 5 min for heavy models). */
    const waitForTree = (): Promise<void> =>
      new Promise((resolve, reject) => {
        if (treeReadyRef.current) { resolve(); return; }
        
        // Fallback inmediato si Forge lo cargó en un parpadeo
        if (viewerRef.current?.model?.getInstanceTree?.()) {
          treeReadyRef.current = true;
          resolve(); return;
        }

        const maxWaitMs = 300_000;
        let elapsed = 0;
        const tick = 1000;
        
        const poller = setInterval(() => {
          elapsed += tick;
          if (treeReadyRef.current || viewerRef.current?.model?.getInstanceTree?.()) {
            clearInterval(poller);
            treeReadyRef.current = true;
            resolve();
          } else if (elapsed >= maxWaitMs) {
            clearInterval(poller);
            reject(new Error(`Timeout de ${maxWaitMs / 1000}s esperando instance tree`));
          }
        }, tick);
        
        treeReadyWaiters.current.push(() => { clearInterval(poller); resolve(); });
      });

    // Expose imperative API
    useImperativeHandle(ref, () => ({
      getSelectedIds: () => viewerRef.current?.getSelection() ?? [],

      getLeafDbIds: (dbIds: number[]): number[] => {
        const model = modelRef.current;
        if (!model) return dbIds;
        const tree = model.getInstanceTree?.();
        if (!tree) return dbIds;
        const t0      = performance.now();
        const leaves  = new Set<number>();
        const visited = new Set<number>();
        const collect = (id: number) => {
          if (visited.has(id)) return;
          visited.add(id);
          let hasChildren = false;
          tree.enumNodeChildren(id, (child: number) => { hasChildren = true; collect(child); }, false);
          if (!hasChildren) leaves.add(id);
        };
        dbIds.forEach(id => collect(id));
        const result = leaves.size > 0 ? [...leaves] : dbIds;
        console.info(
          `[BIM][LEAF] ${dbIds.length} input → ${result.length} hojas ` +
          `| visitados: ${visited.size} ` +
          `| ${(performance.now() - t0).toFixed(1)} ms`
        );
        return result;
      },

      highlight: (dbIds, { r, g, b, a }) => {
        const v = viewerRef.current;
        if (!v || !modelRef.current) return;
        const color = new (window as any).THREE.Vector4(r, g, b, a);
        // recursive=true para colorear nodos padre + hijos (BIM Linker / vistas de color)
        // El 4D usa applyThemingBatch con recursive=false — ésta es para visualización estática
        dbIds.forEach(id => v.setThemingColor(id, color, modelRef.current, true));
        v.impl?.invalidate(false, false, true);
      },

      clearHighlights: () => {
        const v = viewerRef.current;
        if (!v || !modelRef.current) return;
        v.clearThemingColors(modelRef.current);
      },

      applyThemingBatch: (colorMap) => {
        const v = viewerRef.current;
        const m = modelRef.current;
        if (!v || !m) return;
        const t0 = performance.now();

        // Limpiar mapa interno directamente (evita un render extra por clearThemingColors)
        const db = (m as any)._db2ThemingColor;
        const prevSize = db && typeof db === 'object' ? Object.keys(db).length : 0;
        if (db && typeof db === 'object') {
          Object.keys(db).forEach(k => delete db[k]);
          console.debug(`[BIM][BATCH] Clear interno: ${prevSize} nodos eliminados`);
        } else {
          v.clearThemingColors(m);
          console.debug('[BIM][BATCH] clearThemingColors (fallback — sin mapa interno)');
        }

        const THREE = (window as any).THREE;
        let total = 0;
        for (const [hex, ids] of colorMap) {
          const h = hex.replace('#', '');
          if (h.length !== 6) { console.warn(`[BIM][BATCH] hex inválido: "${hex}"`); continue; }
          const color = new THREE.Vector4(
            parseInt(h.slice(0, 2), 16) / 255,
            parseInt(h.slice(2, 4), 16) / 255,
            parseInt(h.slice(4, 6), 16) / 255,
            0.85,
          );
          // recursive=false: O(1) — requiere nodos hoja de getLeafDbIds
          for (const id of ids) v.setThemingColor(id, color, m, false);
          total += ids.length;
        }

        // Verificar tamaño del mapa después de aplicar
        const afterSize = db && typeof db === 'object' ? Object.keys(db).length : '?';
        const elapsed   = (performance.now() - t0).toFixed(1);
        console.info(
          `[BIM][BATCH] ${colorMap.size} colores | ${total} nodos hoja | ` +
          `mapa interno: ${prevSize}→${afterSize} | ${elapsed} ms`
        );

        // UNA SOLA invalidation para todos los cambios
        v.impl?.invalidate(false, false, true);
      },

      hide: (dbIds) => {
        if (!viewerRef.current) return;
        viewerRef.current.hide(dbIds, modelRef.current);
      },

      show: (dbIds) => {
        if (!viewerRef.current) return;
        viewerRef.current.show(dbIds, modelRef.current);
      },

      showAll: () => {
        if (!viewerRef.current) return;
        viewerRef.current.showAll();
      },

      select: (dbIds) => {
        if (!viewerRef.current) return;
        viewerRef.current.select(dbIds);
      },

      isolate: (dbIds) => {
        if (!viewerRef.current) return;
        viewerRef.current.isolate(dbIds, modelRef.current);
      },

      fitToView: (dbIds) => {
        if (!viewerRef.current) return;
        viewerRef.current.fitToView(dbIds ?? [], modelRef.current);
      },

      // ── Tree navigation ────────────────────────────────────────────────────

      /** Solo selecciona en el viewer, sin aislar ni encuadrar (rápido). */
      navigateTo: (dbId: number) => {
        const v = viewerRef.current;
        if (!v) return;
        v.select([dbId]);
      },

      /** Nombre de un nodo sin recorrer ancestros (O(1)). */
      getNodeName: (dbId: number): string | null => {
        if (!modelRef.current) return null;
        const tree = modelRef.current.getInstanceTree?.();
        return tree ? (tree.getNodeName(dbId) ?? null) : null;
      },

      /** Cuántos hijos directos tiene un nodo (O(n) hijos, sin recursión). */
      getChildCount: (dbId: number): number => {
        if (!modelRef.current) return 0;
        const tree = modelRef.current.getInstanceTree?.();
        if (!tree) return 0;
        let count = 0;
        tree.enumNodeChildren(dbId, () => { count++; }, false);
        return count;
      },

      getNodeInfo: (dbId: number) => {
        const v = viewerRef.current;
        if (!v || !modelRef.current) return null;
        const tree = modelRef.current.getInstanceTree?.();
        if (!tree) return null;

        const name     = tree.getNodeName(dbId) ?? '';
        const parentId = tree.getNodeParentId(dbId);

        // Direct children
        const childIds: number[] = [];
        tree.enumNodeChildren(dbId, (cid: number) => { childIds.push(cid); }, false);

        // Ancestors (walk up to root)
        const ancestors: { dbId: number; name: string }[] = [];
        let cur: number = parentId;
        const rootId = tree.getRootId();
        while (cur != null && cur !== dbId && cur !== undefined) {
          ancestors.unshift({ dbId: cur, name: tree.getNodeName(cur) ?? String(cur) });
          if (cur === rootId) break;
          const p = tree.getNodeParentId(cur);
          if (p == null || p === cur) break;
          cur = p;
        }

        return { dbId, name, parentId: parentId ?? null, childIds, ancestors };
      },

      // ── Properties ─────────────────────────────────────────────────────────

      getProperties: (dbId: number) =>
        new Promise((resolve, reject) => {
          if (!viewerRef.current) { reject(new Error('Viewer no iniciado')); return; }
          viewerRef.current.getProperties(
            dbId,
            (result: any) => resolve({
              dbId:       result.dbId,
              name:       result.name,
              externalId: result.externalId,
              properties: (result.properties ?? []).map((p: any) => ({
                category:     p.displayCategory ?? '',
                displayName:  p.displayName,
                displayValue: p.displayValue,
                attributeName: p.attributeName,
              })),
            }),
            (err: any) => reject(new Error(err))
          );
        }),

      // ── ID mapping ─────────────────────────────────────────────────────────

      getExternalIdMapping: () =>
        new Promise((resolve, reject) => {
          if (!modelRef.current) { reject(new Error('Modelo no cargado')); return; }
          modelRef.current.getExternalIdMapping(
            (mapping: Record<string, number>) => resolve(mapping),
            (err: any) => reject(new Error(err))
          );
        }),

      resolveExternalIds: (externalIds: string[]) =>
        new Promise((resolve, reject) => {
          if (!modelRef.current) { reject(new Error('Modelo no cargado')); return; }
          modelRef.current.getExternalIdMapping(
            (mapping: Record<string, number>) => {
              const set = new Set(externalIds);
              const dbIds = Object.entries(mapping)
                .filter(([eid]) => set.has(eid))
                .map(([, dbId]) => dbId);
              resolve(dbIds);
            },
            (err: any) => reject(new Error(err))
          );
        }),

      highlightByExternalIds: async (externalIds, rgba) => {
        const v = viewerRef.current;
        if (!v || !modelRef.current) return;
        const mapping: Record<string, number> = await new Promise((res, rej) =>
          modelRef.current!.getExternalIdMapping(res, rej)
        );
        const set = new Set(externalIds);
        const color = new (window as any).THREE.Vector4(rgba.r, rgba.g, rgba.b, rgba.a);
        Object.entries(mapping).forEach(([eid, dbId]) => {
          if (set.has(eid)) v.setThemingColor(dbId, color, modelRef.current, true);
        });
      },

      // ── Bulk property export ────────────────────────────────────────────────

      exportAllProperties: (propNames: string[]) =>
        new Promise((resolve, reject) => {
          if (!viewerRef.current || !modelRef.current) {
            reject(new Error('Modelo no cargado')); return;
          }
          // Get all dbIds in the model
          const tree = viewerRef.current.model?.getInstanceTree?.() ?? modelRef.current.getInstanceTree?.();
          if (!tree) { reject(new Error('Instance tree no disponible')); return; }

          const allDbIds: number[] = [];
          tree.enumNodeChildren(tree.getRootId(), (dbId: number) => { allDbIds.push(dbId); }, true);

          viewerRef.current.model.getBulkProperties(
            allDbIds,
            { propFilter: propNames.length ? propNames : undefined },
            (results: any[]) => {
              const headers = ['dbId', 'externalId', 'name', ...propNames];
              const rows    = [headers.join(',')];
              for (const r of results) {
                const propMap: Record<string, string> = {};
                for (const p of (r.properties ?? [])) {
                  propMap[p.displayName] = String(p.displayValue ?? '');
                }
                const row = [
                  r.dbId,
                  `"${r.externalId ?? ''}"`,
                  `"${(r.name ?? '').replace(/"/g, '""')}"`,
                  ...propNames.map(n => `"${(propMap[n] ?? '').replace(/"/g, '""')}"`),
                ];
                rows.push(row.join(','));
              }
              resolve(rows.join('\n'));
            },
            (err: any) => reject(new Error(err))
          );
        }),

      // ── GUID index (Revit/NW GUID property) ────────────────────────────────

      buildGuidIndex: () =>
        waitForTree().then(() => new Promise<Record<string,number>>((resolve, reject) => {
          // backward-compat shim — delegates to generic index
          const cached = propIndexCache.current.get('GUID');
          if (cached) { resolve(cached); return; }
          if (!viewerRef.current || !modelRef.current) { reject(new Error('Modelo no cargado')); return; }
          const tree = modelRef.current.getInstanceTree?.();
          if (!tree) { reject(new Error('Instance tree no disponible')); return; }
          const allDbIds: number[] = [];
          tree.enumNodeChildren(tree.getRootId(), (id: number) => { allDbIds.push(id); }, true);
          viewerRef.current.model.getBulkProperties(
            allDbIds,
            { propFilter: ['GUID'] },
            (results: any[]) => {
              const index: Record<string, number> = {};
              for (const r of results) {
                const p = (r.properties ?? []).find((p: any) => p.displayName === 'GUID' || p.attributeName === 'GUID');
                if (p?.displayValue != null && p.displayValue !== '') {
                  index[String(p.displayValue).trim()] = r.dbId;
                }
                if (r.name && r.name.length >= 3) {
                  index[r.name.trim()] = r.dbId;
                  index[r.name.trim().toLowerCase()] = r.dbId;
                }
                if (r.externalId && r.externalId.length >= 3) {
                  index[r.externalId.trim()] = r.dbId;
                  index[r.externalId.trim().toLowerCase()] = r.dbId;
                }
              }
              propIndexCache.current.set('GUID', index);
              resolve(index);
            },
            (err: any) => reject(new Error(err))
          );
        })),

      applyGuidColorMap: async (map) => {
        // Backward-compat shim
        return (useImperativeHandle as any)._self?.applyPropertyColorMap?.(
          'GUID',
          map.map(e => ({ value: e.guid, r: e.r, g: e.g, b: e.b, a: e.a }))
        ) ?? 0;
      },

      // ── Generic property index ─────────────────────────────────────────────

      buildPropertyIndex: (propName: string) =>
        waitForTree().then(() => new Promise<Record<string,number>>((resolve, reject) => {
          // Return cached index if already built for this property
          const cached = propIndexCache.current.get(propName);
          if (cached) { resolve(cached); return; }
          if (!viewerRef.current || !modelRef.current) { reject(new Error('Modelo no cargado')); return; }
          const tree = modelRef.current.getInstanceTree?.();
          if (!tree) { reject(new Error('Instance tree no disponible')); return; }

          const allDbIds: number[] = [];
          tree.enumNodeChildren(tree.getRootId(), (id: number) => { allDbIds.push(id); }, true);

          viewerRef.current.model.getBulkProperties(
            allDbIds,
            { propFilter: [propName] },
            (results: any[]) => {
              const index: Record<string, number> = {};
              for (const r of results) {
                // Match both displayName and attributeName
                const prop = (r.properties ?? []).find((p: any) =>
                  p.displayName === propName || p.attributeName === propName
                );
                if (prop?.displayValue != null && prop.displayValue !== '') {
                  const key = String(prop.displayValue).trim();
                  if (key) index[key] = r.dbId;
                }
              }
              propIndexCache.current.set(propName, index);
              resolve(index);
            },
            (err: any) => reject(new Error(String(err)))
          );
        })),

      applyPropertyColorMap: async (propName, map) => {
        const v = viewerRef.current;
        if (!v || !modelRef.current) return 0;

        // Build or retrieve index
        const cached = propIndexCache.current.get(propName);
        let index: Record<string, number>;
        if (cached) {
          index = cached;
        } else {
          await new Promise<void>((res, rej) => {
            const tree = modelRef.current.getInstanceTree?.();
            if (!tree) { rej(new Error('tree')); return; }
            const allDbIds: number[] = [];
            tree.enumNodeChildren(tree.getRootId(), (id: number) => { allDbIds.push(id); }, true);
            v.model.getBulkProperties(
              allDbIds, { propFilter: [propName] },
              (results: any[]) => {
                const idx: Record<string, number> = {};
                for (const r of results) {
                  const prop = (r.properties ?? []).find((p: any) =>
                    p.displayName === propName || p.attributeName === propName
                  );
                  if (prop?.displayValue != null && prop.displayValue !== '') {
                    const key = String(prop.displayValue).trim();
                    if (key) idx[key] = r.dbId;
                  }
                }
                propIndexCache.current.set(propName, idx);
                index = idx;
                res();
              },
              (err: any) => rej(new Error(String(err)))
            );
          });
          index = propIndexCache.current.get(propName)!;
        }

        const t0 = performance.now();
        let matched = 0;
        for (const entry of map) {
          const dbId = index[String(entry.value).trim()];
          if (dbId == null) continue;
          matched++;
          const color = new (window as any).THREE.Vector4(entry.r, entry.g, entry.b, entry.a);
          v.setThemingColor(dbId, color, modelRef.current, false);
        }
        v.impl?.invalidate(false, false, true);
        console.debug(`[BIM] applyPropertyColorMap: ${matched}/${map.length} matches — ${(performance.now()-t0).toFixed(1)}ms`);
        return matched;
      },

      resolveByProperty: async (propName, values) => {
        const v = viewerRef.current;
        if (!v || !modelRef.current) return [];
        const cached = propIndexCache.current.get(propName);
        let index: Record<string, number>;
        if (cached) {
          index = cached;
        } else {
          const tree = modelRef.current.getInstanceTree?.();
          if (!tree) return [];
          const allDbIds: number[] = [];
          tree.enumNodeChildren(tree.getRootId(), (id: number) => { allDbIds.push(id); }, true);
          index = await new Promise<Record<string, number>>((res, rej) =>
            v.model.getBulkProperties(
              allDbIds, { propFilter: [propName] },
              (results: any[]) => {
                const idx: Record<string, number> = {};
                for (const r of results) {
                  const prop = (r.properties ?? []).find((p: any) =>
                    p.displayName === propName || p.attributeName === propName
                  );
                  if (prop?.displayValue != null) idx[String(prop.displayValue).trim()] = r.dbId;
                }
                propIndexCache.current.set(propName, idx);
                res(idx);
              },
              rej
            )
          );
        }
        const set = new Set(values.map(v => String(v).trim()));
        return Object.entries(index).filter(([k]) => set.has(k)).map(([, dbId]) => dbId);
      },
      // ── Universal index ───────────────────────────────────────────────────────
      // Concentra TODAS las propiedades de todos los elementos en un solo mapa.
      // value (normalizado) → dbId
      // Solo indexa valores string con ≥3 chars para evitar falsos positivos.

      buildUniversalIndex: async (onProgress?: (pct: number) => void): Promise<void> => {
        if (universalIndex.current) { if (onProgress) onProgress(100); return; }
        if (universalBuildPromise.current) return universalBuildPromise.current;

        universalBuildPromise.current = (async () => {
          try {
            const cached = await get(`universal-idx-${urn}`);
            if (cached) { universalIndex.current = cached; return; }
          } catch (e) { console.warn('IDB read err', e); }

          await waitForTree();

          return new Promise<void>((resolve, reject) => {
            if (!viewerRef.current || !modelRef.current) { reject(new Error('Modelo no cargado')); return; }
            const tree = modelRef.current.getInstanceTree?.();
            if (!tree) { reject(new Error('Instance tree no disponible')); return; }

            const allDbIds: number[] = [];
            tree.enumNodeChildren(tree.getRootId(), (id: number) => { allDbIds.push(id); }, true);

            const idx: Record<string, number[]> = {};
            const addDbId = (k: string, id: number) => {
              if (!idx[k]) idx[k] = [];
              else if (idx[k].includes(id)) return;
              idx[k].push(id);
            };
            const CHUNK_SIZE = 1000;

            const processChunk = async (startIndex: number) => {
              if (onProgress) onProgress(Math.min(99, Math.round((startIndex / allDbIds.length) * 100)));
              if (startIndex >= allDbIds.length) {
                universalIndex.current = idx;
                try { await set(`universal-idx-${urn}`, idx); } catch (e) { console.warn('IDB save err', e); }
                if (onProgress) onProgress(100);
                resolve();
                return;
              }
            const chunk = allDbIds.slice(startIndex, startIndex + CHUNK_SIZE);
            viewerRef.current.model.getBulkProperties(
              chunk,
              null,
              (results: any[]) => {
                for (const r of results) {
                  for (const p of (r.properties ?? [])) {
                    const raw = p.displayValue;
                    if (raw == null || raw === '') continue;
                    const key = String(raw).trim();
                    if (key.length >= 3) {
                      addDbId(key, r.dbId);
                      const lower = key.toLowerCase();
                      if (lower !== key) addDbId(lower, r.dbId);
                    }
                  }
                  if (r.name && r.name.length >= 3) addDbId(r.name.trim(), r.dbId);
                  if (r.externalId && r.externalId.length >= 3) addDbId(r.externalId.trim(), r.dbId);
                }
                setTimeout(() => processChunk(startIndex + CHUNK_SIZE), 40);
              },
              (err: any) => reject(new Error(String(err)))
            );
          };
          processChunk(0);
        });
        })();
        return universalBuildPromise.current;
      },

      applyUniversalColorMap: async (map: Array<{ value: string; r: number; g: number; b: number; a: number }>) => {
        const v = viewerRef.current;
        if (!v || !modelRef.current) return 0;
        if (!universalIndex.current) {
          await new Promise<void>((res, rej) => {
            const tree = modelRef.current.getInstanceTree?.();
            if (!tree) { rej(new Error('tree')); return; }
            const allDbIds: number[] = [];
            tree.enumNodeChildren(tree.getRootId(), (id: number) => { allDbIds.push(id); }, true);
            const idx: Record<string, number[]> = {};
            const addDbId = (k: string, id: number) => {
              if (!idx[k]) idx[k] = [];
              else if (idx[k].includes(id)) return;
              idx[k].push(id);
            };
            const CHUNK_SIZE = 1000;

            const processChunk = async (startIndex: number) => {
              if (startIndex >= allDbIds.length) {
                universalIndex.current = idx;
                try { await set(`universal-idx-${urn}`, idx); } catch (e) {}
                res();
                return;
              }
              const chunk = allDbIds.slice(startIndex, startIndex + CHUNK_SIZE);
              v.model.getBulkProperties(
                chunk,
                null,
                (results: any[]) => {
                  for (const r of results) {
                    for (const p of (r.properties ?? [])) {
                      const key = String(p.displayValue ?? '').trim();
                      if (key.length >= 3) { addDbId(key, r.dbId); addDbId(key.toLowerCase(), r.dbId); }
                    }
                    if (r.name?.length >= 3) addDbId(r.name.trim(), r.dbId);
                    if (r.externalId?.length >= 3) addDbId(r.externalId.trim(), r.dbId);
                  }
                  setTimeout(() => processChunk(startIndex + CHUNK_SIZE), 40);
                },
                (err: any) => rej(new Error(String(err)))
              );
            };
            processChunk(0);
          });
        }
        const idx = universalIndex.current!;
        let matched = 0;
        for (const entry of map) {
          const key  = String(entry.value).trim();
          const dbIds = [...(idx[key] || []), ...(idx[key.toLowerCase()] || [])];
          if (dbIds.length === 0) continue;
          matched++;
          const color = new (window as any).THREE.Vector4(entry.r, entry.g, entry.b, entry.a);
          dbIds.forEach(id => v.setThemingColor(id, color, modelRef.current, true));
        }
        return matched;
      },

      resolveByUniversal: async (values: string[]) => {
        if (!universalIndex.current) return [];
        const idx    = universalIndex.current;
        const result: number[] = [];
        const seen   = new Set<number>();
        for (const v of values) {
          const key  = String(v).trim();
          const dbIds1 = idx[key] || [];
          const dbIds2 = idx[key.toLowerCase()] || [];
          for (const dbId of [...dbIds1, ...dbIds2]) {
            if (!seen.has(dbId)) { seen.add(dbId); result.push(dbId); }
          }
        }
        return result;
      },

      resolveByUniversalSync: (values: string[]) => {
        if (!universalIndex.current) return [];
        const idx    = universalIndex.current;
        const result: number[] = [];
        const seen   = new Set<number>();
        for (const v of values) {
          const key  = String(v).trim();
          const dbIds1 = idx[key] || [];
          const dbIds2 = idx[key.toLowerCase()] || [];
          for (const dbId of [...dbIds1, ...dbIds2]) {
            if (!seen.has(dbId)) { seen.add(dbId); result.push(dbId); }
          }
        }
        return result;
      },

      isUniversalIndexReady: () => universalIndex.current != null,

      isolateDbIds: (dbIds) => {
        const v = viewerRef.current;
        if (!v) return;
        v.isolate(dbIds, modelRef.current);
      },

      setGhosting: (enabled) => {
        const v = viewerRef.current;
        if (!v) return;
        v.prefs.set('ghosting', enabled);
      },

      restoreAll: () => {
        const v = viewerRef.current;
        if (!v) return;
        v.showAll();
        v.clearThemingColors(modelRef.current);
      },

      // ── Cache helpers ─────────────────────────────────────────────────────

      loadCachedIndex: (index: ModelIndex) => {
        // Pre-populate GUID index so buildGuidIndex() returns instantly
        propIndexCache.current.set('GUID', index.guidIndex);
        guidIndexRef2.current = index.guidIndex;
        propHeadersRef.current = index.propertyHeaders;
        console.log('[BIM] Índice pre-cargado (loadCachedIndex)');
      },

      getPropertyHeaders: () => propHeadersRef.current,

      isGuidIndexReady: () => {
        return propIndexCache.current.has('GUID') || guidIndexRef2.current != null;
      },
    }), []);


    useEffect(() => {
      if (!urn || !containerRef.current) return;
      let cancelled = false;
      let resizeObserver: ResizeObserver | null = null;

      async function init() {
        try {
          loadCSS(VIEWER_CSS);
          await loadScript(VIEWER_JS);
          if (cancelled) return;
          if (!window.Autodesk?.Viewing) throw new Error('Autodesk Viewing SDK no disponible');

          const tokenRes = await fetch('/api/autodesk/viewer-token');
          const tokenData = await tokenRes.json();
          if (!tokenData.access_token) throw new Error('Sin token del viewer');
          if (cancelled) return;

          const AV = window.Autodesk.Viewing;

          await new Promise<void>(resolve =>
            AV.Initializer({
              env: 'AutodeskProduction2',
              api: 'streamingV2',
              getAccessToken: (cb: (t: string, e: number) => void) =>
                cb(tokenData.access_token, tokenData.expires_in ?? 3600),
            }, resolve)
          );
          if (cancelled) return;

          const viewer = new AV.GuiViewer3D(containerRef.current!, {
            useConsolidation:         true,
            consolidationMemoryLimit: 150 * 1024 * 1024, // 150 MB — (reducido para asegurar theaming individual en el 4D)
          });
          viewer.start();
          viewerRef.current = viewer;

          // ── Performance defaults ─────────────────────────────────────────
          try { viewer.setQualityLevel(false, false); } catch {}   // sin SAO ni FXAA
          try { viewer.prefs?.set('groundShadow',         false); } catch {}
          try { viewer.prefs?.set('groundReflection',     false); } catch {}
          try { viewer.prefs?.set('progressiveRendering', true);  } catch {}
          try { viewer.prefs?.set('ghosting',             false); } catch {}
          try { viewer.prefs?.set('antialiasing',         false); } catch {}
          try { viewer.prefs?.set('ambientShadows',       false); } catch {}
          // Clave: reduce calidad durante rotación/pan → máxima fluidez en navegación
          try { viewer.prefs?.set('optimizeNavigation',   true);  } catch {}
          try { viewer.prefs?.set('lineRendering',        false); } catch {}

          // ── Fondo blanco por defecto (Blanco simple = lightPreset 10) ────
          try { viewer.setLightPreset(10); } catch {}
          try { viewer.setEnvMapBackground(false); } catch {}

          console.log('[BIM] Viewer iniciado — optimizeNavigation ON, consolidación activada');

          // ── Frame-time profiler ──────────────────────────────────────────
          // Mide ms reales entre frames y detecta frames lentos (>50ms = <20fps)
          let _lastFrameTs  = performance.now();
          let _frames       = 0;
          let _slowFrames   = 0;
          let _totalFrameMs = 0;
          let _slowLogTs    = 0;        // throttle: un warn cada 500ms máximo

          viewer.addEventListener(AV.RENDER_PRESENTED_EVENT, () => {
            _frames++;
            const now     = performance.now();
            const frameMs = now - _lastFrameTs;
            _lastFrameTs  = now;
            _totalFrameMs += frameMs;

            if (frameMs > 50 && now - _slowLogTs > 500) {   // <20 fps → aviso
              _slowLogTs = now;
              _slowFrames++;
              // Introspección: ¿cuántos nodos tiene actualmente el mapa de theming?
              const m     = modelRef.current;
              const thMap = m ? (m as any)._db2ThemingColor : null;
              const thSize = thMap ? Object.keys(thMap).length : 0;
              console.warn(
                `[BIM][PERF] Frame lento: ${frameMs.toFixed(0)} ms ` +
                `| ${(1000 / frameMs).toFixed(0)} fps ` +
                `| theming nodes activos: ${thSize} ` +
                `| slow frames acum: ${_slowFrames}`
              );
            }
          });

          // ── FPS resumen cada 5 s ─────────────────────────────────────────
          let _fpsSnapTs = performance.now();
          let _fpsSnapFrames = 0;
          const _fpsInterval = setInterval(() => {
            const now   = performance.now();
            const delta = (now - _fpsSnapTs) / 1000;
            const fps   = _fpsSnapFrames > 0 ? Math.round(_fpsSnapFrames / delta) : 0;
            const m     = modelRef.current;
            const thSize = m ? Object.keys((m as any)._db2ThemingColor ?? {}).length : 0;
            const mem    = (performance as any).memory;
            const heapMb = mem ? (mem.usedJSHeapSize / 1024 / 1024).toFixed(0) : '?';
            console.info(
              `[BIM][FPS] ${fps} fps | frames: ${_fpsSnapFrames} | ` +
              `theming nodes: ${thSize} | heap: ${heapMb} MB`
            );
            _fpsSnapFrames = 0;
            _fpsSnapTs     = now;
          }, 5000);
          viewer.addEventListener(AV.RENDER_PRESENTED_EVENT, () => { _fpsSnapFrames++; });

          // ── Camera change (THROTTLED — max 1 log / 2 s) ──────────────────
          let _lastCamLog = 0;
          viewer.addEventListener(AV.CAMERA_CHANGE_EVENT, () => {
            const now = performance.now();
            if (now - _lastCamLog > 2000) {
              _lastCamLog = now;
              console.debug('[BIM] CAMERA_CHANGE activo');
            }
          });

          // cleanup interval on destroy
          const _origFinish = viewer.finish?.bind(viewer);
          if (_origFinish) {
            viewer.finish = () => { clearInterval(_fpsInterval); _origFinish(); };
          }

          // Keep canvas dimensions in sync whenever the container resizes
          resizeObserver = new ResizeObserver(() => { viewer.resize(); });
          resizeObserver.observe(containerRef.current!);

          // Selection event
          viewer.addEventListener(AV.SELECTION_CHANGED_EVENT, (e: any) => {
            onSelectionChange?.(e.dbIdArray ?? []);
          });

          const docUrn = urn.startsWith('urn:') ? urn : `urn:${urn}`;

          await new Promise<void>((resolve, reject) =>
            AV.Document.load(docUrn,
              async (doc: any) => {
                try {
                  const viewable = doc.getRoot().getDefaultGeometry();
                  if (!viewable) throw new Error('Sin geometría');
                  const model = await viewer.loadDocumentNode(doc, viewable);
                  modelRef.current = model;
                  setStatus('ready');
                  onReady?.();

                  // Re-apply white background after model load (Forge resets env on geometry load)
                  try { viewer.setLightPreset(10); } catch {}
                  try { viewer.setEnvMapBackground(false); } catch {}

                  // ── Diagnóstico y optimizaciones post-carga ─────────────
                  try {
                    const geomList = (model as any).getGeometryList?.();
                    const fragList = (model as any).getFragmentList?.();
                    const polyCount = geomList?.getTotalPolyCount?.() ?? 'N/A';
                    const fragCount = fragList?.fragments?.length ?? fragList?.getCount?.() ?? 'N/A';
                    const impl = (viewer as any).impl;
                    const consolidatedViewer = !!impl?.consolidation;
                    const consolidatedModel  = !!(model as any)?.consolidation;
                    console.info(
                      `[BIM][MODEL] Cargado — ` +
                      `polígonos: ${polyCount} | fragmentos: ${fragCount} | ` +
                      `consolidado viewer: ${consolidatedViewer} | modelo: ${consolidatedModel}`
                    );
                    const mem = (performance as any).memory;
                    if (mem) console.info(`[BIM][MODEL] Heap al cargar: ${(mem.usedJSHeapSize / 1024 / 1024).toFixed(0)} MB / ${(mem.jsHeapSizeLimit / 1024 / 1024).toFixed(0)} MB límite`);

                    // ── Intentar consolidación explícita ─────────────────────
                    // Forge v7: impl.consolidateModel() fusiona meshes pequeños → menos draw calls
                    if (impl?.consolidateModel) {
                      impl.consolidateModel(model, 150 * 1024 * 1024);
                      console.info('[BIM][MODEL] consolidateModel() invocado manualmente');
                    } else {
                      console.warn('[BIM][MODEL] impl.consolidateModel no disponible');
                    }

                    // ── Aumentar límite de meshes en GPU ─────────────────────
                    // Por defecto Forge mantiene ~10k meshes en GPU. Con 37k meshes totales
                    // el page-swap constante es la fuente del freeze durante rotación.
                    // Intentamos subir el límite a ~30k para mantener más en GPU.
                    const glr = impl?.glrenderer?.();
                    if (glr?.setMemoryConfig) {
                      glr.setMemoryConfig({ maxObjects: 60000 });
                      console.info('[BIM][MODEL] GPU maxObjects → 60000');
                    } else if (impl?.setMemoryConfig) {
                      impl.setMemoryConfig({ maxObjects: 60000 });
                      console.info('[BIM][MODEL] impl.setMemoryConfig maxObjects → 60000');
                    } else {
                      console.warn('[BIM][MODEL] setMemoryConfig no disponible — page-swap de meshes puede seguir ocurriendo');
                    }
                  } catch (e) { console.debug('[BIM][MODEL] Stats no disponibles:', e); }

                  resolve();

                  // ── Background index ────────────────────────────────────
                  // If a cached index exists for this URN, load it and skip scan
                  const cached = cachedIndexRef.current;
                  const docUrnClean = urn.startsWith('urn:') ? urn.slice(4) : urn;
                  if (cached && (cached.urn === urn || cached.urn === docUrnClean)) {
                    propIndexCache.current.set('GUID', cached.guidIndex);
                    guidIndexRef2.current = cached.guidIndex;
                    propHeadersRef.current = cached.propertyHeaders;
                    console.log('[BIM] Índice cargado desde caché:', Object.keys(cached.guidIndex).length, 'elementos');
                    return;
                  }

                  // Otherwise scan in background — wait for OBJECT_TREE to be ready
                  console.log('[BIM] Iniciando scan de índice...');

                  const runIndexing = () => {
                    const tree = model.getInstanceTree?.();
                    console.log('[BIM] Iniciando indexación. InstanceTree:', !!tree,
                      '| dbIds disponibles:', tree ? (() => { let n = 0; tree.enumNodeChildren(tree.getRootId(), () => n++, true); return n; })() : 0);
                    buildIndexBackground(model, viewer, urn, (pct) => {
                      console.log('[BIM] Progreso:', pct, '%');
                      if (!cancelled) onIndexProgressRef.current?.(pct);
                    }).then(index => {
                      if (cancelled) return;
                      console.log('[BIM] Indexación completa — GUIDs:', Object.keys(index.guidIndex).length,
                        '| Headers:', index.propertyHeaders.length);
                      propIndexCache.current.set('GUID', index.guidIndex);
                      guidIndexRef2.current = index.guidIndex;
                      propHeadersRef.current = index.propertyHeaders;
                      onIndexReadyRef.current?.(index);
                      onIndexProgressRef.current?.(-1);
                    }).catch((err) => {
                      console.error('[BIM] Error en indexación:', err);
                    });
                  };

                  // The object tree may not be ready right after loadDocumentNode.
                  // Wait for OBJECT_TREE_CREATED_EVENT if not already available.
                  const signalTreeReady = () => {
                    treeReadyRef.current = true;
                    treeReadyWaiters.current.forEach(r => r());
                    treeReadyWaiters.current = [];
                  };

                  if (model.getInstanceTree?.()) {
                    console.log('[BIM] InstanceTree ya disponible, iniciando scan inmediato.');
                    signalTreeReady();
                    runIndexing();
                  } else {
                    console.log('[BIM] Esperando OBJECT_TREE_CREATED_EVENT...');
                    const onTreeReady = (e: any) => {
                      if (cancelled) return;
                      // Only handle event for THIS model
                      if (e.model && e.model !== model) return;
                      viewer.removeEventListener(AV.OBJECT_TREE_CREATED_EVENT, onTreeReady);
                      console.log('[BIM] OBJECT_TREE_CREATED_EVENT recibido, iniciando scan.');
                      signalTreeReady();
                      runIndexing();
                    };
                    viewer.addEventListener(AV.OBJECT_TREE_CREATED_EVENT, onTreeReady);
                  }
                } catch (e: any) { reject(e); }
              },
              (code: number, msg: string) => reject(new Error(`Doc error (${code}): ${msg}`))
            )
          );
        } catch (err: any) {
          if (!cancelled) { setStatus('error'); setErrMsg(err.message ?? 'Error'); }
        }
      }

      init();
      return () => {
        cancelled = true;
        treeReadyRef.current = false;
        treeReadyWaiters.current = [];
        resizeObserver?.disconnect();
        try { viewerRef.current?.finish(); viewerRef.current = null; modelRef.current = null; } catch {}
      };
    }, [urn]);

    return (
      <div className="relative w-full h-full bg-[#1a1a2e]">
        <div ref={containerRef} className="w-full h-full" />

        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1a1a2e] z-10">
            <Loader2 size={28} className="animate-spin text-blue-400" />
            <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">Cargando modelo 3D...</p>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1a1a2e] z-10 p-8 text-center">
            <AlertCircle size={28} className="text-rose-400" />
            <p className="text-[11px] font-black text-rose-300 uppercase tracking-widest">Error al cargar</p>
            <p className="text-[10px] text-slate-400 max-w-xs">{errMsg}</p>
            <button onClick={() => { setStatus('loading'); setErrMsg(''); }}
              className="px-4 py-2 bg-blue-600 text-white text-[10px] font-black rounded-xl mt-2">
              Reintentar
            </button>
          </div>
        )}
      </div>
    );
  }
);

ForgeViewer.displayName = 'ForgeViewer';
export default ForgeViewer;
