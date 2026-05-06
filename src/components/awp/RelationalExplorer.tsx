'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Database, Plus, X, ChevronRight, Layers, Search, ArrowRight, Check, Loader2, Download, Save, Tag, Filter, GitBranch, Sparkles, Package, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import { useCwpFilter } from '@/hooks/useCwpFilter';
import { useSourceOfTruth, type SOTMapping } from '@/hooks/useSourceOfTruth';
import type { Node, Edge } from '@/types';

interface RelationalExplorerProps {
  entities: Node[];
  relationships: Edge[];
  onRefresh?: () => void;
}

interface SelectedColumn {
  entityId: string;
  entityName: string;
  column: string;
}

export default function RelationalExplorer({ entities, relationships, onRefresh }: RelationalExplorerProps) {
  const [baseEntityId, setBaseEntityId] = useState('');
  const [baseData, setBaseData] = useState<any[]>([]);
  const [baseColumns, setBaseColumns] = useState<string[]>([]);
  const [selectedBaseColumns, setSelectedBaseColumns] = useState<string[]>([]);
  const [selectedExtraColumns, setSelectedExtraColumns] = useState<SelectedColumn[]>([]);
  const [relatedEntityData, setRelatedEntityData] = useState<Record<string, any[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [columnSearch, setColumnSearch] = useState('');
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());

  // ─── FILTROS ───
  const [tableFilter, setTableFilter] = useState('');
  const [cwpFilter, setCwpFilter] = useState('');

  // ─── SAVE VIEW ───
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveViewName, setSaveViewName] = useState('');
  const [isSavingView, setIsSavingView] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // ─── SOURCE OF TRUTH (SOT) ───
  const projectId = useMemo(() => entities[0]?.project_id, [entities]);
  const { mappings, saveMapping, deleteMapping, clearAllMappings, resolveMasterField, refreshMappings } = useSourceOfTruth(projectId);
  const [showSotModal, setShowSotModal] = useState(false);
  const [isSavingSot, setIsSavingSot] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncCount, setSyncCount] = useState<number | null>(null);
  const [shouldClearMaster, setShouldClearMaster] = useState(false);

  // Campos maestros
  const MASTER_FIELDS = [
    { key: 'cwp', label: 'CWP (Código)', icon: <Tag size={12} /> },
    { key: 'description', label: 'Descripción CWP', icon: <Search size={12} /> },
    { key: 'discipline', label: 'Disciplina', icon: <Layers size={12} /> },
    { key: 'ewp', label: 'EWP', icon: <Package size={12} /> },
    { key: 'pwp', label: 'PWP', icon: <Database size={12} /> },
    { key: 'area', label: 'Área', icon: <Filter size={12} /> }
  ];

  const fetchAllRecords = async (entityId: string) => {
    const { data, error } : any = await supabase
      .from('nodes')
      .select('data')
      .eq('id', entityId)
      .single();
    if (error) return [];
    return Array.isArray(data?.data) ? data.data : [];
  };

  const reachableEntities = useMemo(() => {
    if (!baseEntityId) return [];
    const reached = new Map<string, { entity: Node, joinKey: any }>();
    const queue = [baseEntityId];
    const visited = new Set([baseEntityId]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      relationships.forEach((rel: Edge) => {
        if (rel.source_node_id === current && !visited.has(rel.target_node_id)) {
          const ent = entities.find(e => e.id === rel.target_node_id);
          if (ent) {
            visited.add(rel.target_node_id);
            reached.set(rel.target_node_id, { 
              entity: ent, 
              joinKey: { parentCol: rel.source_column, childCol: rel.target_column } 
            });
            queue.push(rel.target_node_id);
          }
        }
      });
    }
    return Array.from(reached.values());
  }, [baseEntityId, relationships, entities]);

  useEffect(() => {
    if (!baseEntityId) return;
    setIsLoading(true);
    fetchAllRecords(baseEntityId).then(data => {
      setBaseData(data);
      const node = entities.find(e => e.id === baseEntityId);
      const cols = node?.data_headers || (data[0] ? Object.keys(data[0]) : []);
      setBaseColumns(cols);
      setSelectedBaseColumns(cols.slice(0, 8));
      setIsLoading(false);
    });
  }, [baseEntityId, entities]);

  const ensureRelatedData = async (eid: string) => {
    if (relatedEntityData[eid]) return;
    const data = await fetchAllRecords(eid);
    setRelatedEntityData(prev => ({ ...prev, [eid]: data }));
  };

  const joinedRows = useMemo(() => {
    const columnsByEntity: Record<string, string[]> = {};
    selectedExtraColumns.forEach(c => {
      if (!columnsByEntity[c.entityId]) columnsByEntity[c.entityId] = [];
      columnsByEntity[c.entityId].push(c.column);
    });

    let result = baseData.map(r => ({ ...r }));
    
    Object.entries(columnsByEntity).forEach(([eid, cols]) => {
      const rel = reachableEntities.find(re => re.entity.id === eid);
      if (!rel) return;
      const { parentCol, childCol } = rel.joinKey;
      const relatedRows = relatedEntityData[eid] || [];
      const map = new Map();
      relatedRows.forEach(rr => {
        const val = String(rr[childCol] || '').toLowerCase();
        if (!map.has(val)) map.set(val, []);
        map.get(val).push(rr);
      });

      result = result.flatMap(row => {
        const joinVal = String(row[parentCol] || '').toLowerCase();
        const matches = map.get(joinVal) || [];
        if (matches.length === 0) {
          const nr = { ...row };
          cols.forEach(c => { nr[`${eid}::${c}`] = '—'; });
          return [nr];
        }
        return matches.map((m: any) => {
          const er = { ...row };
          cols.forEach(c => { er[`${eid}::${c}`] = m[c]; });
          return er;
        });
      });
    });
    return result;
  }, [baseData, selectedExtraColumns, relatedEntityData, reachableEntities]);

  const { cwpColumn, cwpValues } = useCwpFilter(
    useMemo(() => [...selectedBaseColumns, ...selectedExtraColumns.map(c => c.column)], [selectedBaseColumns, selectedExtraColumns]),
    joinedRows
  );

  const displayRows = useMemo(() => {
    let res = joinedRows;
    if (cwpFilter) res = res.filter(r => String(r[cwpColumn!] || '') === cwpFilter);
    if (tableFilter) {
      const q = tableFilter.toLowerCase();
      res = res.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)));
    }
    return res.slice(0, 500);
  }, [joinedRows, cwpFilter, cwpColumn, tableFilter]);

  const getColumnLabel = (col: string) => {
    if (!col.includes('::')) return col;
    const [eid, c] = col.split('::');
    const ent = entities.find(e => e.id === eid);
    return `${ent?.name.slice(0, 10)} > ${c}`;
  };

  const getColumnColor = (col: string) => {
    if (!col.includes('::')) return 'bg-slate-100 text-slate-600';
    return 'bg-blue-50 text-blue-600';
  };

  const handleSyncToMaster = async () => {
    if (!projectId) return;
    setIsSyncing(true);
    try {
      const mapCwp = mappings.find(m => m.master_key === 'cwp');
      if (!mapCwp) { alert('Mapea CWP primero'); return; }
      
      const cwpGroups = new Map<string, any>();
      joinedRows.forEach(row => {
        const code = String(row[mapCwp.source_attribute_name] || '').trim().toUpperCase();
        if (!code || code === '—') return;
        if (!cwpGroups.has(code)) cwpGroups.set(code, { project_id: projectId, cwp_code: code });
      });
      
      const rows = Array.from(cwpGroups.values());
      const { error } = await supabase.from('cwp_master').upsert(rows, { onConflict: 'project_id,cwp_code' });
      if (error) throw error;
      setSyncCount(rows.length);
      setTimeout(() => setSyncCount(null), 3000);
    } catch (e: any) { alert(e.message); }
    finally { setIsSyncing(false); }
  };

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* Sidebar */}
      <div className="w-72 border-r flex flex-col p-5 space-y-4">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tabla Raíz</h4>
        <select value={baseEntityId} onChange={e => setBaseEntityId(e.target.value)} className="w-full text-xs p-3 bg-slate-50 border rounded-xl">
          <option value="">Seleccionar...</option>
          {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        
        {baseEntityId && (
          <div className="flex-1 overflow-y-auto space-y-4">
            <div>
              <p className="text-[9px] font-black text-slate-300 uppercase mb-2">Columnas</p>
              {baseColumns.map(c => (
                <button key={c} onClick={() => setSelectedBaseColumns(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])} 
                  className={`w-full text-left px-3 py-2 text-[10px] rounded-lg mb-1 ${selectedBaseColumns.includes(c) ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>
                  {c}
                </button>
              ))}
            </div>
            {reachableEntities.map(({ entity }) => (
              <div key={entity.id}>
                <p className="text-[9px] font-black text-blue-300 uppercase mb-2">{entity.name}</p>
                {entity.data_headers.map(c => (
                  <button key={c} onClick={async () => { await ensureRelatedData(entity.id); setSelectedExtraColumns(prev => [...prev, { entityId: entity.id, entityName: entity.name, column: c }]) }}
                   className="w-full text-left px-3 py-2 text-[10px] hover:bg-blue-50 text-blue-600 rounded-lg mb-1">
                   + {c}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/30">
        <div className="p-4 bg-white border-b flex items-center justify-between">
           <div className="flex gap-2">
              <button onClick={() => setShowSotModal(true)} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-2">
                <GitBranch size={12} /> Matriz de Verdad
              </button>
              {cwpColumn && cwpValues.length > 0 && (
                <select value={cwpFilter} onChange={e => setCwpFilter(e.target.value)} className="text-[10px] border rounded-xl px-2">
                  <option value="">Todos los CWP</option>
                  {cwpValues.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              )}
           </div>
           <div className="text-[10px] font-black text-slate-400">{joinedRows.length} registros</div>
        </div>

        <div className="flex-1 overflow-auto p-6">
           {displayRows.length > 0 ? (
             <div className="bg-white border rounded-[2rem] overflow-hidden shadow-sm">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      {[...selectedBaseColumns, ...selectedExtraColumns.map(c => `${c.entityId}::${c.column}`)].map(col => (
                        <th key={col} className="px-4 py-3 font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">
                          {getColumnLabel(col)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {displayRows.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        {[...selectedBaseColumns, ...selectedExtraColumns.map(c => `${c.entityId}::${c.column}`)].map(col => (
                          <td key={col} className="px-4 py-2.5 truncate max-w-[200px]">{row[col] ?? '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
           ) : (
             <div className="flex flex-col items-center justify-center h-full text-slate-300 italic text-sm font-bold">
                Selecciona una tabla y columnas para comenzar
             </div>
           )}
        </div>
      </div>

      {/* SOT Modal */}
      {showSotModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center mb-6">
               <h3 className="font-black text-slate-800">Sincronizar Maestro CWP</h3>
               <button onClick={() => setShowSotModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            </div>
            <div className="space-y-3 mb-8">
               {MASTER_FIELDS.map(f => (
                 <div key={f.key} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                   <div className="flex items-center gap-3">
                     <span className="text-slate-400">{f.icon}</span>
                     <span className="text-xs font-bold text-slate-600">{f.label}</span>
                   </div>
                   <select className="text-[10px] font-bold p-1 border rounded bg-white" 
                     onChange={e => saveMapping(f.key as any, baseEntityId, e.target.value)}>
                     <option value="">Asignar columna...</option>
                     {baseColumns.map(c => <option key={c} value={c} selected={mappings.some(m => m.master_key === f.key && m.source_attribute_name === c)}>{c}</option>)}
                   </select>
                 </div>
               ))}
            </div>
            <button onClick={handleSyncToMaster} disabled={isSyncing} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3">
              {isSyncing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              {isSyncing ? 'Procesando...' : 'Sincronizar Catálogo'}
            </button>
            {syncCount !== null && (
              <p className="mt-4 text-center text-[10px] font-black text-green-500 uppercase tracking-widest">✓ {syncCount} items actualizados</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
