'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Loader2, Search, X, RefreshCw, Download, ArrowUpDown, ArrowDown, ArrowUp, Grid3X3
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { detectCwpColumn } from '@/lib/cwp-utils';
import * as XLSX from 'xlsx';
import type { Node, CustomView } from '@/types';

interface CWPMatrixProps {
  cwpGroups: Record<string, Record<string, any>>;
  customViews: CustomView[];
  entities: Node[];
  onSelectCWP?: (cwp: any) => void;
}

// ─── Detecta la columna identificadora de un documento
function getDocIdColumn(view: any): string | null {
  const cols: string[] = view.columns || [];
  const filterKey = (view.filter_key || '').toUpperCase();
  const idPatterns = [
    'PLANO', 'DRAWING', 'NUMERO', 'NUMBER', 'NUM', 'CODIGO',
    'CODE', 'DOC', 'DOCUMENT', 'ITEM', 'ID', 'TAG', 'REV',
  ];
  const byPattern = cols.find(c =>
    idPatterns.some(p => c.toUpperCase().includes(p)) &&
    c.toUpperCase() !== filterKey
  );
  if (byPattern) return byPattern;
  return cols.find(c => c.toUpperCase() !== filterKey) ?? cols[0] ?? null;
}

// ─── Escala de color por intensidad relativa
function getCellStyle(count: number, colMax: number): { bg: string; text: string; ring: string } {
  if (!count || colMax === 0) return { bg: 'bg-slate-100', text: 'text-slate-300', ring: '' };
  const pct = count / colMax;
  if (pct <= 0.12) return { bg: 'bg-blue-50',        text: 'text-blue-400',  ring: 'ring-1 ring-blue-100' };
  if (pct <= 0.30) return { bg: 'bg-blue-100',        text: 'text-blue-600',  ring: 'ring-1 ring-blue-200' };
  if (pct <= 0.55) return { bg: 'bg-[rgba(0,191,255,0.22)]',       text: 'text-[#0284C7]', ring: 'ring-1 ring-blue-300' };
  if (pct <= 0.80) return { bg: 'bg-[#0C1E4F]/25',    text: 'text-[#0C1E4F]', ring: 'ring-1 ring-brand-electric/30' };
  return               { bg: 'bg-[#0C1E4F]',          text: 'text-white',     ring: '' };
}

function getTotalStyle(count: number): string {
  if (!count) return 'bg-slate-50 text-slate-300';
  if (count < 10)  return 'bg-slate-100 text-slate-500';
  if (count < 50)  return 'bg-blue-50 text-blue-600';
  if (count < 200) return 'bg-[rgba(0,191,255,0.12)] text-[#0284C7] font-black';
  return 'bg-[#0C1E4F] text-white font-black';
}

