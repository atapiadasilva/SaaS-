'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, Box, CheckCircle2, AlertTriangle, Loader2,
  Save, Info, ChevronRight, ChevronDown,
  FolderOpen, Folder, File, LogIn, RefreshCw,
  Monitor, ArrowLeft, Search,
} from 'lucide-react';
// ─── Types ────────────────────────────────────────────────────────────────────

export interface BimConfig {
  urn: string;
  modelName: string;
  configuredAt: string;
  projectId?: string;
  hubId?: string;
  itemCategory?: string;
  itemPropName?: string;
  cwpCategory?: string;
  cwpPropName?: string;
}

interface BimConfigModalProps {
  projectId: string;         // ID del proyecto en Supabase
  current: BimConfig | null;
  onSave: (cfg: BimConfig | null) => void;
  onClose: () => void;
  returnPath?: string;       // URL a la que vuelve tras el OAuth
}

interface APSHub    { id: string; attributes: { name: string } }
interface APSProject{ id: string; attributes: { name: string } }
interface APSItem   {
  id: string;
  type: 'folders' | 'items';
  attributes: { displayName: string; extension?: { type?: string } }
}

type BrowserStep = 'hubs' | 'projects' | 'folders' | 'saving';

// ─── ACC Browser ──────────────────────────────────────────────────────────────

