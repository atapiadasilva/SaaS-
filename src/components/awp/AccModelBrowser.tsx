'use client';

import { useState, useEffect } from 'react';
import {
  X, Loader2, ChevronRight, ChevronDown, FolderOpen, Folder,
  FileBox, Building2, Cloud, AlertCircle, RefreshCw, Check,
} from 'lucide-react';

interface AccItem {
  id: string;
  type: string;
  attributes: {
    name: string;
    displayName?: string;
    extension?: { type: string };
    mimeType?: string;
  };
}

const MODEL_EXTS = ['rvt', 'dwg', 'ifc', 'nwd', 'nwc', 'obj', 'fbx', '3ds', 'skp', 'stp', 'step', 'f3d', 'nwf'];

function isModelFile(item: AccItem) {
  const name = (item.attributes.displayName ?? item.attributes.name ?? '').toLowerCase();
  return MODEL_EXTS.some(ext => name.endsWith(`.${ext}`));
}

// ─── FolderNode ───────────────────────────────────────────────────────────────

function FolderNode({
  item, projectId, depth, onSelectModel, selecting,
}: {
  item: AccItem;
  projectId: string;
  depth: number;
  onSelectModel: (urn: string, name: string) => void;
  selecting: string | null;
}) {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [resolving, setResolving] = useState(false);
  const [children, setChildren] = useState<AccItem[]>([]);
  const [error, setError]       = useState<string | null>(null);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (children.length) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/autodesk/folders?projectId=${encodeURIComponent(projectId)}&folderId=${encodeURIComponent(item.id)}`);
      const data = await res.json();
      if (data.errors?.length) setError(data.errors[0].detail ?? 'Error cargando carpeta');
      else setChildren(data.data ?? []);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const selectFile = async (file: AccItem) => {
    setResolving(true);
    try {
      const res  = await fetch('/api/autodesk/resolve-urn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, itemId: file.id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onSelectModel(data.urn, data.name ?? file.attributes.displayName ?? file.attributes.name);
    } catch (e: any) {
      alert(`Error al cargar modelo: ${e.message}`);
    }
    setResolving(false);
  };

  const pl = 12 + depth * 18;

  return (
    <div>
      {/* Folder row */}
      <button
        onClick={toggle}
        className="flex items-center gap-2 w-full text-left py-2 hover:bg-slate-50 transition group"
        style={{ paddingLeft: pl, paddingRight: 12 }}
      >
        {open
          ? <ChevronDown size={12} className="text-slate-300 shrink-0" />
          : <ChevronRight size={12} className="text-slate-300 shrink-0" />}
        {open
          ? <FolderOpen size={14} className="text-amber-500 shrink-0" />
          : <Folder size={14} className="text-amber-400 shrink-0" />}
        <span className="text-[11px] font-semibold text-slate-700 truncate flex-1">
          {item.attributes.displayName ?? item.attributes.name}
        </span>
        {loading && <Loader2 size={11} className="animate-spin text-slate-300 shrink-0" />}
      </button>

      {/* Error */}
      {open && error && (
        <div className="mx-3 mb-2 p-2 bg-rose-50 border border-rose-100 rounded-lg text-[10px] text-rose-600"
          style={{ marginLeft: pl + 20 }}>
          {error}
        </div>
      )}

      {/* Children */}
      {open && !loading && children.map(child => {
        if (child.type === 'folders') {
          return (
            <FolderNode
              key={child.id}
              item={child}
              projectId={projectId}
              depth={depth + 1}
              onSelectModel={onSelectModel}
              selecting={selecting}
            />
          );
        }
        if (child.type === 'items' && isModelFile(child)) {
          const name = child.attributes.displayName ?? child.attributes.name;
          const isLoading = selecting === child.id;
          return (
            <button
              key={child.id}
              onClick={() => selectFile(child)}
              disabled={!!selecting}
              className="flex items-center gap-2 w-full text-left py-2 hover:bg-blue-50 hover:text-blue-700 transition group disabled:opacity-60"
              style={{ paddingLeft: pl + 20, paddingRight: 12 }}
            >
              {isLoading
                ? <Loader2 size={13} className="animate-spin text-blue-400 shrink-0" />
                : <FileBox size={13} className="text-blue-400 shrink-0 group-hover:text-blue-600" />}
              <span className="text-[11px] font-semibold text-slate-600 group-hover:text-blue-700 truncate flex-1">{name}</span>
              <span className="text-[9px] font-black text-slate-300 group-hover:text-blue-400 shrink-0 uppercase">
                {isLoading ? 'cargando...' : 'Abrir'}
              </span>
            </button>
          );
        }
        return null;
      })}
    </div>
  );
}

// ─── Main AccModelBrowser ─────────────────────────────────────────────────────

interface AccModelBrowserProps {
  currentUrn?: string;
  currentName?: string;
  onSelect: (urn: string, name: string) => void;
  onClose: () => void;
  returnPath: string;
}

export default function AccModelBrowser({ currentUrn, currentName, onSelect, onClose, returnPath }: AccModelBrowserProps) {
  const [authStatus, setAuthStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [hubs, setHubs]             = useState<AccItem[]>([]);
  const [selectedHub, setSelectedHub]     = useState<AccItem | null>(null);
  const [projects, setProjects]           = useState<AccItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<AccItem | null>(null);
  const [topFolders, setTopFolders]       = useState<AccItem[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingFolders, setLoadingFolders]   = useState(false);
  const [folderError, setFolderError]     = useState<string | null>(null);
  const [selecting, setSelecting]         = useState<string | null>(null);
  const [step, setStep]                   = useState<'hubs' | 'projects' | 'folders'>('hubs');

  useEffect(() => {
    fetch('/api/autodesk/hubs')
      .then(r => r.json())
      .then(data => {
        if (data.error === 'not_authenticated') setAuthStatus('disconnected');
        else { setHubs(data.data ?? []); setAuthStatus('connected'); }
      })
      .catch(() => setAuthStatus('disconnected'));
  }, []);

  const connectAcc = () => {
    window.location.href = `/api/autodesk/auth?returnTo=${encodeURIComponent(returnPath)}`;
  };

  const selectHub = async (hub: AccItem) => {
    setSelectedHub(hub);
    setStep('projects');
    setLoadingProjects(true);
    const res  = await fetch(`/api/autodesk/projects?hubId=${encodeURIComponent(hub.id)}`);
    const data = await res.json();
    setProjects(data.data ?? []);
    setLoadingProjects(false);
  };

  const selectProject = async (proj: AccItem) => {
    setSelectedProject(proj);
    setStep('folders');
    setLoadingFolders(true);
    setFolderError(null);
    try {
      const hubId = selectedHub?.id ?? '';
      const res  = await fetch(`/api/autodesk/folders?projectId=${encodeURIComponent(proj.id)}&hubId=${encodeURIComponent(hubId)}`);
      const data = await res.json();
      if (!res.ok) setFolderError(`HTTP ${res.status}: ${data.error ?? JSON.stringify(data).slice(0, 200)}`);
      else if (data.errors?.length) setFolderError(`ACC: ${data.errors[0].detail ?? data.errors[0].title ?? JSON.stringify(data.errors[0])}`);
      else if (!data.data?.length) setFolderError(`Sin carpetas accesibles (respuesta vacía). Status: ${res.status}. Verifica permisos en ACC.`);
      else setTopFolders(data.data);
    } catch (e: any) { setFolderError(e.message); }
    setLoadingFolders(false);
  };

  const handleSelect = (urn: string, name: string) => {
    onSelect(urn, name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0C1E4F] flex items-center justify-center">
              <Cloud size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-800">Seleccionar Modelo 3D</p>
              <p className="text-[10px] text-slate-400">Autodesk Construction Cloud</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {authStatus === 'checking' && (
            <div className="flex flex-col items-center py-16 gap-3">
              <Loader2 size={22} className="animate-spin text-[#0C1E4F]" />
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Verificando sesión ACC...</p>
            </div>
          )}

          {authStatus === 'disconnected' && (
            <div className="flex flex-col items-center py-10 gap-5 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                <Cloud size={28} className="text-slate-300" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-700">Inicia sesión en Autodesk</p>
                <p className="text-[11px] text-slate-400 mt-1">Conecta tu cuenta ACC para navegar y elegir modelos</p>
              </div>
              <button onClick={connectAcc}
                className="flex items-center gap-2 px-6 py-3 bg-[#0C1E4F] text-white rounded-xl text-[11px] font-black uppercase tracking-wide hover:bg-blue-700 transition shadow-sm">
                <Cloud size={14} /> Conectar con Autodesk ACC
              </button>
            </div>
          )}

          {authStatus === 'connected' && (
            <>
              {/* Breadcrumb */}
              <div className="flex items-center gap-1 text-[10px] font-bold bg-slate-50 rounded-xl px-3 py-2 flex-wrap">
                <button onClick={() => setStep('hubs')} className="text-slate-500 hover:text-[#0C1E4F]">Mis Hubs</button>
                {selectedHub && <>
                  <ChevronRight size={10} className="text-slate-300" />
                  <button onClick={() => setStep('projects')} className="text-slate-500 hover:text-[#0C1E4F] truncate max-w-[140px]">{selectedHub.attributes.name}</button>
                </>}
                {selectedProject && <>
                  <ChevronRight size={10} className="text-slate-300" />
                  <span className="text-[#0C1E4F] font-black truncate max-w-[140px]">{selectedProject.attributes.name}</span>
                </>}
              </div>

              {/* Hubs */}
              {step === 'hubs' && (
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 mb-2">Selecciona un Hub</p>
                  {hubs.map(hub => (
                    <button key={hub.id} onClick={() => selectHub(hub)}
                      className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl hover:bg-blue-50 border border-transparent hover:border-blue-100 transition group">
                      <div className="w-9 h-9 rounded-xl bg-[#0C1E4F]/10 flex items-center justify-center shrink-0">
                        <Building2 size={16} className="text-[#0C1E4F]" />
                      </div>
                      <span className="text-[12px] font-black text-slate-700 flex-1">{hub.attributes.name}</span>
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-500 transition" />
                    </button>
                  ))}
                </div>
              )}

              {/* Projects */}
              {step === 'projects' && (
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 mb-2">Selecciona un Proyecto</p>
                  {loadingProjects
                    ? <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
                    : projects.map(proj => (
                      <button key={proj.id} onClick={() => selectProject(proj)}
                        className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl hover:bg-blue-50 border border-transparent hover:border-blue-100 transition group">
                        <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                          <FolderOpen size={16} className="text-amber-500" />
                        </div>
                        <span className="text-[12px] font-black text-slate-700 flex-1">{proj.attributes.name}</span>
                        <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-500 transition" />
                      </button>
                    ))
                  }
                </div>
              )}

              {/* Folders & Files */}
              {step === 'folders' && (
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 mb-2">
                    Navega las carpetas y haz clic en el modelo para abrirlo
                  </p>
                  {loadingFolders
                    ? <div className="flex flex-col items-center py-8 gap-2"><Loader2 size={20} className="animate-spin text-slate-300" /><p className="text-[10px] text-slate-400">Cargando carpetas...</p></div>
                    : folderError
                      ? <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-700 space-y-2">
                          <div className="flex items-start gap-2"><AlertCircle size={13} className="shrink-0 mt-0.5" /><p>{folderError}</p></div>
                          <button onClick={() => selectProject(selectedProject!)} className="flex items-center gap-1 text-[10px] font-black text-rose-600 hover:text-rose-800">
                            <RefreshCw size={10} /> Reintentar
                          </button>
                        </div>
                      : <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-50">
                          {topFolders.map(folder => (
                            <FolderNode
                              key={folder.id}
                              item={folder}
                              projectId={selectedProject!.id}
                              depth={0}
                              onSelectModel={handleSelect}
                              selecting={selecting}
                            />
                          ))}
                        </div>
                  }
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {currentUrn && (
          <div className="shrink-0 px-6 py-3 border-t border-slate-100 bg-emerald-50 flex items-center gap-3">
            <Check size={13} className="text-emerald-600 shrink-0" />
            <p className="text-[10px] font-black text-emerald-700 flex-1 truncate">Activo: {currentName}</p>
          </div>
        )}
      </div>
    </div>
  );
}
