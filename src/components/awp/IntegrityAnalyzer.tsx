'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck, ShieldAlert, ShieldX, RefreshCw,
  ArrowRight, ArrowLeft, ChevronDown, ChevronRight,
  Link2, AlertTriangle, CheckCircle2, XCircle, Loader2,
  Edit2, Save, X, Search, Wand2, Eye
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Node, Edge } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IntegrityResult {
  edge: Edge;
  sourceNode: Node | null;
  targetNode: Node | null;
  sourceRows: any[];
  targetRows: any[];
  totalSource: number;
  matchedInTarget: number;
  unmatchedSource: string[];
  totalTarget: number;
  matchedInSource: number;
  unmatchedTarget: string[];
  rateAtoB: number;
  rateBtoA: number;
}

interface IntegrityAnalyzerProps {
  nodes: Node[];
  edges: Edge[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function healthColor(rate: number) {
  if (rate >= 90) return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', bar: 'bg-emerald-500' };
  if (rate >= 70) return { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   bar: 'bg-amber-400'   };
  return               { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    bar: 'bg-rose-500'    };
}

function HealthIcon({ rate }: { rate: number }) {
  if (rate >= 90) return <ShieldCheck size={15} className="text-emerald-500" />;
  if (rate >= 70) return <ShieldAlert size={15} className="text-amber-500" />;
  return <ShieldX size={15} className="text-rose-500" />;
}

// Fuzzy: qué tan parecidos son dos strings (0-1)
function similarity(a: string, b: string): number {
  a = a.toLowerCase(); b = b.toLowerCase();
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  let matches = 0;
  for (const ch of a) if (b.includes(ch)) matches++;
  return (2 * matches) / (a.length + b.length);
}

// ─── Reconciliation Panel ─────────────────────────────────────────────────────
// Muestra las filas de UN lado que no tienen match en el otro,
// con todas sus columnas + sugerencias + edición inline.

interface ReconciliationPanelProps {
  result: IntegrityResult;
  direction: 'AtoB' | 'BtoA';
  onSaved: () => void;
}

function ReconciliationPanel({ result, direction, onSaved }: ReconciliationPanelProps) {
  const isAtoB = direction === 'AtoB';

  // Rows y columna de cruce según dirección
  const sourceRows  = isAtoB ? result.sourceRows : result.targetRows;
  const matchCol    = isAtoB ? result.edge.source_column : result.edge.target_column;
  const targetVals  = isAtoB
    ? new Set(result.targetRows.map((r: any) => String(r[result.edge.target_column] ?? '').trim()))
    : new Set(result.sourceRows.map((r: any) => String(r[result.edge.source_column] ?? '').trim()));
  const nodeId      = isAtoB ? result.edge.source_node_id : result.edge.target_node_id;
  const nodeName    = isAtoB ? result.sourceNode?.name : result.targetNode?.name;
  const unmatchedVals = isAtoB ? result.unmatchedSource : result.unmatchedTarget;

  // Solo filas huérfanas
  const orphanRows = useMemo(() =>
    sourceRows.filter((r: any) => {
      const v = String(r[matchCol] ?? '').trim();
      return unmatchedVals.includes(v);
    }),
    [sourceRows, matchCol, unmatchedVals]
  );

  // Suggestions for each orphan
  const suggestions = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const val of unmatchedVals) {
      const ranked = [...targetVals]
        .map(t => ({ t, s: similarity(val, t) }))
        .filter(x => x.s > 0.3)
        .sort((a, b) => b.s - a.s)
        .slice(0, 5)
        .map(x => x.t);
      map.set(val, ranked);
    }
    return map;
  }, [unmatchedVals, targetVals]);

  // Edit state: rowIdx → new value
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'compact' | 'full'>('compact');

  // All columns of this node
  const allCols = useMemo(() =>
    orphanRows.length ? Object.keys(orphanRows[0]).filter(c => c !== matchCol) : [],
    [orphanRows, matchCol]
  );

  const filtered = useMemo(() => {
    if (!search) return orphanRows;
    const q = search.toLowerCase();
    return orphanRows.filter((r: any) =>
      Object.values(r).some(v => String(v).toLowerCase().includes(q))
    );
  }, [orphanRows, search]);

  const handleEdit = (rowIdx: number, val: string) => {
    setEdits(p => ({ ...p, [rowIdx]: val }));
  };

  const handleSaveAll = async () => {
    if (!Object.keys(edits).length) return;
    setSaving(true);

    // Fetch full node data
    const { data: nodeData } = await (supabase as any)
      .from('nodes')
      .select('data')
      .eq('id', nodeId)
      .single();

    if (!nodeData?.data) { setSaving(false); return; }

    // Apply edits: find matching rows by all other columns and update matchCol
    const updated = [...nodeData.data];
    const editEntries = Object.entries(edits);

    for (const [idxStr, newVal] of editEntries) {
      const orphanRow = filtered[Number(idxStr)];
      const globalIdx = updated.findIndex((r: any) =>
        Object.entries(orphanRow).every(([k, v]) => String(r[k]) === String(v))
      );
      if (globalIdx >= 0) updated[globalIdx][matchCol] = newVal;
    }

    await (supabase as any)
      .from('nodes')
      .update({ data: updated })
      .eq('id', nodeId);

    setSaving(false);
    setEdits({});
    setEditingIdx(null);
    onSaved();
  };

  if (!orphanRows.length) {
    return (
      <div className="flex items-center gap-2 py-4 text-emerald-600 text-[11px] font-bold">
        <CheckCircle2 size={14} /> Sin registros huérfanos en esta dirección
      </div>
    );
  }

  const dirLabel = isAtoB ? `${nodeName} → sin match` : `${nodeName} → sin match`;

  return (
    <div className="space-y-3">
      {/* Sub-toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar en filas..."
            className="pl-7 pr-3 py-1.5 text-[10px] font-bold bg-slate-50 border border-slate-200 rounded-xl outline-none w-48 focus:ring-1 focus:ring-blue-100"
          />
        </div>

        <button
          onClick={() => setViewMode(v => v === 'compact' ? 'full' : 'compact')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-wide text-slate-500 hover:bg-slate-50"
        >
          <Eye size={11} />
          {viewMode === 'compact' ? 'Ver todas las columnas' : 'Vista compacta'}
        </button>

        {Object.keys(edits).length > 0 && (
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wide hover:bg-emerald-700 transition-colors"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            Guardar {Object.keys(edits).length} cambio{Object.keys(edits).length > 1 ? 's' : ''}
          </button>
        )}

        <span className="text-[10px] font-black text-rose-500 ml-auto">
          {filtered.length} filas sin match · columna clave: <span className="font-mono bg-rose-50 px-1.5 rounded">{matchCol}</span>
        </span>
      </div>

      {/* Table */}
      <div className="border border-slate-100 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-[10px] border-collapse">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr>
                <th className="px-3 py-2 text-left font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 border-r border-slate-100 whitespace-nowrap bg-rose-50 text-rose-600">
                  {matchCol} (clave)
                </th>
                <th className="px-3 py-2 text-left font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 border-r border-slate-100 bg-blue-50 text-blue-600">
                  Sugerencia
                </th>
                {viewMode === 'full' && allCols.slice(0, 8).map(c => (
                  <th key={c} className="px-3 py-2 text-left font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 border-r border-slate-100 whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row: any, i) => {
                const rawVal = String(row[matchCol] ?? '').trim();
                const editVal = edits[i];
                const isEditing = editingIdx === i;
                const sugg = suggestions.get(rawVal) ?? [];
                const hasEdit = editVal !== undefined;

                return (
                  <tr key={i} className={`border-b border-slate-50 hover:bg-blue-50/30 transition-colors ${hasEdit ? 'bg-amber-50/40' : ''}`}>
                    {/* Key column — editable */}
                    <td className="px-2 py-2 border-r border-slate-50 bg-rose-50/30">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={editVal ?? rawVal}
                            onChange={e => handleEdit(i, e.target.value)}
                            className="flex-1 px-2 py-1 text-[10px] font-mono bg-white border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 w-32"
                          />
                          <button onClick={() => setEditingIdx(null)} className="text-slate-400 hover:text-slate-600">
                            <X size={11} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingIdx(i); if (!edits[i]) setEdits(p => ({ ...p, [i]: rawVal })); }}
                          className="flex items-center gap-1.5 group w-full text-left"
                        >
                          <span className={`font-mono font-bold ${hasEdit ? 'line-through text-rose-400' : 'text-rose-700'}`}>
                            {rawVal || <span className="italic text-slate-300">vacío</span>}
                          </span>
                          {hasEdit && (
                            <span className="font-mono font-bold text-emerald-600">→ {editVal}</span>
                          )}
                          <Edit2 size={10} className="text-slate-300 group-hover:text-blue-500 transition-colors ml-auto shrink-0" />
                        </button>
                      )}
                    </td>

                    {/* Suggestions */}
                    <td className="px-2 py-2 border-r border-slate-50">
                      <div className="flex flex-wrap gap-1">
                        {sugg.length > 0 ? sugg.map((s, si) => (
                          <button
                            key={si}
                            onClick={() => handleEdit(i, s)}
                            className={`px-2 py-0.5 rounded-lg border text-[9px] font-bold transition-colors ${
                              edits[i] === s
                                ? 'bg-emerald-500 text-white border-emerald-600'
                                : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                            }`}
                            title="Click para usar esta sugerencia"
                          >
                            <Wand2 size={8} className="inline mr-0.5" />
                            {s}
                          </button>
                        )) : (
                          <span className="text-[9px] text-slate-300 italic">sin sugerencias</span>
                        )}
                      </div>
                    </td>

                    {/* Other columns */}
                    {viewMode === 'full' && allCols.slice(0, 8).map(c => (
                      <td key={c} className="px-3 py-2 border-r border-slate-50 text-slate-500 font-medium whitespace-nowrap max-w-[140px] truncate">
                        {String(row[c] ?? '—')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Connection Card ──────────────────────────────────────────────────────────

function ConnectionCard({ result, nodeMap, onRefresh }: {
  result: IntegrityResult;
  nodeMap: Map<string, Node>;
  onRefresh: () => void;
}) {
  const [open, setOpen]   = useState(false);
  const [tab, setTab]     = useState<'AtoB' | 'BtoA'>('AtoB');

  const overallRate = (result.rateAtoB + result.rateBtoA) / 2;
  const colors = healthColor(overallRate);
  const sName = result.sourceNode?.name ?? result.edge.source_node_id;
  const tName = result.targetNode?.name ?? result.edge.target_node_id;

  return (
    <div className={`rounded-3xl border ${colors.border} bg-white shadow-sm overflow-hidden`}>
      {/* Summary row */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-6 py-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors text-left"
      >
        <HealthIcon rate={overallRate} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{sName}</span>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 rounded-lg px-2 py-0.5">{result.edge.source_column}</span>
            <Link2 size={11} className="text-slate-300" />
            <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{tName}</span>
            <span className="text-[10px] font-bold text-purple-600 bg-purple-50 rounded-lg px-2 py-0.5">{result.edge.target_column}</span>
          </div>
        </div>

        <div className="flex items-center gap-6 shrink-0">
          <div className="text-center">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">A→B</p>
            <p className={`text-sm font-black ${healthColor(result.rateAtoB).text}`}>{result.rateAtoB.toFixed(0)}%</p>
            <p className="text-[9px] text-rose-500 font-bold">{result.unmatchedSource.length} sin match</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">B→A</p>
            <p className={`text-sm font-black ${healthColor(result.rateBtoA).text}`}>{result.rateBtoA.toFixed(0)}%</p>
            <p className="text-[9px] text-rose-500 font-bold">{result.unmatchedTarget.length} sin match</p>
          </div>
          <div className={`w-14 h-14 rounded-2xl ${colors.bg} flex flex-col items-center justify-center shrink-0`}>
            <p className={`text-lg font-black leading-none ${colors.text}`}>{overallRate.toFixed(0)}</p>
            <p className={`text-[8px] font-black ${colors.text} opacity-60`}>%</p>
          </div>
          {open ? <ChevronDown size={16} className="text-slate-300" /> : <ChevronRight size={16} className="text-slate-300" />}
        </div>
      </button>

      {/* Detail */}
      {open && (
        <div className="px-6 pb-6 border-t border-slate-50">
          {/* Progress bars */}
          <div className="grid grid-cols-2 gap-4 pt-4 pb-4">
            {[
              { label: 'A→B', rate: result.rateAtoB, name: sName, col: result.edge.source_column, unmatched: result.unmatchedSource.length, total: result.totalSource },
              { label: 'B→A', rate: result.rateBtoA, name: tName, col: result.edge.target_column, unmatched: result.unmatchedTarget.length, total: result.totalTarget },
            ].map(d => (
              <div key={d.label} className={`rounded-2xl border p-4 ${healthColor(d.rate).bg} ${healthColor(d.rate).border}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{d.label} · {d.name} · <span className="font-mono">{d.col}</span></span>
                  <span className={`text-sm font-black ${healthColor(d.rate).text}`}>{d.rate.toFixed(0)}%</span>
                </div>
                <div className="w-full h-2 bg-white/60 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${healthColor(d.rate).bar}`} style={{ width: `${d.rate}%`, transition: 'width 0.7s' }} />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[9px] font-bold text-slate-500">
                  <span><span className="text-emerald-600 font-black">{d.total - d.unmatched}</span> coinciden de {d.total}</span>
                  <span className="text-rose-500 font-black">{d.unmatched} sin match</span>
                </div>
              </div>
            ))}
          </div>

          {/* Tab selector */}
          <div className="flex items-center gap-2 mb-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-2">Reconciliar:</p>
            {[
              { id: 'AtoB', label: `${sName} sin match en ${tName}`, count: result.unmatchedSource.length },
              { id: 'BtoA', label: `${tName} sin match en ${sName}`, count: result.unmatchedTarget.length },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all ${
                  tab === t.id
                    ? 'bg-[#0C1E4F] text-white border-[#0C1E4F]'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}
              >
                <XCircle size={11} className={tab === t.id ? 'text-rose-300' : 'text-rose-400'} />
                {t.count} filas · {t.id}
              </button>
            ))}
          </div>

          {/* Reconciliation panel */}
          <ReconciliationPanel
            key={tab}
            result={result}
            direction={tab}
            onSaved={onRefresh}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function IntegrityAnalyzer({ nodes, edges }: IntegrityAnalyzerProps) {
  const [results, setResults]   = useState<IntegrityResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRun, setLastRun]   = useState<Date | null>(null);

  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  const runAnalysis = useCallback(async () => {
    if (edges.length === 0) return;
    setIsLoading(true);

    const neededIds = Array.from(new Set(edges.flatMap(e => [e.source_node_id, e.target_node_id])));
    const nodeDataMap = new Map<string, any[]>();

    await Promise.all(neededIds.map(async (nodeId) => {
      const { data } = await (supabase.from('nodes') as any)
        .select('id, data').eq('id', nodeId).single();
      if (data?.data) nodeDataMap.set(nodeId, data.data);
    }));

    const newResults: IntegrityResult[] = edges.map(edge => {
      const sourceRows = nodeDataMap.get(edge.source_node_id) ?? [];
      const targetRows = nodeDataMap.get(edge.target_node_id) ?? [];
      const sCol = edge.source_column;
      const tCol = edge.target_column;

      const sourceVals = new Set(sourceRows.map((r: any) => String(r[sCol] ?? '').trim()).filter(Boolean));
      const targetVals = new Set(targetRows.map((r: any) => String(r[tCol] ?? '').trim()).filter(Boolean));

      const matchedInTarget  = [...sourceVals].filter(v => targetVals.has(v));
      const unmatchedSource  = [...sourceVals].filter(v => !targetVals.has(v));
      const matchedInSource  = [...targetVals].filter(v => sourceVals.has(v));
      const unmatchedTarget  = [...targetVals].filter(v => !sourceVals.has(v));

      return {
        edge,
        sourceNode: nodeMap.get(edge.source_node_id) ?? null,
        targetNode: nodeMap.get(edge.target_node_id) ?? null,
        sourceRows,
        targetRows,
        totalSource: sourceVals.size,
        matchedInTarget: matchedInTarget.length,
        unmatchedSource,
        totalTarget: targetVals.size,
        matchedInSource: matchedInSource.length,
        unmatchedTarget,
        rateAtoB: sourceVals.size === 0 ? 0 : (matchedInTarget.length / sourceVals.size) * 100,
        rateBtoA: targetVals.size === 0 ? 0 : (matchedInSource.length / targetVals.size) * 100,
      };
    });

    setResults(newResults);
    setLastRun(new Date());
    setIsLoading(false);
  }, [edges, nodeMap]);

  useEffect(() => {
    if (edges.length > 0 && nodes.length > 0) runAnalysis();
  }, [edges.length, nodes.length]);

  const summary = useMemo(() => {
    if (!results.length) return null;
    return {
      healthy:  results.filter(r => Math.min(r.rateAtoB, r.rateBtoA) >= 90).length,
      warning:  results.filter(r => { const m = Math.min(r.rateAtoB, r.rateBtoA); return m >= 70 && m < 90; }).length,
      critical: results.filter(r => Math.min(r.rateAtoB, r.rateBtoA) < 70).length,
      total: results.length,
    };
  }, [results]);

  if (edges.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-4 p-12">
        <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-300">
          <Link2 size={32} />
        </div>
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Sin conexiones definidas</p>
        <p className="text-xs text-slate-300">Define relaciones en el Mapa Nodal para analizar la integridad.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 px-8 py-4 bg-white border-b border-slate-100 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <ShieldCheck size={18} className="text-[#0C1E4F]" />
          <div>
            <p className="text-[11px] font-black text-slate-800 uppercase tracking-widest leading-none">Integridad & Reconciliación</p>
            {lastRun && <p className="text-[9px] text-slate-400 font-bold mt-0.5">Actualizado: {lastRun.toLocaleTimeString()}</p>}
          </div>
          {summary && (
            <div className="flex items-center gap-2 ml-4">
              <span className="flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-1">
                <CheckCircle2 size={10} /> {summary.healthy} ok
              </span>
              <span className="flex items-center gap-1 text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1">
                <AlertTriangle size={10} /> {summary.warning}
              </span>
              <span className="flex items-center gap-1 text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-1">
                <XCircle size={10} /> {summary.critical} crítico
              </span>
            </div>
          )}
        </div>
        <button
          onClick={runAnalysis} disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-[#0C1E4F] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? 'Analizando...' : 'Reanalizar'}
        </button>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-8 space-y-4">
        {isLoading && !results.length && (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Loader2 size={28} className="animate-spin text-[#0C1E4F]" />
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Cruzando datos...</p>
          </div>
        )}
        {results.map(result => (
          <ConnectionCard
            key={result.edge.id}
            result={result}
            nodeMap={nodeMap}
            onRefresh={runAnalysis}
          />
        ))}
      </div>
    </div>
  );
}