function ACCBrowser({
  projectId: supabaseProjectId,
  onSelect,
}: {
  projectId: string;
  onSelect: (cfg: Pick<BimConfig, 'urn' | 'modelName' | 'projectId' | 'hubId'>) => void;
}) {
  const [step, setStep]         = useState<BrowserStep>('hubs');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const [hubs, setHubs]           = useState<APSHub[]>([]);
  const [projects, setProjects]   = useState<APSProject[]>([]);
  const [items, setItems]         = useState<APSItem[]>([]);

  const [selectedHub, setSelectedHub]         = useState<APSHub | null>(null);
  const [selectedProject, setSelectedProject] = useState<APSProject | null>(null);
  const [folderStack, setFolderStack]         = useState<{ id: string; name: string }[]>([]);

  const [resolving, setResolving] = useState<string | null>(null);
  const [search, setSearch]       = useState('');

  const returnPath = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';

  // ── Fetch helpers ────────────────────────────────────────────────────────────

  const fetchHubs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/autodesk/hubs');
      if (res.status === 401) { setError('not_authenticated'); setLoading(false); return; }
      const data = await res.json();
      setHubs(data?.data ?? []);
      setStep('hubs');
    } catch { setError('Error al cargar los hubs de ACC.'); }
    setLoading(false);
  }, []);

  const fetchProjects = useCallback(async (hub: APSHub) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/autodesk/projects?hubId=${encodeURIComponent(hub.id)}`);
      const data = await res.json();
      setProjects(data?.data ?? []);
      setSelectedHub(hub);
      setStep('projects');
    } catch { setError('Error al cargar los proyectos.'); }
    setLoading(false);
  }, []);

  const fetchFolder = useCallback(async (project: APSProject, hub: APSHub, folderId?: string, folderName?: string) => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/autodesk/folders?projectId=${encodeURIComponent(project.id)}&hubId=${encodeURIComponent(hub.id)}`;
      if (folderId) url += `&folderId=${encodeURIComponent(folderId)}`;
      const res = await fetch(url);
      const data = await res.json();
      setItems(data?.data ?? []);
      if (!folderId) {
        setSelectedProject(project);
        setFolderStack([]);
      } else {
        setFolderStack(prev => [...prev, { id: folderId, name: folderName ?? 'Carpeta' }]);
      }
      setStep('folders');
      setSearch('');
    } catch { setError('Error al cargar el contenido de la carpeta.'); }
    setLoading(false);
  }, []);

  const goBack = () => {
    if (step === 'projects') { setStep('hubs'); setSelectedHub(null); }
    else if (step === 'folders' && folderStack.length === 0) { setStep('projects'); setSelectedProject(null); }
    else if (step === 'folders' && folderStack.length > 0) {
      const newStack = [...folderStack];
      newStack.pop();
      const parentId = newStack[newStack.length - 1]?.id;
      if (selectedProject && selectedHub) {
        // Re-fetch parent folder
        setFolderStack(newStack);
        setLoading(true);
        const url = parentId
          ? `/api/autodesk/folders?projectId=${encodeURIComponent(selectedProject.id)}&folderId=${encodeURIComponent(parentId)}`
          : `/api/autodesk/folders?projectId=${encodeURIComponent(selectedProject.id)}&hubId=${encodeURIComponent(selectedHub.id)}`;
        fetch(url).then(r => r.json()).then(d => { setItems(d?.data ?? []); setLoading(false); });
      }
    }
  };

  const resolveAndSelect = async (item: APSItem) => {
    if (!selectedProject) return;
    setResolving(item.id);
    setError(null);
    try {
      const res = await fetch('/api/autodesk/resolve-urn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          itemId: item.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.urn) {
        setError(data.error ?? 'No se pudo resolver el URN del modelo.');
      } else {
        onSelect({
          urn: data.urn,
          modelName: item.attributes.displayName ?? data.name,
          projectId: selectedProject.id,
          hubId: selectedHub?.id,
        });
      }
    } catch (err: any) {
      setError(err.message ?? 'Error al resolver el modelo.');
    }
    setResolving(null);
  };

  useEffect(() => { fetchHubs(); }, [fetchHubs]);

  // ── Not authenticated ────────────────────────────────────────────────────────

  if (error === 'not_authenticated') {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-5 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#FF0000]/8 flex items-center justify-center">
          <LogIn size={26} className="text-[#FF0000]" />
        </div>
        <div>
          <p className="text-sm font-black text-slate-800">Conectar con Autodesk</p>
          <p className="text-[11px] text-slate-400 font-medium mt-1 max-w-xs">
            Tu sesión de Autodesk para explorar carpetas de ACC expiró. Esto no afecta el modelo ya vinculado al proyecto — solo es necesario si quieres elegir otro archivo.
          </p>
        </div>
        <a
          href={`/api/autodesk/auth?returnTo=${encodeURIComponent(returnPath)}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FF0000] text-white font-black text-xs rounded-xl hover:bg-[#A00000] transition-all uppercase tracking-widest"
        >
          <LogIn size={14} /> Iniciar sesión con Autodesk
        </a>
      </div>
    );
  }

  // ── Breadcrumb ────────────────────────────────────────────────────────────────

  const Breadcrumb = () => (
    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 mb-3 flex-wrap">
      {step !== 'hubs' && (
        <button onClick={goBack} className="hover:text-[#FF0000] flex items-center gap-1 transition-colors">
          <ArrowLeft size={11} /> Atrás
        </button>
      )}
      <span className={step === 'hubs' ? 'text-[#FF0000] font-black' : ''}>Hubs</span>
      {selectedHub && (
        <>
          <ChevronRight size={9} className="text-slate-300" />
          <span className={step === 'projects' ? 'text-[#FF0000] font-black' : ''}>{selectedHub.attributes.name}</span>
        </>
      )}
      {selectedProject && (
        <>
          <ChevronRight size={9} className="text-slate-300" />
          <span className={step === 'folders' && folderStack.length === 0 ? 'text-[#FF0000] font-black' : ''}>{selectedProject.attributes.name}</span>
        </>
      )}
      {folderStack.map((f, i) => (
        <span key={f.id} className="flex items-center gap-1.5">
          <ChevronRight size={9} className="text-slate-300" />
          <span className={i === folderStack.length - 1 ? 'text-[#FF0000] font-black' : ''}>{f.name}</span>
        </span>
      ))}
    </div>
  );

  // ── Filtered items ────────────────────────────────────────────────────────────

  const filteredItems = items.filter(i =>
    i.attributes.displayName?.toLowerCase().includes(search.toLowerCase())
  );

  const is3DModel = (item: APSItem) => {
    const ext = item.attributes.extension?.type ?? '';
    const name = item.attributes.displayName?.toLowerCase() ?? '';
    return item.type === 'items' && (
      ext.includes('Collaboration') ||
      ext.includes('Document') ||
      name.endsWith('.rvt') ||
      name.endsWith('.nwd') ||
      name.endsWith('.dwg') ||
      name.endsWith('.ifc') ||
      name.endsWith('.nwc')
    );
  };

  return (
    <div className="space-y-3">
      <Breadcrumb />

      {/* Search (only in folders) */}
      {step === 'folders' && (
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar en esta carpeta…"
            className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
          />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-[#FF0000]" size={22} />
        </div>
      )}

      {/* Error */}
      {error && error !== 'not_authenticated' && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 text-rose-700">
          <AlertTriangle size={13} className="shrink-0" />
          <p className="text-[11px] font-bold flex-1">{error}</p>
          <button onClick={fetchHubs} className="shrink-0 hover:text-rose-900 transition-colors"><RefreshCw size={12} /></button>
        </div>
      )}

      {/* Hubs */}
      {!loading && step === 'hubs' && (
        <div className="space-y-1.5">
          {hubs.length === 0 && <p className="text-center text-[11px] text-slate-400 py-6 font-semibold">Sin hubs disponibles</p>}
          {hubs.map(hub => (
            <button
              key={hub.id}
              onClick={() => fetchProjects(hub)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-slate-100 bg-white hover:bg-[#FF0000]/5 hover:border-[#FF0000]/20 transition-all text-left group"
            >
              <Monitor size={16} className="text-[#FF0000] shrink-0" />
              <span className="text-sm font-bold text-slate-800 flex-1">{hub.attributes.name}</span>
              <ChevronRight size={13} className="text-slate-300 group-hover:text-[#FF0000] transition-colors" />
            </button>
          ))}
        </div>
      )}

      {/* Projects */}
      {!loading && step === 'projects' && (
        <div className="space-y-1.5">
          {projects.length === 0 && <p className="text-center text-[11px] text-slate-400 py-6 font-semibold">Sin proyectos</p>}
          {projects.map(proj => (
            <button
              key={proj.id}
              onClick={() => selectedHub && fetchFolder(proj, selectedHub)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-slate-100 bg-white hover:bg-sky-50 hover:border-sky-200 transition-all text-left group"
            >
              <FolderOpen size={16} className="text-sky-500 shrink-0" />
              <span className="text-sm font-bold text-slate-800 flex-1 truncate">{proj.attributes.name}</span>
              <ChevronRight size={13} className="text-slate-300 group-hover:text-sky-500 transition-colors" />
            </button>
          ))}
        </div>
      )}

      {/* Folder contents */}
      {!loading && step === 'folders' && (
        <div className="space-y-1">
          {filteredItems.length === 0 && (
            <p className="text-center text-[11px] text-slate-400 py-6 font-semibold">
              {search ? 'Sin resultados' : 'Carpeta vacía'}
            </p>
          )}
          {filteredItems.map(item => {
            const isFolder = item.type === 'folders';
            const isModel = is3DModel(item);
            const isResolvingThis = resolving === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (isFolder) {
                    selectedProject && selectedHub && fetchFolder(selectedProject, selectedHub, item.id, item.attributes.displayName);
                  } else if (isModel) {
                    resolveAndSelect(item);
                  }
                }}
                disabled={!!resolving || (!isFolder && !isModel)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group
                  ${isFolder ? 'hover:bg-amber-50 hover:border-amber-200 border border-slate-100' : ''}
                  ${isModel ? 'hover:bg-emerald-50 hover:border-emerald-200 border border-slate-100' : ''}
                  ${!isFolder && !isModel ? 'opacity-40 cursor-not-allowed border border-slate-50' : ''}
                `}
              >
                {isFolder
                  ? <Folder size={15} className="text-amber-500 shrink-0" />
                  : isModel
                  ? <Box size={15} className="text-emerald-500 shrink-0" />
                  : <File size={15} className="text-slate-300 shrink-0" />
                }
                <span className={`text-[12px] font-semibold flex-1 truncate ${!isFolder && !isModel ? 'text-slate-300' : 'text-slate-700'}`}>
                  {item.attributes.displayName}
                </span>
                {isResolvingThis && <Loader2 size={13} className="animate-spin text-emerald-500 shrink-0" />}
                {isFolder && !isResolvingThis && <ChevronRight size={12} className="text-slate-300 group-hover:text-amber-500 shrink-0 transition-colors" />}
                {isModel && !isResolvingThis && (
                  <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0 uppercase tracking-wide">
                    Seleccionar
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function BimConfigModal({
  projectId,
  current,
  onSave,
  onClose,
}: BimConfigModalProps) {
  const [mode, setMode] = useState<'browse' | 'manual'>('browse');
  // Si ya hay un modelo activo, no entres directo al explorador de ACC (eso fuerza un login de Autodesk
  // aunque el modelo ya esté vinculado y funcionando). Solo se abre si el usuario pide explícitamente cambiarlo.
  const [wantsToChange, setWantsToChange] = useState(!current?.urn);
  const [pending, setPending] = useState<Pick<BimConfig, 'urn' | 'modelName' | 'projectId' | 'hubId'> | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  // Manual mode fields
  const [manualUrn, setManualUrn]   = useState(current?.urn ?? '');
  const [manualName, setManualName] = useState(current?.modelName ?? '');

  // Advanced fields
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [itemCategory, setItemCategory] = useState(current?.itemCategory ?? 'Item');
  const [itemPropName, setItemPropName] = useState(current?.itemPropName ?? 'SP3D_MONIKER');
  const [cwpCategory, setCwpCategory]   = useState(current?.cwpCategory ?? 'Item');
  const [cwpPropName, setCwpPropName]   = useState(current?.cwpPropName ?? 'CWP');

  const isConfigured = !!current?.urn;

  const handleSelectFromACC = (cfg: Pick<BimConfig, 'urn' | 'modelName' | 'projectId' | 'hubId'>) => {
    setPending(cfg);
  };

  const handleSave = async () => {
    const urn  = mode === 'browse' ? pending?.urn  : manualUrn.trim();
    const name = mode === 'browse' ? pending?.modelName : manualName.trim();

    if (!urn || !name) { setError('Selecciona un modelo o ingresa el URN y el nombre.'); return; }
    setSaving(true);
    setError(null);

    const newConfig: BimConfig = {
      urn,
      modelName: name,
      configuredAt: new Date().toISOString(),
      projectId: pending?.projectId,
      hubId: pending?.hubId,
      itemCategory: itemCategory.trim(),
      itemPropName: itemPropName.trim() || 'SP3D_MONIKER',
      cwpCategory: cwpCategory.trim(),
      cwpPropName: cwpPropName.trim() || 'CWP',
    };

    try {
      const res = await fetch('/api/project-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, key: 'bim', value: newConfig }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error ?? 'Error al guardar.');
      }
      setSuccess(true);
      onSave(newConfig);
      setTimeout(() => { setSuccess(false); onClose(); }, 1200);
    } catch (err: any) {
      setError(err.message ?? 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      const res = await fetch('/api/project-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, key: 'bim', value: null }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error ?? 'Error al eliminar la configuración.');
      }
      onSave(null);
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Error al eliminar la configuración.');
    } finally {
      setClearing(false);
    }
  };

  const canSave = mode === 'browse' ? !!pending?.urn : (manualUrn.trim().length > 10 && manualName.trim().length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(12,30,79,0.4)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="px-7 pt-6 pb-4 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 flex items-center justify-center border border-emerald-100 shadow-sm shrink-0">
              <Box size={22} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Configurar Visualización 3D</h2>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Vincula un modelo ACC/APS al proyecto</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* ── Status ──────────────────────────────────────────────────── */}
        <div className="px-7 pt-4 shrink-0">
          {isConfigured ? (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 mb-4">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black text-emerald-800 uppercase tracking-wide">Modelo Activo</p>
                <p className="text-[10px] text-emerald-600 font-medium truncate">{current?.modelName}</p>
              </div>
              <p className="text-[9px] text-emerald-500 font-semibold shrink-0">
                {current?.configuredAt && new Date(current.configuredAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
              <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] font-bold text-amber-800">
                Sin configurar — el módulo <span className="font-black">Visualización 3D</span> no estará disponible hasta que configures un modelo.
              </p>
            </div>
          )}

          {/* Pending selection banner */}
          {pending && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 mb-4">
              <Box size={15} className="text-blue-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-blue-800 uppercase tracking-wide">Modelo seleccionado</p>
                <p className="text-[11px] text-blue-700 font-semibold truncate">{pending.modelName}</p>
              </div>
              <button onClick={() => setPending(null)} className="text-blue-400 hover:text-blue-700 transition-colors">
                <X size={13} />
              </button>
            </div>
          )}
        </div>

        {/* ── Mode tabs ────────────────────────────────────────────────── */}
        {wantsToChange && (
          <div className="px-7 shrink-0">
            <div className="flex bg-slate-100 rounded-2xl p-1 mb-4 gap-1">
              <button
                onClick={() => setMode('browse')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all ${
                  mode === 'browse' ? 'bg-white text-[#FF0000] shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <FolderOpen size={13} /> Explorar ACC
              </button>
              <button
                onClick={() => setMode('manual')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all ${
                  mode === 'manual' ? 'bg-white text-[#FF0000] shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Info size={13} /> URN Manual
              </button>
            </div>
          </div>
        )}

        {/* ── Body (scrollable) ─────────────────────────────────────── */}
        <div className="px-7 pb-4 overflow-y-auto flex-1">

          {!wantsToChange && (
            <button
              onClick={() => setWantsToChange(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-slate-200 text-[11px] font-black text-slate-500 hover:border-[#FF0000]/30 hover:text-[#FF0000] transition-all uppercase tracking-wide"
            >
              <RefreshCw size={13} /> Cambiar modelo vinculado
            </button>
          )}

          {wantsToChange && mode === 'browse' && (
            <ACCBrowser projectId={projectId} onSelect={handleSelectFromACC} />
          )}

          {wantsToChange && mode === 'manual' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre del Modelo</label>
                <input
                  type="text"
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="Ej: Estructura Principal EIMI00415"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-800 outline-none focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all placeholder:text-slate-300"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">URN del Modelo (APS)</label>
                <textarea
                  value={manualUrn}
                  onChange={e => setManualUrn(e.target.value)}
                  rows={3}
                  placeholder="dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono text-slate-700 outline-none focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all resize-none placeholder:text-slate-300"
                />
              </div>
            </div>
          )}

          {wantsToChange && (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <button 
                onClick={() => setShowAdvanced(!showAdvanced)} 
                className="flex items-center gap-2 text-[11px] font-bold text-slate-500 hover:text-slate-800 transition-colors uppercase tracking-wider"
              >
                {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Configuración Avanzada (Propiedades)
              </button>
              
              {showAdvanced && (
                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
                  <div className="space-y-4">
                    <h3 className="text-[11px] font-black text-slate-800 uppercase border-b border-slate-100 pb-1">Vinculación de Ítems (Unidad)</h3>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Categoría (Pestaña)</label>
                      <input
                        type="text"
                        value={itemCategory}
                        onChange={e => setItemCategory(e.target.value)}
                        placeholder="Ej: EIMI_EPV1"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all placeholder:text-slate-300"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Propiedad</label>
                      <input
                        type="text"
                        value={itemPropName}
                        onChange={e => setItemPropName(e.target.value)}
                        placeholder="Ej: ElementGUID"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all placeholder:text-slate-300"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-[11px] font-black text-slate-800 uppercase border-b border-slate-100 pb-1">Agrupación (CWP)</h3>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Categoría (Pestaña)</label>
                      <input
                        type="text"
                        value={cwpCategory}
                        onChange={e => setCwpCategory(e.target.value)}
                        placeholder="Ej: EIMI_EPV1"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all placeholder:text-slate-300"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Propiedad</label>
                      <input
                        type="text"
                        value={cwpPropName}
                        onChange={e => setCwpPropName(e.target.value)}
                        placeholder="Ej: CWP 1"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all placeholder:text-slate-300"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && error !== 'not_authenticated' && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mt-3 text-rose-700">
              <AlertTriangle size={14} className="shrink-0" />
              <p className="text-[11px] font-bold">{error}</p>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="px-7 py-4 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          {isConfigured && (
            <button
              onClick={handleClear}
              disabled={clearing}
              className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-black text-rose-500 hover:bg-rose-50 rounded-xl border border-rose-200 transition-all disabled:opacity-50"
            >
              {clearing ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
              Eliminar config
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} className="px-4 py-2.5 text-[11px] font-black text-slate-500 hover:bg-slate-100 rounded-xl border border-slate-200 transition-all">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving || success}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all ${
                success ? 'bg-emerald-500 text-white' :
                canSave ? 'bg-[#FF0000] text-white hover:bg-[#A00000]' :
                'bg-slate-100 text-slate-300 cursor-not-allowed'
              }`}
            >
              {saving ? <><Loader2 size={13} className="animate-spin" /> Guardando…</>
               : success ? <><CheckCircle2 size={13} /> ¡Guardado!</>
               : <><Save size={13} /> Guardar y vincular</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
