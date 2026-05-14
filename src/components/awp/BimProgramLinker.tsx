'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MousePointer2, Layers, Trash2, Eye, EyeOff, BoxSelect, Save, Link2, Unlink, Play, Square, Search, ChevronRight, ChevronDown, X, RotateCcw, Filter, Palette, CalendarDays, GripHorizontal, Loader2, Library } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { setBimLinkerKey } from '@/lib/supabase/projectConfig';
import type { ForgeViewerHandle } from './ForgeViewer';
import type { Activity } from './GanttChart';
import { getDiscColor } from './GanttChart';
import type { SavedColorView } from './BimDataLinker';
import { cleanDescription } from './PlanCharts';

// Types
interface SelectionSet { id: string; name: string; externalIds: string[]; color: string; activityId?: string; dbIds: number[]; }
interface ProgramLink { id: string; project_id: string; activity_id: string; set_name: string; external_ids: string[]; color: string; }
interface TreeNode { dbId: number; name: string; children: TreeNode[]; selected: boolean; leafCount: number; }

const COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#F97316','#14B8A6','#6366F1'];

// Mini tree component
function MiniTree({ node, depth, onSelect }: { node: TreeNode; depth: number; onSelect: (dbId: number, name: string) => void }) {
  const [open, setOpen] = useState(depth < 1);
  const hasKids = node.children.length > 0;
  return (
    <div>
      <div className="flex items-center gap-1 hover:bg-blue-50 rounded px-1 py-0.5 cursor-pointer group" style={{ paddingLeft: depth * 12 }}
        onClick={() => hasKids ? setOpen(!open) : onSelect(node.dbId, node.name)}>
        {hasKids ? (open ? <ChevronDown size={10} className="text-slate-400 shrink-0" /> : <ChevronRight size={10} className="text-slate-400 shrink-0" />) : <div className="w-2.5" />}
        <span className="text-[10px] text-slate-600 truncate flex-1">{node.name || `#${node.dbId}`}</span>
        <span className="text-[8px] font-bold text-slate-300 shrink-0 tabular-nums group-hover:text-slate-400">{node.leafCount}</span>
        {hasKids && <button onClick={e => { e.stopPropagation(); onSelect(node.dbId, node.name); }} className="text-[8px] text-blue-500 font-bold opacity-0 group-hover:opacity-100 shrink-0 px-1 bg-blue-50 rounded ml-0.5">SEL</button>}
      </div>
      {open && node.children.map(c => <MiniTree key={c.dbId} node={c} depth={depth + 1} onSelect={onSelect} />)}
    </div>
  );
}

// Props
interface Props {
  projectId: string;
  viewerRef: React.RefObject<ForgeViewerHandle | null>;
  viewerReady: boolean;
}