export default function CWPMatrix({ cwpGroups, customViews, entities, onSelectCWP }: CWPMatrixProps) {
  const [counts, setCounts]       = useState<Record<string, Record<string, number>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [lastLoad, setLastLoad]   = useState<Date | null>(null);
  const [search, setSearch]       = useState('');
  const [sortView, setSortView]   = useState<string | null>(null);
  const [sortDir, setSortDir]     = useState<'desc' | 'desc'>('desc');

  const linkedViews = useMemo(() =>
    customViews.filter(v => (v.filter_key || detectCwpColumn(v.columns || [])) && v.entity_id),
    [customViews]
  );

  const allCwps: any[] = useMemo(() =>
    Object.values(cwpGroups).flatMap(g => Object.values(g)),
    [cwpGroups]
  );

  const columnMaxes = useMemo(() => {
    const maxes: Record<string, number> = {};
    linkedViews.forEach(view => {
      maxes[view.id] = Math.max(...allCwps.map(cwp => counts[cwp.name]?.[view.id] ?? 0), 1);
    });
    return maxes;
  }, [counts, linkedViews, allCwps]);

  const displayCwps = useMemo(() => {
    let result = allCwps;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((cwp: any) =>
        cwp.name.toLowerCase().includes(q) || cwp.discipline.toLowerCase().includes(q)
      );
    }
    if (sortView) {
      result = [...result].sort((a: any, b: any) => {
        const av = counts[a.name]?.[sortView] ?? 0;
        const bv = counts[b.name]?.[sortView] ?? 0;
        return sortDir === 'desc' ? bv - av : av - bv;
      });
    }
    return result;
  }, [allCwps, search, sortView, sortDir, counts]);

  const rowTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    allCwps.forEach((cwp: any) => {
      totals[cwp.name] = linkedViews.reduce((sum, v) => sum + (counts[cwp.name]?.[v.id] ?? 0), 0);
    });
    return totals;
  }, [allCwps, linkedViews, counts]);

  const colTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    linkedViews.forEach(view => {
      totals[view.id] = allCwps.reduce((sum, cwp: any) => sum + (counts[cwp.name]?.[view.id] ?? 0), 0);
    });
    return totals;
  }, [allCwps, linkedViews, counts]);

  const grandTotal = useMemo(() =>
    Object.values(colTotals).reduce((a, b) => a + b, 0),
    [colTotals]
  );

  const loadCounts = async () => {
    if (linkedViews.length === 0 || allCwps.length === 0) return;
    setIsLoading(true);

    const distinctSets: Record<string, Record<string, Set<string>>> = {};

    // Agrupar vistas por entity_id
    const entityIds = Array.from(new Set(linkedViews.map(v => v.entity_id)));

    await Promise.all(
      entityIds.map(async (nodeId) => {
        const { data : node, error } : any = await supabase
          .from('nodes')
          .select('id, data')
          .eq('id', nodeId)
          .single();

        if (error || !node || !node.data) return;
        const rows = node.data;
        const viewsForNode = linkedViews.filter(v => v.entity_id === nodeId);

        viewsForNode.forEach(view => {
          const filterKey = view.filter_key || detectCwpColumn(view.columns || []);
          if (!filterKey) return;
          const docIdCol  = getDocIdColumn(view);

          rows.forEach((r: any, idx: number) => {
            const rawCwp = r[filterKey] ?? '';
            const cwpVal = String(rawCwp).trim();
            if (!cwpVal) return;

            const rawDoc  = docIdCol ? r[docIdCol] : null;
            const docId   = rawDoc != null && String(rawDoc).trim() !== ''
              ? String(rawDoc).trim()
              : String(idx);

            if (!distinctSets[cwpVal])          distinctSets[cwpVal] = {};
            if (!distinctSets[cwpVal][view.id]) distinctSets[cwpVal][view.id] = new Set();
            distinctSets[cwpVal][view.id].add(docId);
          });
        });
      })
    );

    const newCounts: Record<string, Record<string, number>> = {};
    Object.entries(distinctSets).forEach(([cwpName, viewMap]) => {
      newCounts[cwpName] = {};
      Object.entries(viewMap).forEach(([viewId, set]) => {
        newCounts[cwpName][viewId] = set.size;
      });
    });

    setCounts(newCounts);
    setLastLoad(new Date());
    setIsLoading(false);
  };

  useEffect(() => {
    if (linkedViews.length > 0 && allCwps.length > 0) loadCounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedViews.length, allCwps.length]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-8 py-4 bg-white border-b border-slate-100 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={13} />
            <input
              type="text"
              placeholder="Filtrar CWP..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-8 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none"
            />
          </div>
          <div className="text-[10px] font-black uppercase text-slate-400">
             {displayCwps.length} CWPs | {grandTotal.toLocaleString()} únicos totales
          </div>
        </div>
        <button onClick={loadCounts} disabled={isLoading} className="p-2 bg-slate-50 rounded-xl">
           <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="border-collapse w-full text-xs">
          <thead className="bg-slate-50 sticky top-0 z-20">
            <tr>
              <th className="px-5 py-4 text-left border-b border-r min-w-[150px]">CWP</th>
              {linkedViews.map(v => (
                <th key={v.id} className="px-4 py-3 border-b border-r text-center">{v.name}</th>
              ))}
              <th className="px-4 py-4 border-b">Total</th>
            </tr>
          </thead>
          <tbody>
            {displayCwps.map((cwp: any) => {
              const rowTotal = rowTotals[cwp.name] ?? 0;
              return (
                <tr key={cwp.name} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 border-r border-slate-50 font-black">{cwp.name}</td>
                  {linkedViews.map(v => {
                    const count = counts[cwp.name]?.[v.id] ?? 0;
                    const { bg, text } = getCellStyle(count, columnMaxes[v.id] || 1);
                    return (
                      <td key={v.id} className="px-2 py-2 text-center border-r border-slate-50">
                        <div className={`mx-auto w-[60px] py-1 rounded-lg ${bg} ${text} font-black`}>
                           {count || '—'}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center font-black text-slate-900">{rowTotal || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

