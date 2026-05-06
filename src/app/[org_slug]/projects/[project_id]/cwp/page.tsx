'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, GitBranch, Table, Grid3X3, Upload,
  Settings, Save, Plus, X, ChevronRight, Loader2,
  RefreshCw, Layers, BookOpen, ShieldCheck, TrendingUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import SourceOfTruth from '@/components/awp/SourceOfTruth';
import DataNodeImporter from '@/components/awp/DataNodeImporter';
import ModelingCanvas from '@/components/awp/ModelingCanvas';
import RelationalExplorer from '@/components/awp/RelationalExplorer';
import CWPMatrix from '@/components/awp/CWPMatrix';
import IntegrityAnalyzer from '@/components/awp/IntegrityAnalyzer';
import CWPAvance from '@/components/awp/CWPAvance';
import type { Node, Edge, CustomView } from '@/types';

type TabType = 'import' | 'modeling' | 'explorer' | 'matrix' | 'integrity' | 'avance';
type ImportSubTab = 'catalog' | 'sources';

export default function CwpConsolePage() {
  const { org_slug, project_id } = useParams() as { org_slug: string, project_id: string };
  const [activeTab, setActiveTab] = useState<TabType>('import');
  const [importSubTab, setImportSubTab] = useState<ImportSubTab>('sources');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [customViews, setCustomViews] = useState<CustomView[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Cargar metadatos base (Nodos y Edges)
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: nData, error: nErr } = await (supabase.from('nodes') as any)
        .select('id, name, source_type, data_headers, data, position_x, position_y, type, project_id')
        .eq('project_id', project_id);

      const { data: eData, error: eErr } = await (supabase.from('edges') as any)
        .select('*')
        .eq('project_id', project_id);

      const { data: cvData } = await (supabase.from('custom_views') as any)
        .select('*')
        .eq('project_id', project_id);

      if (nErr || eErr) throw nErr || eErr;

      setNodes(nData as any[] || []);
      setEdges(eData as any[] || []);
      setCustomViews(cvData as any[] || []);
    } catch (err) {
      console.error('Error fetching CWP metadata:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (project_id) fetchData();
  }, [project_id]);

  // 2. Handlers para el Modelador Nodal
  const handleSaveRelationship = async (conn: any) => {
    const { source, target, sourceHandle, targetHandle } = conn;
    try {
      const { error } = await (supabase.from('edges') as any).insert({
        project_id,
        source_node_id: source,
        target_node_id: target,
        source_column: sourceHandle,
        target_column: targetHandle,
        label: `${sourceHandle} -> ${targetHandle}`
      });
      if (!error) fetchData();
    } catch (err) { console.error(err); }
  };

  const handleDeleteRelationship = async (edgeId: string) => {
    try {
      const { error } = await (supabase.from('edges') as any).delete().eq('id', edgeId);
      if (!error) fetchData();
    } catch (err) { console.error(err); }
  };

  const handleSaveNodePosition = async (nodeId: string, x: number, y: number) => {
    try {
      await (supabase.from('nodes') as any).update({ position_x: x, position_y: y }).eq('id', nodeId);
    } catch (err) { console.error(err); }
  };

  const tabs = [
    { id: 'import',    label: 'Importador',     icon: <Upload size={14} />,      color: 'text-blue-500' },
    { id: 'modeling',  label: 'Mapa Nodal',     icon: <GitBranch size={14} />,   color: 'text-brand-electric' },
    { id: 'avance',    label: 'Panel de Avance',icon: <TrendingUp size={14} />,  color: 'text-emerald-500' },
    { id: 'explorer',  label: 'Explorador',     icon: <Table size={14} />,       color: 'text-purple-500' },
    { id: 'matrix',    label: 'Matriz Control', icon: <Grid3X3 size={14} />,     color: 'text-amber-500' },
    { id: 'integrity', label: 'Integridad',     icon: <ShieldCheck size={14} />, color: 'text-rose-500' },
  ];

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 gap-3">
        <Loader2 className="animate-spin text-[#0C1E4F]" size={32} />
        <span className="font-black text-slate-500 uppercase tracking-widest text-xs">Cargando Entorno AWP...</span>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] -m-8 flex flex-col bg-slate-50">
      
      {/* Header / Tab Navigation */}
      <div className="shrink-0 bg-white border-b border-slate-100 px-8 pt-8 pb-0">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#0C1E4F] rounded-2xl flex items-center justify-center text-white shadow-xl rotate-3">
              <Database size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black text-[#0C1E4F] leading-none mb-1 uppercase tracking-tight">Consola de Datos AWP</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Modelado Matemático & Integridad del Dato</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchData} className="p-3 hover:bg-slate-50 rounded-2xl transition-colors text-slate-400">
              <RefreshCw size={18} />
            </button>
            <div className="h-8 w-[1px] bg-slate-100 mx-2" />
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Fuentes</p>
              <p className="text-xs font-bold text-[#0C1E4F]">
                {nodes.length} Excels ·{' '}
                {nodes.reduce((s, n) => s + ((n as any).data?.length ?? 0), 0).toLocaleString('es')} filas
              </p>
            </div>
          </div>
        </div>

        {/* Tab List */}
        <div className="flex items-center gap-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`relative pb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === tab.id ? 'text-[#0C1E4F]' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <span className={activeTab === tab.id ? tab.color : 'text-slate-300'}>
                {tab.icon}
              </span>
              {tab.label}
              {activeTab === tab.id && (
                <motion.div layoutId="activeTabCwp" className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#0C1E4F] rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="h-full">
            
            {activeTab === 'import' && (
              <div className="h-full flex flex-col">
                <div className="shrink-0 bg-white border-b border-slate-100 flex items-center px-8 py-3 gap-6">
                   {[
                     { id: 'sources', label: 'Fuentes de Datos (Nodos)', icon: <Layers size={13} /> },
                     { id: 'catalog', label: 'Catálogo Maestro CWP', icon: <BookOpen size={13} /> }
                   ].map(st => (
                     <button
                       key={st.id}
                       onClick={() => setImportSubTab(st.id as ImportSubTab)}
                       className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all px-4 py-2 rounded-xl ${
                         importSubTab === st.id ? 'bg-[#0284C7] text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:bg-slate-50'
                       }`}
                     >
                       {st.icon} {st.label}
                     </button>
                   ))}
                </div>
                <div className="flex-1 overflow-hidden">
                  {importSubTab === 'catalog' ? (
                    <SourceOfTruth 
                      projectId={project_id} 
                      entities={nodes.map(n => ({ 
                        id: n.id, 
                        name: n.name, 
                        attributes: (n.data_headers || []).map((h: string) => ({ id: h, name: h })) 
                      }))} 
                    />
                  ) : (
                    <DataNodeImporter 
                      projectId={project_id} 
                      onSuccess={() => {
                        fetchData();
                        setActiveTab('modeling');
                      }} 
                    />
                  )}
                </div>
              </div>
            )}
            
            {activeTab === 'modeling' && (
              <div className="p-8 h-full flex flex-col">
                <ModelingCanvas 
                  initialNodes={nodes.map(n => ({
                    id: n.id, type: 'entityNode', position: { x: n.position_x || 0, y: n.position_y || 0 },
                    data: { name: n.name, attributes: (n.data_headers || []).map((h: any) => ({ name: h, is_primary_key: false })) }
                  }))}
                  initialEdges={edges.map(e => ({
                    id: e.id, source: e.source_node_id, target: e.target_node_id,
                    sourceHandle: e.source_column, targetHandle: e.target_column,
                    label: e.label, type: 'deletableEdge', animated: true
                  }))}
                  onSaveRelationship={handleSaveRelationship}
                  onDeleteRelationship={handleDeleteRelationship}
                  onSaveNodePosition={handleSaveNodePosition}
                />
              </div>
            )}

            {activeTab === 'avance' && (
              <CWPAvance
                nodes={nodes.map(n => ({
                  id:           n.id,
                  name:         n.name,
                  data_headers: (n.data_headers as string[]) ?? [],
                  data:         ((n as any).data as Record<string, string>[]) ?? [],
                }))}
              />
            )}

            {activeTab === 'explorer' && (
              <RelationalExplorer entities={nodes} relationships={edges} onRefresh={fetchData} />
            )}

            {activeTab === 'matrix' && (
              <CWPMatrix cwpGroups={{}} customViews={customViews} entities={nodes} />
            )}

            {activeTab === 'integrity' && (
              <IntegrityAnalyzer nodes={nodes} edges={edges} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