export default function BimProgramLinker({ projectId, viewerRef, viewerReady }: Props) {
  // State
  const [activities, setActivities] = useState<Activity[]>([]);
  const [links, setLinks] = useState<ProgramLink[]>([]);
  const [sets, setSets] = useState<SelectionSet[]>([]);
  const [currentSelection, setCurrentSelection] = useState<number[]>([]);
  const [currentExternalIds, setCurrentExternalIds] = useState<string[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [newSetName, setNewSetName] = useState('');
  const [actFilter, setActFilter] = useState('');
  const [discFilter, setDiscFilter] = useState('ALL');
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
  const [propNames, setPropNames] = useState<string[]>([]);
  const [selProp, setSelProp] = useState('');
  const [propValues, setPropValues] = useState<{ value: string; count: number }[]>([]);
  const [playing, setPlaying] = useState(false);
  const [playDay, setPlayDay] = useState(0);
  const playRef = useRef(false);
  const colorIdx = useRef(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [deepSelection, setDeepSelection] = useState(false);
  
  // Vistas guardadas
  const [savedViews, setSavedViews] = useState<SavedColorView[]>([]);
  const [expandedViews, setExpandedViews] = useState<Set<string>>(new Set());

  // Link by selection
  const [activeActId, setActiveActId] = useState<string | null>(null);
  const [activeViewNode, setActiveViewNode] = useState<{ viewName: string; nodeValue: string; nodeColor: string; guids: string[]; dbIds: number[] } | null>(null);

  // Save selection to view library
  const [saveViewName, setSaveViewName] = useState('');
  const [saveViewColor, setSaveViewColor] = useState(COLORS[0]);
  const [saveViewTarget, setSaveViewTarget] = useState<string>('new');
  const [saveViewLoading, setSaveViewLoading] = useState(false);

  // Load data
  const loadActivities = useCallback(async () => {
    try {
      const res = await fetch(`/api/program?project_id=${projectId}`);
      if (!res.ok) return;
      const raw: Activity[] = await res.json();
      // Normalize legacy 0-1 decimal progress
      const hasDecimal = raw.some(a => a.progress > 0 && a.progress < 1);
      setActivities(hasDecimal ? raw.map(a => ({ ...a, progress: Math.round(a.progress * 100) })) : raw);
    } catch {}
  }, [projectId]);

  const loadLinks = useCallback(async () => {
    try {
      const res = await fetch(`/api/program-links?project_id=${projectId}`);
      if (res.ok) {
        const data: ProgramLink[] = await res.json();
        setLinks(data);
        // Rebuild sets from links
        const vr = viewerRef.current;
        const newSets: SelectionSet[] = data.map(l => ({
          id: l.id, name: l.set_name, externalIds: l.external_ids,
          color: l.color, activityId: l.activity_id, dbIds: [],
        }));
        setSets(newSets);
        // Resolve dbIds in background
        if (vr) {
          for (const s of newSets) {
            try { s.dbIds = await vr.resolveExternalIds(s.externalIds); } catch {}
          }
          setSets([...newSets]);
        }
      }
    } catch {}
  }, [projectId, viewerRef]);

  useEffect(() => { loadActivities(); }, [loadActivities]);
  useEffect(() => { if (viewerReady) loadLinks(); }, [viewerReady, loadLinks]);

  // Load saved views from project config
  useEffect(() => {
    (async () => {
      try {
        const sb = createClient();
        const { data } = await (sb.from('projects') as any).select('module_config').eq('id', projectId).single();
        const config = data?.module_config as any;
        const views = config?.bim_linker?.savedViews as SavedColorView[] | undefined;
        if (views) setSavedViews(views);
      } catch {}
    })();
  }, [projectId]);

  // Build tree from viewer
  useEffect(() => {
    if (!viewerReady || !viewerRef.current) return;
    const vr = viewerRef.current;
    const root = vr.getNodeInfo?.(1);
    if (!root) return;
    function buildNode(dbId: number, depth: number): TreeNode {
      const info = vr.getNodeInfo?.(dbId);
      if (depth < 3) {
        const children = (info?.childIds ?? []).slice(0, 50).map(c => buildNode(c, depth + 1));
        const leafCount = children.length === 0 ? 1 : children.reduce((s, c) => s + c.leafCount, 0);
        return { dbId, name: info?.name ?? `#${dbId}`, children, selected: false, leafCount };
      } else {
        const childCount = info?.childIds?.length ?? 0;
        return { dbId, name: info?.name ?? `#${dbId}`, children: [], selected: false, leafCount: Math.max(1, childCount) };
      }
    }
    const rootNode = buildNode(root.dbId, 0);
    setTreeNodes(rootNode.children.length ? rootNode.children : [rootNode]);
    // Get property headers
    const headers = vr.getPropertyHeaders?.() ?? [];
    setPropNames(headers.filter(h => !h.startsWith('__')).slice(0, 30));
  }, [viewerReady, viewerRef]);

  // Listen to viewer selection
  useEffect(() => {
    if (!viewerReady) return;
    const interval = setInterval(() => {
      const vr = viewerRef.current;
      if (!vr) return;
      const sel = vr.getSelectedIds?.() ?? [];
      if (sel.length !== currentSelection.length || sel.some((s, i) => s !== currentSelection[i])) {
        setCurrentSelection(sel);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [viewerReady, viewerRef, currentSelection]);

  // Resolve externalIds for current selection
  const resolveCurrentSelection = useCallback(async () => {
    const vr = viewerRef.current;
    if (!vr || !currentSelection.length) return;
    try {
      const eids = await vr.getExternalIds(currentSelection);
      setCurrentExternalIds(eids);
    } catch (e) { console.warn('Could not resolve external IDs', e); }
  }, [viewerRef, currentSelection]);

  useEffect(() => { resolveCurrentSelection(); }, [resolveCurrentSelection]);

  // Sync deep selection mode with viewer handle
  useEffect(() => {
    if (viewerReady && viewerRef.current) {
      viewerRef.current.setDeepSelection(deepSelection);
    }
  }, [viewerReady, viewerRef, deepSelection]);

  // Property-based selection
  const loadPropValues = useCallback(async (propName: string) => {
    const vr = viewerRef.current;
    if (!vr || !propName) return;
    setSelProp(propName);
    try {
      const index = await vr.buildPropertyIndex(propName);
      const counts: Record<string, number> = {};
      Object.keys(index).forEach(v => { counts[v] = (counts[v] || 0) + 1; });
      setPropValues(Object.entries(counts).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, 100));
    } catch { setPropValues([]); }
  }, [viewerRef]);

  const selectByPropValue = useCallback(async (propName: string, value: string) => {
    const vr = viewerRef.current;
    if (!vr) return;
    try {
      const dbIds = await vr.resolveByProperty(propName, [value]);
      vr.select(dbIds);
      vr.fitToView(dbIds);
    } catch {}
  }, [viewerRef]);

  // Select from tree
  const selectFromTree = useCallback((dbId: number, nodeName: string) => {
    const vr = viewerRef.current;
    if (!vr) return;
    const info = vr.getNodeInfo?.(dbId);
    if (!info) return;
    const allIds: number[] = [];
    function collect(id: number) {
      if (!vr) return;
      const node = vr.getNodeInfo?.(id);
      if (!node) return;
      if (node.childIds.length === 0) allIds.push(id);
      else node.childIds.forEach(collect);
    }
    collect(dbId);
    if (allIds.length) { vr.select(allIds); vr.fitToView(allIds); }
    setSaveViewName(nodeName);
  }, [viewerRef]);

  // Save selection set
  const saveSet = useCallback(async () => {
    if (!newSetName.trim() || !currentSelection.length) return;
    const vr = viewerRef.current;
    if (!vr) return;
    
    const color = COLORS[colorIdx.current % COLORS.length];
    colorIdx.current++;
    
    // Resolve full external IDs
    const extIds = await vr.getExternalIds(currentSelection);
    
    const newSet: SelectionSet = {
      id: `local_${Date.now()}`, name: newSetName.trim(),
      externalIds: extIds, color, dbIds: [...currentSelection],
    };
    setSets(prev => [...prev, newSet]);
    setNewSetName('');
  }, [newSetName, currentExternalIds, currentSelection, viewerRef]);

  // Save current selection to view library
  const saveSelectionToView = useCallback(async () => {
    if (!saveViewName.trim() || !currentExternalIds.length) return;
    setSaveViewLoading(true);
    try {
      const colorNode = { value: saveViewName.trim(), color: saveViewColor, visible: true, guids: currentExternalIds };
      let newViews: SavedColorView[];
      if (saveViewTarget === 'new') {
        const newView: SavedColorView = {
          id: `view_${Date.now()}`,
          name: saveViewName.trim(),
          keyCol: 'GUID', treeCol: '',
          viewMode: 'all',
          colorNodes: [colorNode],
          createdAt: new Date().toISOString(),
        };
        newViews = [...savedViews, newView];
      } else {
        newViews = savedViews.map(v =>
          v.id === saveViewTarget ? { ...v, colorNodes: [...v.colorNodes, colorNode] } : v
        );
      }
      await setBimLinkerKey(projectId, 'savedViews', newViews);
      setSavedViews(newViews);
      setSaveViewName('');
    } catch (e) { console.warn('saveSelectionToView error', e); }
    finally { setSaveViewLoading(false); }
  }, [saveViewName, saveViewColor, saveViewTarget, currentExternalIds, savedViews, projectId]);

  // Link set to activity
  const linkSetToActivity = useCallback(async (setId: string, activityId: string) => {
    const set = sets.find(s => s.id === setId);
    if (!set) return;
    
    // Optimistic update
    setSets(prev => prev.map(s => s.id === setId ? { ...s, activityId } : s));
    setActiveActId(null);
    setActiveSetId(null);
    
    try {
      const res = await fetch('/api/program-links', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, activity_id: activityId, set_name: set.name, external_ids: set.externalIds, color: set.color }),
      });
      if (res.ok) {
        const saved = await res.json();
        setSets(prev => prev.map(s => s.id === setId ? { ...s, id: saved.id, activityId } : s));
        loadLinks();
      } else {
        setSets(prev => prev.map(s => s.id === setId ? { ...s, activityId: undefined } : s));
      }
    } catch {
      setSets(prev => prev.map(s => s.id === setId ? { ...s, activityId: undefined } : s));
    }
  }, [sets, projectId, loadLinks]);

  const unlinkSet = useCallback(async (setId: string) => {
    try {
      await fetch(`/api/program-links?id=${setId}`, { method: 'DELETE' });
      setSets(prev => prev.filter(s => s.id !== setId));
      loadLinks();
    } catch {}
  }, [loadLinks]);

  // Handle explicit linking from View Node
  const linkViewNodeToActivity = useCallback(async (payload: { viewName: string; nodeValue: string; nodeColor: string; guids: string[]; dbIds: number[] }, actId: string) => {
    try {
      const vr = viewerRef.current;
      const newSet: SelectionSet = {
        id: `local_${Date.now()}_${Math.random()}`,
        name: `${payload.viewName} — ${payload.nodeValue}`,
        externalIds: payload.guids,
        color: payload.nodeColor,
        dbIds: payload.dbIds || [],
        activityId: actId, // <--- Optimistic update
      };
      if (vr) {
        if (!newSet.dbIds.length && payload.guids.length) {
          try { 
            if (!vr.isUniversalIndexReady()) await vr.buildUniversalIndex();
            const raw = await vr.resolveByUniversal(payload.guids);
            newSet.dbIds = raw.length ? vr.getLeafDbIds(raw) : raw;
          } catch {}
        }
        
        // Ensure we have true Forge externalIds (GUIDs) to save to the database
        if (newSet.dbIds.length > 0) {
          try {
            const trueGuids = await vr.getExternalIds(newSet.dbIds);
            if (trueGuids.length > 0) newSet.externalIds = trueGuids;
          } catch (e) { console.warn('Could not derive externalIds from dbIds', e); }
        }
        
        // Provide a dummy value if completely empty so the API doesn't throw a 400 error
        if (!newSet.externalIds.length) {
          newSet.externalIds = ['empty-set'];
        }
      }
      setSets(prev => [...prev, newSet]);
      setActiveActId(null);
      setActiveViewNode(null);

      // Now persist the link
      const res = await fetch('/api/program-links', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, activity_id: actId, set_name: newSet.name, external_ids: newSet.externalIds, color: newSet.color }),
      });
      if (res.ok) {
        const saved = await res.json();
        setSets(prev => prev.map(s => s.id === newSet.id ? { ...s, id: saved.id, activityId: actId } : s));
        loadLinks();
      }
    } catch (err) { console.warn('link error', err); }
  }, [viewerRef, projectId, loadLinks]);

  // Highlight set in viewer
  const highlightSet = useCallback((set: SelectionSet) => {
    const vr = viewerRef.current;
    if (!vr) return;
    vr.clearHighlights();
    
    if (set.dbIds.length) {
      vr.setGhosting(true);
      vr.isolateDbIds(set.dbIds);
      const hex = set.color.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      vr.highlight(set.dbIds, { r, g, b, a: 0.85 });
      vr.fitToView(set.dbIds);
    } else {
      vr.showAll();
    }
    setActiveSetId(set.id);
    setActiveViewNode(null);
  }, [viewerRef]);

  // 4D Playback
  const linkedSets = useMemo(() => sets.filter(s => s.activityId), [sets]);
  const play4D = useCallback(() => {
    if (!linkedSets.length) return;
    const vr = viewerRef.current;
    if (!vr) return;
    playRef.current = true; setPlaying(true);
    // Sort by activity start_date
    const sorted = [...linkedSets].sort((a, b) => {
      const actA = activities.find(x => x.id === a.activityId);
      const actB = activities.find(x => x.id === b.activityId);
      return (actA?.start_date ?? '').localeCompare(actB?.start_date ?? '');
    });
    vr.showAll(); vr.clearHighlights();
    let step = 0;
    const timer = setInterval(() => {
      if (!playRef.current || step >= sorted.length) { clearInterval(timer); setPlaying(false); playRef.current = false; vr.showAll(); return; }
      const s = sorted[step];
      const hex = s.color.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      vr.highlight(s.dbIds, { r, g, b, a: 0.85 });
      setPlayDay(step + 1);
      step++;
    }, 1500);
  }, [linkedSets, activities, viewerRef]);

  const stop4D = useCallback(() => { playRef.current = false; setPlaying(false); viewerRef.current?.showAll(); viewerRef.current?.clearHighlights(); }, [viewerRef]);

  // Vistas guardadas logic
  const toggleViewCollapse = (viewId: string) => {
    setExpandedViews(prev => { const n = new Set(prev); n.has(viewId) ? n.delete(viewId) : n.add(viewId); return n; });
  };

  const addColorNodeToSets = async (node: { value: string; color: string; guids?: string[] }, viewName: string) => {
    if (!node.guids || !node.guids.length) return;
    const newSet: SelectionSet = {
      id: `local_${Date.now()}_${Math.random()}`,
      name: `${viewName} - ${node.value}`,
      externalIds: node.guids,
      color: node.color,
      dbIds: []
    };
    const vr = viewerRef.current;
    if (vr) {
       try { newSet.dbIds = await vr.resolveExternalIds(node.guids); } catch {}
    }
    setSets(prev => [...prev, newSet]);
    setActiveSetId(newSet.id);
    if (vr && newSet.dbIds.length) {
      vr.clearHighlights();
      vr.showAll();
      const hex = newSet.color.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      vr.highlight(newSet.dbIds, { r, g, b, a: 0.85 });
      vr.fitToView(newSet.dbIds);
    }
  };

  // Derived
  const disciplines = useMemo(() => [...new Set(activities.map(a => a.discipline).filter(Boolean))] as string[], [activities]);

  const tree = useMemo(() => {
    const byWbs = new Map<string, Activity>();
    const children = new Map<string, Activity[]>();
    const roots: Activity[] = [];

    // Map existing
    for (const a of activities) byWbs.set(a.wbs_code, a);

    function getOrCreateVirtual(pathParts: string[]): Activity | undefined {
      if (!pathParts.length) return undefined;
      const wbs = pathParts.join('.');
      if (byWbs.has(wbs)) return byWbs.get(wbs)!;

      const act: Activity = {
        id: `virtual-${wbs}`, wbs_code: wbs, description: pathParts[pathParts.length - 1],
        is_summary: true, progress: 0, hh: 0, sort_order: -1,
      };
      byWbs.set(wbs, act);
      
      const parentParts = pathParts.slice(0, -1);
      if (parentParts.length > 0) {
        const parent = getOrCreateVirtual(parentParts);
        if (parent) {
          act.parent_wbs = parent.wbs_code;
          if (!children.has(parent.wbs_code)) children.set(parent.wbs_code, []);
          children.get(parent.wbs_code)!.push(act);
        }
      } else { roots.push(act); }
      return act;
    }

    for (const a of activities) {
      let parentWbs = a.parent_wbs;

      // Infer hierarchy from wbs_code
      if (!parentWbs && a.wbs_code && a.wbs_code.includes('.')) {
         const parts = a.wbs_code.split('.');
         const parentParts = parts.slice(0, -1);
         if (parentParts.length > 0) {
           const virtualParent = getOrCreateVirtual(parentParts);
           if (virtualParent) parentWbs = virtualParent.wbs_code;
         }
      }
      // Infer hierarchy from cwp_code
      if (!parentWbs && a.cwp_code && a.cwp_code.includes('.')) {
         const parts = a.cwp_code.split('.');
         if (a.wbs_code !== a.cwp_code) {
           const virtualParent = getOrCreateVirtual(parts);
           if (virtualParent) parentWbs = virtualParent.wbs_code;
         }
      }

      if (parentWbs) {
        if (!byWbs.has(parentWbs)) getOrCreateVirtual(parentWbs.split('.'));
        if (!children.has(parentWbs)) children.set(parentWbs, []);
        if (!children.get(parentWbs)!.includes(a)) children.get(parentWbs)!.push(a);
      } else if (!roots.includes(a)) { roots.push(a); }
    }

    // HH-weighted progress rollup for summary nodes
    function rollUp(wbs: string): { sumHH: number; sumProgHH: number } {
      const node = byWbs.get(wbs);
      if (!node) return { sumHH: 0, sumProgHH: 0 };
      let sumHH = node.is_summary ? 0 : (node.hh || 0);
      let sumProgHH = node.is_summary ? 0 : (node.hh || 0) * (node.progress / 100);
      for (const child of children.get(wbs) ?? []) {
        const r = rollUp(child.wbs_code);
        sumHH += r.sumHH;
        sumProgHH += r.sumProgHH;
      }
      if (node.is_summary || node.id.startsWith('virtual-')) {
        node.hh = sumHH;
        node.progress = sumHH > 0 ? Math.round((sumProgHH / sumHH) * 100) : 0;
      }
      return { sumHH, sumProgHH };
    }
    for (const r of roots) rollUp(r.wbs_code);

    // Sort
    for (const kids of children.values()) {
       kids.sort((a,b) => {
          if (a.is_summary && !b.is_summary) return -1;
          if (!a.is_summary && b.is_summary) return 1;
          return a.sort_order - b.sort_order;
       });
    }
    roots.sort((a,b) => a.sort_order - b.sort_order);

    return { roots, children };
  }, [activities]);

  const visibleRows = useMemo(() => {
    // Si hay búsqueda activa o filtro de disciplina, mostramos lista plana (solo hojas)
    if (actFilter || discFilter !== 'ALL') {
      return activities.filter(a => {
        if (a.is_summary) return false;
        if (discFilter !== 'ALL' && a.discipline !== discFilter) return false;
        if (actFilter && !cleanDescription(a.description).toLowerCase().includes(actFilter.toLowerCase()) && !a.wbs_code.toLowerCase().includes(actFilter.toLowerCase())) return false;
        return true;
      }).map(act => ({ act, depth: 0 }));
    }

    // Si no hay búsqueda, mostramos árbol WBS
    const rows: { act: Activity; depth: number }[] = [];
    function walk(acts: Activity[], depth: number) {
      for (const a of acts) {
        rows.push({ act: a, depth });
        if (!collapsed.has(a.wbs_code)) walk(tree.children.get(a.wbs_code) ?? [], depth + 1);
      }
    }
    walk(tree.roots, 0);
    return rows;
  }, [activities, tree, collapsed, actFilter, discFilter]);

  const toggleCollapse = (wbs: string) => setCollapsed(prev => { const n = new Set(prev); n.has(wbs) ? n.delete(wbs) : n.add(wbs); return n; });

  const getLinkedAct = (actId?: string) => activities.find(a => a.id === actId);

  const { totalHH, linkedHH, unlinkedHH, linkedPercent } = useMemo(() => {
    let t = 0, l = 0;
    for (const act of activities) {
      if (!act.is_summary && !act.is_milestone) {
        const h = act.hh || 0;
        t += h;
        if (sets.some(s => s.activityId === act.id)) l += h;
      }
    }
    const pct = t > 0 ? Math.round((l / t) * 100) : 0;
    return { totalHH: t, linkedHH: l, unlinkedHH: t - l, linkedPercent: pct };
  }, [activities, sets]);

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* ── COL 1: Librería de Vistas (NUEVO) ── */}
      <div className="w-64 shrink-0 border-r border-slate-200 flex flex-col overflow-hidden bg-slate-50/30">
        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
            <Palette size={10} /> Librería de Vistas
          </p>
          <span className="text-[9px] font-bold text-slate-400">{savedViews.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {savedViews.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-center">
              <Palette size={24} className="text-slate-200" />
              <p className="text-[10px] text-slate-400">No hay vistas guardadas. Créalas en Datos AWP.</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {savedViews.map(view => {
                const isExpanded = expandedViews.has(view.id);
                return (
                  <div key={view.id} className="border border-slate-200 rounded bg-white shadow-sm overflow-hidden">
                    <button 
                      onClick={() => toggleViewCollapse(view.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 bg-slate-50 hover:bg-slate-100 transition text-left"
                    >
                      {isExpanded ? <ChevronDown size={10} className="text-slate-400 shrink-0" /> : <ChevronRight size={10} className="text-slate-400 shrink-0" />}
                      <span className="text-[10px] font-black text-slate-700 flex-1 truncate">{view.name}</span>
                      <span className="text-[8px] font-bold text-slate-400 bg-slate-200 px-1 rounded">{view.colorNodes.length}</span>
                    </button>
                    {isExpanded && (
                      <div className="p-1 space-y-0.5 bg-white">
                        {view.colorNodes.filter(n => n.guids && n.guids.length > 0).map((node, i) => {
                          const isActive = activeViewNode?.viewName === view.name && activeViewNode?.nodeValue === node.value;
                          return (
                            <div key={i}
                              onClick={() => { setActiveViewNode({ viewName: view.name, nodeValue: node.value, nodeColor: node.color, guids: node.guids ?? [], dbIds: node.dbIds ?? [] }); setActiveSetId(null); }}
                              className={`flex items-center gap-2 px-2 py-1 rounded group cursor-pointer select-none transition ${isActive ? 'bg-blue-100 border-l-2 border-l-blue-500' : 'hover:bg-blue-50'}`}>
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: node.color }} />
                              <span className="text-[9px] font-semibold text-slate-600 truncate flex-1" title={node.value}>{node.value}</span>
                              <span className="text-[8px] text-slate-400 shrink-0 w-8 text-right">{node.guids?.length || node.dbIds?.length || 0}</span>
                              <div className="flex items-center opacity-0 group-hover:opacity-100 transition gap-0.5">
                                <button
                                onClick={async e => {
                                  e.stopPropagation();
                                  const vr = viewerRef.current;
                                  if (vr) {
                                    vr.clearHighlights();
                                    try {
                                      let dbIds = node.dbIds ?? [];
                                      if (!dbIds.length && node.guids?.length) {
                                        if (!vr.isUniversalIndexReady()) await vr.buildUniversalIndex();
                                        const raw = await vr.resolveByUniversal(node.guids);
                                        dbIds = raw.length ? vr.getLeafDbIds(raw) : raw;
                                      }
                                      
                                      if (dbIds.length) {
                                        vr.setGhosting(true);
                                        vr.isolateDbIds(dbIds);
                                        const hex = node.color.replace('#', '');
                                        const r = parseInt(hex.slice(0, 2), 16) / 255;
                                        const g = parseInt(hex.slice(2, 4), 16) / 255;
                                        const b = parseInt(hex.slice(4, 6), 16) / 255;
                                        vr.highlight(dbIds, { r, g, b, a: 0.85 });
                                        vr.fitToView(dbIds);
                                      } else {
                                        vr.showAll();
                                      }
                                    } catch {}
                                  }
                                }}
                                className="p-1 hover:bg-blue-100 rounded text-blue-500"
                                title="Ver en modelo"
                              >
                                <Search size={10} />
                              </button>
                            </div>
                          </div>
                        );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── COL 2: Selection Tools ── */}
      <div className="w-64 shrink-0 border-r border-slate-200 flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
            <MousePointer2 size={10} /> Herramientas de Selección
          </p>
        </div>
        
        {/* Deep Selection Toggle */}
        <div className="px-3 py-2 border-b border-slate-100 bg-indigo-50/20">
          <button 
            onClick={() => setDeepSelection(!deepSelection)}
            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg transition-all border ${deepSelection ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
          >
            <div className="flex items-center gap-2">
              <BoxSelect size={12} className={deepSelection ? 'text-indigo-500' : 'text-slate-400'} />
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold">Selección Profunda</span>
                <span className="text-[8px] opacity-70">Incluye pernos/ocultos</span>
              </div>
            </div>
            <div className={`w-7 h-4 rounded-full relative transition-colors ${deepSelection ? 'bg-indigo-500' : 'bg-slate-300'}`}>
              <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${deepSelection ? 'translate-x-3' : 'translate-x-0'}`} />
            </div>
          </button>
        </div>
        {/* Current selection info */}
        <div className="px-3 py-2 border-b border-slate-100 bg-blue-50/50">
          <div className="flex items-center gap-2 mb-1">
            <MousePointer2 size={12} className="text-blue-500" />
            <span className="text-[10px] font-black text-blue-700">{currentSelection.length} elementos</span>
            {currentSelection.length > 0 && (
              <button onClick={() => { viewerRef.current?.select([]); setCurrentSelection([]); }} className="ml-auto text-[8px] font-bold text-red-400 hover:text-red-600">Limpiar</button>
            )}
          </div>
          {currentSelection.length > 0 && (
            <div className="flex gap-1">
              <button onClick={() => viewerRef.current?.isolate(currentSelection)} className="flex-1 text-[8px] font-bold text-center py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition">Aislar</button>
              <button onClick={() => viewerRef.current?.hide(currentSelection)} className="flex-1 text-[8px] font-bold text-center py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition">Ocultar</button>
              <button onClick={() => { viewerRef.current?.showAll(); viewerRef.current?.clearHighlights(); }} className="flex-1 text-[8px] font-bold text-center py-1 bg-emerald-100 text-emerald-600 rounded hover:bg-emerald-200 transition">Mostrar</button>
            </div>
          )}
        </div>
        {/* Save as set */}
        {currentSelection.length > 0 && (
          <div className="px-3 py-2 border-b border-slate-100 bg-amber-50/50">
            <p className="text-[9px] font-black text-amber-600 uppercase mb-1">Guardar Conjunto</p>
            <div className="flex gap-1">
              <input value={newSetName} onChange={e => setNewSetName(e.target.value)} placeholder="Nombre del conjunto..."
                className="flex-1 text-[10px] px-2 py-1 border border-amber-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-300"
                onKeyDown={e => e.key === 'Enter' && saveSet()} />
              <button onClick={saveSet} disabled={!newSetName.trim()} className="px-2 py-1 bg-amber-500 text-white text-[9px] font-black rounded hover:bg-amber-600 transition disabled:opacity-30">
                <Save size={10} />
              </button>
            </div>
          </div>
        )}
        {/* Save to view library */}
        {currentSelection.length > 0 && (
          <div className="px-3 py-2 border-b border-slate-100 bg-violet-50/60">
            <p className="text-[9px] font-black text-violet-600 uppercase mb-1.5 flex items-center gap-1">
              <Library size={9} /> Guardar en Librería de Vistas
            </p>
            <input
              value={saveViewName}
              onChange={e => setSaveViewName(e.target.value)}
              placeholder="Nombre del grupo…"
              className="w-full text-[10px] px-2 py-1 border border-violet-200 rounded focus:outline-none focus:ring-1 focus:ring-violet-300 mb-1.5"
            />
            <div className="flex gap-1 mb-1.5 flex-wrap">
              {COLORS.map(c => (
                <button key={c} onClick={() => setSaveViewColor(c)}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${saveViewColor === c ? 'border-slate-600 scale-125' : 'border-transparent hover:border-slate-400'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <select
              value={saveViewTarget}
              onChange={e => setSaveViewTarget(e.target.value)}
              className="w-full text-[10px] px-2 py-1 border border-violet-200 rounded focus:outline-none mb-1.5 bg-white"
            >
              <option value="new">+ Nueva vista</option>
              {savedViews.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <button
              onClick={saveSelectionToView}
              disabled={!saveViewName.trim() || saveViewLoading}
              className="w-full py-1 bg-violet-500 text-white text-[9px] font-black rounded hover:bg-violet-600 transition disabled:opacity-30 flex items-center justify-center gap-1"
            >
              {saveViewLoading
                ? <Loader2 size={10} className="animate-spin" />
                : <Library size={9} />}
              {saveViewTarget === 'new' ? 'Crear vista' : 'Agregar a vista'}
              {!saveViewLoading && <span className="ml-1 font-normal opacity-70">({currentExternalIds.length} elem.)</span>}
            </button>
          </div>
        )}

        {/* Property selector */}
        <div className="px-3 py-2 border-b border-slate-100 flex-shrink-0">
          <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Seleccionar por Propiedad</p>
          <select value={selProp} onChange={e => loadPropValues(e.target.value)}
            className="w-full text-[10px] px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300 mb-1">
            <option value="">Elegir propiedad...</option>
            {propNames.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {propValues.length > 0 && (
            <div className="max-h-28 overflow-y-auto space-y-0.5">
              {propValues.map(v => (
                <button key={v.value} onClick={() => selectByPropValue(selProp, v.value)}
                  className="w-full text-left flex items-center gap-1 px-2 py-0.5 rounded hover:bg-blue-50 transition">
                  <span className="text-[9px] text-slate-600 truncate flex-1">{v.value}</span>
                  <span className="text-[8px] text-slate-400 shrink-0">{v.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Model tree */}
        <div className="flex-1 overflow-y-auto px-1 py-1">
          <p className="text-[9px] font-black text-slate-400 uppercase px-2 mb-1">Árbol del Modelo</p>
          {treeNodes.map(n => <MiniTree key={n.dbId} node={n} depth={0} onSelect={selectFromTree} />)}

        </div>
      </div>

      {/* ── COL 3: Selection Sets ── */}
      <div className="w-72 shrink-0 border-r border-slate-200 flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
            <BoxSelect size={10} /> Conjuntos de Selección
          </p>
          <span className="text-[9px] font-bold text-slate-400">{sets.length}</span>
        </div>

        {/* 4D Controls */}
        {linkedSets.length > 0 && (
          <div className="px-3 py-2 border-b border-slate-100 bg-indigo-50/50 flex items-center gap-2">
            {!playing ? (
              <button onClick={play4D} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-500 text-white text-[9px] font-black rounded-lg hover:bg-indigo-600 transition">
                <Play size={10} /> Reproducir 4D
              </button>
            ) : (
              <button onClick={stop4D} className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white text-[9px] font-black rounded-lg hover:bg-red-600 transition">
                <Square size={10} /> Detener
              </button>
            )}
            {playing && <span className="text-[9px] font-bold text-indigo-600">Paso {playDay}/{linkedSets.length}</span>}
            <span className="ml-auto text-[9px] text-indigo-400 font-bold">{linkedSets.length} vinculados</span>
          </div>
        )}
        {/* Sets list */}
        <div className="flex-1 overflow-y-auto">
          {sets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-center">
              <BoxSelect size={24} className="text-slate-200" />
              <p className="text-[10px] text-slate-400">Selecciona elementos del modelo y guárdalos como conjunto</p>
            </div>
          ) : sets.map(set => {
            const linkedAct = getLinkedAct(set.activityId);
            return (
              <div key={set.id}
                className={`px-3 py-2 border-b border-slate-100 hover:bg-slate-50 transition cursor-pointer select-none ${activeSetId === set.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
                onClick={() => highlightSet(set)}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: set.color }} />
                  <span className="text-[10px] font-black text-slate-700 flex-1 truncate">{set.name}</span>
                  <span className="text-[8px] text-slate-400">{set.externalIds.length} elem</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={e => { e.stopPropagation(); highlightSet(set); }} className="text-slate-300 hover:text-blue-500 transition" title="Zoom">
                      <Search size={10} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); unlinkSet(set.id); }} className="text-slate-300 hover:text-red-500 transition" title="Eliminar">
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
                {linkedAct ? (
                  <div className="mt-1 flex items-center gap-1">
                    <Link2 size={8} className="text-emerald-500" />
                    <span className="text-[9px] text-emerald-600 font-bold truncate">{cleanDescription(linkedAct.description)}</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── COL 4: Program Activities — Gantt-style ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white relative">
        
        {/* KPI Banner */}
        <div className="shrink-0 px-4 py-2 border-b border-slate-200 bg-slate-800 text-white flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total HH Programa</p>
              <p className="text-[14px] font-black leading-none mt-1">{totalHH.toLocaleString('es-CL')}</p>
            </div>
            <div className="h-6 w-px bg-slate-600"></div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">HH Enlazadas</p>
              <p className="text-[14px] font-black leading-none mt-1 text-emerald-400">{linkedHH.toLocaleString('es-CL')} <span className="text-[10px] opacity-70">({linkedPercent}%)</span></p>
            </div>
            <div className="h-6 w-px bg-slate-600"></div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-400">HH Por Enlazar</p>
              <p className="text-[14px] font-black leading-none mt-1 text-rose-400">{unlinkedHH.toLocaleString('es-CL')}</p>
            </div>
          </div>
          
          <div className="flex-1 max-w-[200px] ml-4">
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden flex">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${linkedPercent}%` }} />
              <div className="h-full bg-rose-500 transition-all" style={{ width: `${100 - linkedPercent}%` }} />
            </div>
          </div>
        </div>

        {/* Floating Action Bar for Linking */}
        {(activeSetId || activeViewNode) && activeActId && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-4 z-50 pointer-events-auto border border-blue-400/50">
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-widest font-black text-blue-200">Enlazar</span>
              <span className="text-[11px] font-bold max-w-[150px] truncate">
                {activeSetId ? sets.find(s => s.id === activeSetId)?.name : activeViewNode?.nodeValue}
              </span>
            </div>
            <div className="text-blue-300">→</div>
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-widest font-black text-blue-200">A Actividad</span>
              <span className="text-[11px] font-bold max-w-[150px] truncate">
                {cleanDescription(activities.find(a => a.id === activeActId)?.description || '')}
              </span>
            </div>
            <button
              onClick={() => {
                if (activeSetId && activeActId) linkSetToActivity(activeSetId, activeActId);
                else if (activeViewNode && activeActId) linkViewNodeToActivity(activeViewNode, activeActId);
              }}
              className="ml-2 px-4 py-1.5 bg-white text-blue-600 font-black text-[10px] uppercase tracking-widest rounded-xl hover:scale-105 hover:bg-blue-50 transition shadow-lg flex items-center gap-1"
            >
              <Link2 size={12} /> Confirmar
            </button>
          </div>
        )}

        {/* Header */}
        <div className="shrink-0 px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <div className="flex-1">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
              <CalendarDays size={10} /> Listado de Actividades
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="shrink-0 px-3 py-2 border-b border-slate-100">
          <div className="relative">
            <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
            <input value={actFilter} onChange={e => setActFilter(e.target.value)} placeholder="Buscar WBS / descripción…"
              className="w-full text-[10px] pl-7 pr-2 py-1.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 bg-slate-50" />
          </div>
        </div>

        {/* Discipline pills */}
        {disciplines.length > 0 && (
          <div className="shrink-0 px-3 py-2 border-b border-slate-100 flex flex-wrap gap-1 items-center">
            <Filter size={9} className="text-slate-300 shrink-0" />
            <button
              onClick={() => setDiscFilter('ALL')}
              className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wide border transition-colors ${discFilter === 'ALL' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            >
              Todas
            </button>
            {disciplines.map(d => {
              const dc = getDiscColor(d);
              const isActive = discFilter === d;
              return (
                <button key={d}
                  onClick={() => setDiscFilter(isActive ? 'ALL' : d)}
                  className="px-2 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-wide transition-colors"
                  style={{
                    backgroundColor: isActive ? dc.bar : dc.bg,
                    borderColor: isActive ? dc.bar : dc.bar + '40',
                    color: isActive ? '#fff' : dc.text,
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        )}

        {/* Column headers */}
        <div className="shrink-0 flex items-center border-b border-slate-200 bg-slate-50 text-[8px] font-black uppercase tracking-widest text-slate-400">
          <div className="w-8 shrink-0" />
          <div className="flex-1 px-2 py-1.5">WBS / Descripción</div>
          <div className="w-12 shrink-0 px-1 py-1.5 text-right">HH</div>
          <div className="w-20 shrink-0 px-2 py-1.5">Avance</div>
          <div className="w-16 shrink-0 px-2 py-1.5">Fechas</div>
          <div className="w-16 shrink-0 px-2 py-1.5 text-center">Vínculo</div>
        </div>

        {/* Activity rows */}
        <div className="flex-1 overflow-y-auto">
          {visibleRows.map(({ act, depth }) => {
            const linked = sets.find(s => s.activityId === act.id);
            const hasChildren = !!tree.children.get(act.wbs_code)?.length;
            const isCollapsed = collapsed.has(act.wbs_code);
            const canLink = !act.is_summary;
            const dc = getDiscColor(act.discipline);
            const is100 = act.progress === 100 && !act.is_summary;
            const isCrit = act.is_critical;
            const isSelected = activeActId === act.id;

            return (
              <div key={act.id}
                className={`flex items-center border-b transition-colors group
                  ${act.is_summary ? 'bg-slate-50 border-slate-200/80' : is100 ? 'bg-white border-slate-100' : 'bg-white border-slate-100 hover:bg-blue-50/20'}
                  ${canLink ? 'cursor-pointer hover:bg-blue-50' : ''}
                  ${linked ? 'bg-emerald-50/20' : ''}
                  ${isSelected ? '!bg-blue-100 border-l-4 !border-l-blue-500 shadow-inner' : ''}
                  ${isCrit && !act.is_summary ? 'bg-red-50/30' : ''}`}
                style={{ paddingLeft: 8 + depth * 14, minHeight: act.is_summary ? 36 : 30 }}
                onClick={() => {
                  if (canLink) setActiveActId(isSelected ? null : act.id);
                }}
              >
                {/* Collapse toggle */}
                <div className="w-8 shrink-0 flex items-center justify-center">
                  <button
                    onClick={e => { e.stopPropagation(); toggleCollapse(act.wbs_code); }}
                    className={`w-4 h-4 flex items-center justify-center ${!hasChildren ? 'opacity-0 pointer-events-none' : 'text-slate-300 hover:text-slate-700'}`}
                  >
                    {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                  </button>
                </div>

                {/* WBS + description */}
                <div className="flex-1 min-w-0 flex items-center gap-1.5 pr-1">
                  {/* Disc color dot */}
                  {!act.is_summary && !act.is_milestone && (
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: is100 ? '#10B981' : dc.bar }} />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className={`text-[9px] font-mono leading-none ${act.is_summary ? 'font-black text-slate-700' : is100 ? 'text-emerald-500' : isCrit ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                        {act.wbs_code}
                      </span>
                      {isCrit && !act.is_summary && (
                        <span className="text-[6px] font-black text-white bg-red-500 rounded px-0.5 leading-tight">RC</span>
                      )}
                    </div>
                    <p className={`text-[10px] truncate leading-tight mt-0.5 ${act.is_summary ? 'font-black text-slate-800' : is100 ? 'font-medium text-emerald-600' : 'font-medium text-slate-700'}`}
                      title={act.description}>
                      {cleanDescription(act.description) || act.cwp_code || '—'}
                    </p>
                    {act.discipline && !act.is_summary && (
                      <span className="text-[7px] font-black leading-none" style={{ color: dc.text }}>{act.discipline}</span>
                    )}
                  </div>
                </div>

                {/* HH */}
                <div className="w-12 shrink-0 px-1 text-right">
                  <span className={`text-[9px] font-black tabular-nums ${is100 ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {act.hh ? (act.hh >= 1000 ? `${Math.round(act.hh / 1000)}K` : Math.round(act.hh).toLocaleString('es-CL')) : '—'}
                  </span>
                </div>

                {/* Progress bar + % */}
                <div className="w-20 shrink-0 px-2 flex flex-col justify-center gap-0.5">
                  <div className="w-full h-1.5 rounded-full overflow-hidden bg-slate-100">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${act.progress}%`, backgroundColor: is100 ? '#10B981' : isCrit ? '#DC2626' : dc.bar }} />
                  </div>
                  <span className={`text-[8px] font-black tabular-nums ${is100 ? 'text-emerald-500' : isCrit ? 'text-red-500' : 'text-slate-400'}`}>
                    {act.progress}%
                  </span>
                </div>

                {/* Date range */}
                <div className="w-16 shrink-0 px-1 hidden xl:flex flex-col justify-center">
                  <span className="text-[7px] text-slate-400 leading-tight tabular-nums">{act.start_date?.substring(0,7) ?? '—'}</span>
                  <span className="text-[7px] text-slate-400 leading-tight tabular-nums">{act.end_date?.substring(0,7) ?? '—'}</span>
                </div>

                {/* Link status */}
                <div className="w-16 shrink-0 px-2 flex items-center justify-center">
                  {linked ? (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: linked.color }} />
                      <span className="text-[7px] font-black text-emerald-600 leading-tight">{linked.name.length > 8 ? linked.name.substring(0,7)+'…' : linked.name}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {visibleRows.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 py-12 text-center">
              <CalendarDays size={28} className="text-slate-200" />
              <p className="text-[10px] text-slate-400 font-bold">
                {actFilter || discFilter !== 'ALL' ? 'Sin resultados' : 'Sin actividades cargadas'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
