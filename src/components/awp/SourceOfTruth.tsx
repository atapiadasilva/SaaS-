'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ShieldCheck, Plus, Edit2, Trash2, Save, X, Loader2,
  CheckCircle2, AlertCircle, Search, Download, Upload,
  Filter, BookOpen, Layers, GitBranch, Package,
  Sparkles, Table2, ArrowRight, ChevronDown, Hash,
  CheckSquare, Square, RefreshCw
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Attribute {
  id: string;
  name: string;
  data_type?: string;
}
interface Entity {
  id: string;
  name: string;
  attributes?: Attribute[];
}

interface CWPRecord {
  id?: string;
  project_id?: string;
  cwp_code: string;
  cwp_description: string;
  discipline: string;
  ewp_code: string;
  pwp_code: string;
  area: string;
  tags: string;
  is_active: boolean;
  sort_order?: number;
}

type EditableFields = Omit<CWPRecord, 'id' | 'project_id' | 'sort_order'>;

const EMPTY_FORM: EditableFields = {
  cwp_code: '', cwp_description: '', discipline: '',
  ewp_code: '', pwp_code: '', area: '', tags: '', is_active: true,
};

// Resultado del RPC
interface ExtractedRow {
  cwp_code: string;
  cwp_description: string;
  discipline: string;
  ewp_code: string;
  pwp_code: string;
  area: string;
  tags: string;
  row_count: number;
  selected?: boolean;
  already_in_master?: boolean;
}

// Mapeo de columnas para el extractor
interface ColMapping {
  cwp: string;
  desc: string;
  disc: string;
  ewp: string;
  pwp: string;
  area: string;
  tags: string;
}

interface SourceOfTruthProps {
  entities?: Entity[];
  projectId?: string;
}

// ─── Componente Principal ────────────────────────────────────────────────────

export default function SourceOfTruth({ entities = [], projectId }: SourceOfTruthProps) {
  // ── Estado del catálogo ────────────────────────────────────────────────
  const [records, setRecords] = useState<CWPRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<EditableFields>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [filterDiscipline, setFilterDiscipline] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Estado del extractor ───────────────────────────────────────────────
  const [showExtractor, setShowExtractor] = useState(false);
  const [extEntityId, setExtEntityId] = useState('');
  const [colMap, setColMap] = useState<ColMapping>({ cwp: '', desc: '', disc: '', ewp: '', pwp: '', area: '', tags: '' });
  const [extractedRows, setExtractedRows] = useState<ExtractedRow[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAddingSelected, setIsAddingSelected] = useState(false);
  const [extSearch, setExtSearch] = useState('');

  // ── Carga del catálogo ─────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('cwp_master')
        .select('*')
        .eq('project_id', projectId)
        .order('discipline').order('cwp_code');
      if (error) throw error;
      setRecords(data || []);
    } catch {
      showToast('error', 'Error al cargar el catálogo.');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // ── Toast ──────────────────────────────────────────────────────────────
  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = records.filter(r => r.is_active);
    return {
      total: active.length,
      disciplines: new Set(active.map(r => r.discipline).filter(Boolean)).size,
      ewps: new Set(active.map(r => r.ewp_code).filter(Boolean)).size,
      pwps: new Set(active.map(r => r.pwp_code).filter(Boolean)).size,
    };
  }, [records]);

  const disciplineOptions = useMemo(() =>
    Array.from(new Set(records.map(r => r.discipline).filter(Boolean))).sort(),
    [records]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter(r => {
      const matchSearch = !q || [r.cwp_code, r.cwp_description, r.discipline, r.ewp_code, r.pwp_code]
        .some(v => v?.toLowerCase().includes(q));
      return matchSearch && (!filterDiscipline || r.discipline === filterDiscipline);
    });
  }, [records, search, filterDiscipline]);

  // ── CRUD ───────────────────────────────────────────────────────────────
  const openEdit = (r: CWPRecord) => {
    setFormData({ 
      cwp_code: r.cwp_code, 
      cwp_description: r.cwp_description, 
      discipline: r.discipline, 
      ewp_code: r.ewp_code, 
      pwp_code: r.pwp_code, 
      area: r.area || '',
      tags: r.tags || '',
      is_active: r.is_active 
    });
    setEditingId(r.id!);
  };

  const cancelEdit = () => { setEditingId(null); setFormData(EMPTY_FORM); };

  const save = async () => {
    if (!projectId) return;
    const code = formData.cwp_code.trim().toUpperCase();
    if (!code) { showToast('error', 'El código CWP es obligatorio.'); return; }
    setIsSaving(true);
    try {
      const payload = {
        project_id: projectId,
        cwp_code: code,
        cwp_description: formData.cwp_description.trim(),
        discipline: formData.discipline.trim().toUpperCase(),
        ewp_code: formData.ewp_code.trim().toUpperCase(),
        pwp_code: formData.pwp_code.trim().toUpperCase(),
        area: formData.area.trim().toUpperCase(),
        tags: formData.tags.trim(),
        is_active: formData.is_active,
      };
      if (editingId === 'new') {
        const { error } = await supabase.from('cwp_master').insert(payload);
        if (error) throw error;
        showToast('success', `CWP ${code} agregado.`);
      } else {
        const { error } = await supabase.from('cwp_master').update(payload).eq('id', editingId!);
        if (error) throw error;
        showToast('success', `CWP ${code} actualizado.`);
      }
      await load(); cancelEdit();
    } catch (err: any) {
      showToast('error', err?.message?.includes('unique') ? `${formData.cwp_code} ya existe.` : 'Error al guardar.');
    } finally { setIsSaving(false); }
  };

  const deleteRecord = async (id: string) => {
    setIsSaving(true);
    try {
      await supabase.from('cwp_master').delete().eq('id', id);
      showToast('success', 'Registro eliminado.');
      await load();
    } catch { showToast('error', 'Error al eliminar.'); }
    finally { setIsSaving(false); setConfirmDelete(null); }
  };

  // ── Exportar ───────────────────────────────────────────────────────────
  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(records.map(r => ({
      CWP: r.cwp_code, DESCRIPCION_CWP: r.cwp_description, DISCIPLINA: r.discipline,
      EWP: r.ewp_code, PWP: r.pwp_code, ACTIVO: r.is_active ? 'SI' : 'NO',
    })));
    ws['!cols'] = [{ wch: 20 }, { wch: 45 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CWP_MAESTRO');
    XLSX.writeFile(wb, `CWP_Maestro_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ── Importar Excel ─────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'binary' });
        const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        const parsed: CWPRecord[] = rows.map(row => ({
          cwp_code: String(row['CWP'] || row['cwp_code'] || '').trim().toUpperCase(),
          cwp_description: String(row['DESCRIPCION_CWP'] || row['DESCRIPCION'] || row['DESCRIPTION'] || '').trim(),
          discipline: String(row['DISCIPLINA'] || row['discipline'] || '').trim().toUpperCase(),
          ewp_code: String(row['EWP'] || row['ewp_code'] || '').trim().toUpperCase(),
          pwp_code: String(row['PWP'] || row['pwp_code'] || '').trim().toUpperCase(),
          area: String(row['AREA'] || row['area'] || '').trim().toUpperCase(),
          tags: String(row['TAGS'] || row['tags'] || '').trim(),
          is_active: true,
        })).filter(r => r.cwp_code);
        if (!parsed.length) { showToast('error', 'No se encontraron filas con columna CWP.'); return; }
        if (!projectId) return;
        const upsertRows = parsed.map(r => ({ project_id: projectId, ...r }));
        const { error } = await supabase.from('cwp_master').upsert(upsertRows, { onConflict: 'project_id,cwp_code' });
        if (error) throw error;
        showToast('success', `${parsed.length} CWPs importados correctamente.`);
        await load();
      } catch { showToast('error', 'Error al importar.'); }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // ── EXTRACTOR: columnas del entity seleccionado ────────────────────────
  const selectedEntity = useMemo(() => entities.find(e => e.id === extEntityId), [entities, extEntityId]);
  const entityColumns = useMemo(() => selectedEntity?.attributes?.map(a => a.name).sort() ?? [], [selectedEntity]);

  // Auto-detectar columnas comunes al cambiar entity
  useEffect(() => {
    if (!entityColumns.length) return;
    const find = (...keys: string[]) => entityColumns.find(c =>
      keys.some(k => c.toLowerCase().replace(/[\s_-]/g, '') === k.toLowerCase())
    ) ?? '';
      setColMap({
        cwp:  find('cwp', 'codigocwp', 'cwpcode', 'cwp_code'),
        desc: find('descripcioncwp', 'descripcion', 'description', 'cwpdescription', 'desc'),
        disc: find('disciplina', 'discipline', 'disc'),
        ewp:  find('ewp', 'codigoewp', 'ewpcode'),
        pwp:  find('pwp', 'codigopwp', 'pwpcode'),
        area: find('area', 'sector', 'zona', 'location'),
        tags: find('tags', 'comentarios', 'observaciones', 'tags_cwp'),
      });
    }, [entityColumns]);

  // ── EXTRACTOR: ejecutar RPC ────────────────────────────────────────────
  const masterCodes = useMemo(() => new Set(records.map(r => r.cwp_code)), [records]);

  const runExtraction = async () => {
    if (!extEntityId || !colMap.cwp) { showToast('error', 'Elige una entidad y la columna CWP.'); return; }
    setIsExtracting(true);
    setExtractedRows([]);
    try {
      const { data, error } = await supabase.rpc('extract_cwp_combinations', {
        p_entity_id: extEntityId,
        p_cwp_col:   colMap.cwp,
        p_desc_col:  colMap.desc || null,
        p_disc_col:  colMap.disc || null,
        p_ewp_col:   colMap.ewp  || null,
        p_pwp_col:   colMap.pwp  || null,
        p_area_col:  colMap.area || null,
        p_tags_col:  colMap.tags || null,
      });
      if (error) throw error;
      const rows: ExtractedRow[] = (data || []).map((r: any) => ({
        ...r,
        selected: !masterCodes.has(r.cwp_code), // pre-selecciona los que NO están en master
        already_in_master: masterCodes.has(r.cwp_code),
      }));
      setExtractedRows(rows);
    } catch (err: any) {
      showToast('error', 'Error al extraer. Verifica que la migración 015 y 025 estén aplicadas.');
    } finally { setIsExtracting(false); }
  };

  const toggleRow = (cwp: string) =>
    setExtractedRows(prev => prev.map(r => r.cwp_code === cwp ? { ...r, selected: !r.selected } : r));

  const toggleAll = () => {
    const allSelected = filteredExtracted.filter(r => !r.already_in_master).every(r => r.selected);
    setExtractedRows(prev => prev.map(r => ({
      ...r,
      selected: r.already_in_master ? r.selected : !allSelected,
    })));
  };

  const filteredExtracted = useMemo(() => {
    const q = extSearch.toLowerCase();
    return extractedRows.filter(r =>
      !q || [r.cwp_code, r.cwp_description, r.discipline, r.ewp_code, r.pwp_code]
        .some(v => v?.toLowerCase().includes(q))
    );
  }, [extractedRows, extSearch]);

  const selectedCount = extractedRows.filter(r => r.selected && !r.already_in_master).length;

  const addSelectedToMaster = async () => {
    if (!projectId) return;
    const toAdd = extractedRows.filter(r => r.selected && !r.already_in_master);
    if (!toAdd.length) { showToast('error', 'No hay filas nuevas seleccionadas.'); return; }
    setIsAddingSelected(true);
    try {
      const rows = toAdd.map(r => ({
        project_id: projectId,
        cwp_code: r.cwp_code,
        cwp_description: r.cwp_description || '',
        discipline: r.discipline || '',
        ewp_code: r.ewp_code || '',
        pwp_code: r.pwp_code || '',
        area: r.area || '',
        tags: r.tags || '',
        is_active: true,
      }));
      const { error } = await supabase.from('cwp_master').upsert(rows, { onConflict: 'project_id,cwp_code' });
      if (error) throw error;
      showToast('success', `${toAdd.length} CWPs agregados al catálogo maestro.`);
      await load();
      // Marcar como ya en master
      setExtractedRows(prev => prev.map(r =>
        r.selected ? { ...r, already_in_master: true, selected: false } : r
      ));
    } catch { showToast('error', 'Error al agregar al catálogo.'); }
    finally { setIsAddingSelected(false); }
  };

  // ─────────────────────────────────────────────────────────────────────
  if (!projectId) return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400 p-12">
      <ShieldCheck size={48} className="opacity-20" />
      <p className="text-sm font-bold italic">Selecciona un proyecto primero.</p>
    </div>
  );

  return (
    <div className="flex h-full bg-slate-50/50 overflow-hidden">

      {/* ══════════════════════════════════════════════════════
          PANEL PRINCIPAL — CATÁLOGO
      ══════════════════════════════════════════════════════ */}
      <div className={`flex flex-col transition-all duration-300 ${showExtractor ? 'w-[55%]' : 'flex-1'} overflow-hidden`}>

        {/* Header */}
        <div className="shrink-0 bg-white border-b border-slate-100 px-6 py-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-brand-deep rounded-2xl text-white shadow-lg shadow-brand-deep/20">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h1 className="text-xl font-black italic text-slate-900 tracking-tight">Catálogo Maestro CWP</h1>
                <p className="text-[10px] font-bold text-slate-400">Lista canónica de CWPs, disciplinas, EWPs y PWPs del proyecto.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={exportExcel} disabled={!records.length}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-600 text-[10px] font-black rounded-xl transition-all">
                <Download size={12} /> Exportar
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black rounded-xl transition-all">
                <Upload size={12} /> Importar XLS
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
              <button onClick={() => setShowExtractor(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-black rounded-xl transition-all ${showExtractor ? 'bg-brand-electric/10 text-brand-electric border border-brand-electric/30' : 'bg-brand-electric text-white shadow-lg shadow-brand-electric/20 hover:bg-brand-electric/90'}`}>
                <Sparkles size={12} /> Extraer desde datos
              </button>
              <button onClick={() => { setFormData(EMPTY_FORM); setEditingId('new'); }} disabled={editingId === 'new'}
                className="flex items-center gap-1.5 px-3 py-2 bg-brand-deep hover:bg-slate-800 disabled:opacity-50 text-white text-[10px] font-black rounded-xl shadow-lg shadow-brand-deep/20 transition-all">
                <Plus size={12} /> Nuevo
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'CWPs', value: stats.total, icon: BookOpen, color: 'text-brand-deep' },
              { label: 'Disciplinas', value: stats.disciplines, icon: Layers, color: 'text-brand-electric' },
              { label: 'EWPs', value: stats.ewps, icon: GitBranch, color: 'text-emerald-600' },
              { label: 'PWPs', value: stats.pwps, icon: Package, color: 'text-amber-600' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-slate-50 rounded-xl px-4 py-2.5 flex items-center gap-3">
                <Icon size={16} className={color} />
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                  <p className={`text-xl font-black ${color}`}>{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Búsqueda */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={12} />
              <input type="text" placeholder="Buscar CWP, descripción, disciplina..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-brand-electric transition-all" />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={12} />
              <select value={filterDiscipline} onChange={e => setFilterDiscipline(e.target.value)}
                className="pl-8 pr-7 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none focus:border-brand-electric transition-all appearance-none">
                <option value="">Todas</option>
                {disciplineOptions.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
              {filtered.length}/{records.length}
            </span>
          </div>
        </div>

        {/* Tabla */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 gap-3 text-slate-400">
              <Loader2 className="animate-spin text-brand-electric" size={20} />
              <span className="text-xs font-bold italic">Cargando catálogo...</span>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100/90 backdrop-blur">
                <tr>
                  {['CWP', 'Descripción', 'Disciplina', 'EWP', 'PWP', 'Area', 'Tags', 'Activo', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {editingId === 'new' && (
                  <EditRow data={formData} onChange={setFormData} onSave={save} onCancel={cancelEdit} isSaving={isSaving} isNew />
                )}
                {filtered.length === 0 && editingId !== 'new' && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-300">
                      <Hash size={28} />
                      <p className="text-xs font-bold italic">
                        {records.length === 0 ? 'Catálogo vacío. Agrega CWPs o extrae desde tus datos.' : 'Sin resultados.'}
                      </p>
                    </div>
                  </td></tr>
                )}
                {filtered.map(rec =>
                  editingId === rec.id ? (
                    <EditRow key={rec.id} data={formData} onChange={setFormData} onSave={save} onCancel={cancelEdit} isSaving={isSaving} />
                  ) : (
                    <DataRow key={rec.id} rec={rec} onEdit={() => openEdit(rec)}
                      onDelete={() => setConfirmDelete(rec.id!)}
                      confirmDelete={confirmDelete === rec.id}
                      onConfirmDelete={() => deleteRecord(rec.id!)}
                      onCancelDelete={() => setConfirmDelete(null)} />
                  )
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          PANEL EXTRACTOR — desliza desde la derecha
      ══════════════════════════════════════════════════════ */}
      {showExtractor && (
        <div className="w-[45%] flex flex-col bg-brand-deep border-l border-white/5 overflow-hidden">

          {/* Header extractor */}
          <div className="shrink-0 px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles size={18} className="text-brand-electric" />
              <div>
                <h2 className="text-sm font-black italic text-white">Extraer desde datos</h2>
                <p className="text-[9px] font-bold text-white/40">Lee tus Excel subidos y extrae valores únicos</p>
              </div>
            </div>
            <button onClick={() => setShowExtractor(false)} className="p-1.5 text-white/30 hover:text-white rounded-lg transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">

            {/* Paso 1: Elegir entidad */}
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-white/40">
                1 · Elige el archivo Excel
              </label>
                <select value={extEntityId} onChange={e => { setExtEntityId(e.target.value); setExtractedRows([]); }}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white outline-none focus:border-brand-electric transition-all">
                  <option value="" className="bg-brand-deep text-white">Seleccionar archivo...</option>
                  {entities.map(e => <option key={e.id} value={e.id} className="bg-brand-deep text-white">{e.name}</option>)}
                </select>
            </div>

            {/* Paso 2: Mapeo de columnas */}
            {extEntityId && (
              <div className="space-y-3">
                <label className="text-[9px] font-black uppercase tracking-widest text-white/40">
                  2 · Mapear columnas
                </label>
                <div className="bg-white/5 rounded-2xl p-4 space-y-3">
                  {([
                    { field: 'cwp' as const,  label: 'CWP (obligatorio)', required: true,  color: 'text-brand-electric' },
                    { field: 'desc' as const, label: 'Descripción CWP',   required: false, color: 'text-white/70' },
                    { field: 'disc' as const, label: 'Disciplina',        required: false, color: 'text-white/70' },
                    { field: 'ewp' as const,  label: 'EWP',               required: false, color: 'text-emerald-400' },
                    { field: 'pwp' as const,  label: 'PWP',               required: false, color: 'text-amber-400' },
                    { field: 'area' as const, label: 'Area/Sector',       required: false, color: 'text-violet-400' },
                    { field: 'tags' as const, label: 'Tags/Coments',      required: false, color: 'text-blue-400' },
                  ]).map(({ field, label, required, color }) => (
                    <div key={field} className="flex items-center gap-3">
                      <span className={`w-36 text-[10px] font-black shrink-0 ${color}`}>{label}</span>
                      <ArrowRight size={12} className="text-white/20 shrink-0" />
                      <select value={colMap[field]}
                        onChange={e => setColMap(prev => ({ ...prev, [field]: e.target.value }))}
                        className={`flex-1 px-3 py-1.5 bg-white/5 border rounded-lg text-[10px] font-bold text-white outline-none focus:border-brand-electric transition-all ${
                          required && !colMap[field] ? 'border-rose-500/50' : 'border-white/10'
                        }`}>
                        <option value="" className="bg-brand-deep text-white">{required ? 'Obligatorio...' : 'No usar'}</option>
                        {entityColumns.map(c => <option key={c} value={c} className="bg-brand-deep text-white">{c}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                <button onClick={runExtraction} disabled={!colMap.cwp || isExtracting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-electric hover:bg-brand-electric/90 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-lg shadow-brand-electric/20 transition-all">
                  {isExtracting ? <Loader2 size={14} className="animate-spin" /> : <Table2 size={14} />}
                  {isExtracting ? 'Analizando...' : 'Analizar valores únicos'}
                </button>
              </div>
            )}

            {/* Paso 3: Tabla dinámica de valores únicos */}
            {extractedRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40">
                    3 · Valores únicos encontrados
                  </label>
                  <span className="text-[9px] font-black text-white/30">
                    {extractedRows.length} únicos · {extractedRows.filter(r => r.already_in_master).length} ya en catálogo
                  </span>
                </div>

                {/* Búsqueda en resultados */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={11} />
                  <input type="text" placeholder="Filtrar resultados..."
                    value={extSearch} onChange={e => setExtSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold text-white outline-none focus:border-brand-electric transition-all placeholder:text-white/20" />
                </div>

                {/* Tabla dinámica */}
                <div className="bg-white/5 rounded-2xl overflow-hidden border border-white/5">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="px-3 py-2.5 w-8">
                          <button onClick={toggleAll} className="text-white/30 hover:text-white transition-colors">
                            <CheckSquare size={13} />
                          </button>
                        </th>
                        <th className="px-2 py-2.5 text-[8px] font-black uppercase tracking-widest text-white/30">CWP</th>
                        {colMap.desc && <th className="px-2 py-2.5 text-[8px] font-black uppercase tracking-widest text-white/30">Desc.</th>}
                        {colMap.disc && <th className="px-2 py-2.5 text-[8px] font-black uppercase tracking-widest text-white/30">Disc.</th>}
                        {colMap.ewp && <th className="px-2 py-2.5 text-[8px] font-black uppercase tracking-widest text-white/30">EWP</th>}
                        {colMap.pwp && <th className="px-2 py-2.5 text-[8px] font-black uppercase tracking-widest text-white/30">PWP</th>}
                        {colMap.area && <th className="px-2 py-2.5 text-[8px] font-black uppercase tracking-widest text-white/30">Area</th>}
                        {colMap.tags && <th className="px-2 py-2.5 text-[8px] font-black uppercase tracking-widest text-white/30">Tags</th>}
                        <th className="px-2 py-2.5 text-[8px] font-black uppercase tracking-widest text-white/30 text-right">#</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExtracted.map(row => (
                        <tr key={row.cwp_code}
                          onClick={() => !row.already_in_master && toggleRow(row.cwp_code)}
                          className={`border-b border-white/5 transition-colors ${
                            row.already_in_master
                              ? 'opacity-40 cursor-not-allowed'
                              : row.selected
                                ? 'bg-brand-electric/15 cursor-pointer'
                                : 'hover:bg-white/5 cursor-pointer'
                          }`}>
                          <td className="px-3 py-2">
                            {row.already_in_master ? (
                              <CheckCircle2 size={13} className="text-emerald-400" />
                            ) : row.selected ? (
                              <CheckSquare size={13} className="text-brand-electric" />
                            ) : (
                              <Square size={13} className="text-white/20" />
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <span className="text-[10px] font-black text-brand-electric uppercase">{row.cwp_code}</span>
                          </td>
                          {colMap.desc && (
                            <td className="px-2 py-2 max-w-[120px]">
                              <span className="text-[9px] text-white/60 truncate block">{row.cwp_description || '—'}</span>
                            </td>
                          )}
                          {colMap.disc && (
                            <td className="px-2 py-2">
                              <span className="text-[9px] font-black text-white/80 uppercase">{row.discipline || '—'}</span>
                            </td>
                          )}
                          {colMap.ewp && (
                            <td className="px-2 py-2">
                              <span className="text-[9px] font-black text-emerald-400 uppercase">{row.ewp_code || '—'}</span>
                            </td>
                          )}
                          {colMap.pwp && (
                            <td className="px-2 py-2">
                              <span className="text-[9px] font-black text-amber-400 uppercase">{row.pwp_code || '—'}</span>
                            </td>
                          )}
                          {colMap.area && (
                            <td className="px-2 py-2">
                              <span className="text-[9px] font-black text-violet-300 uppercase">{row.area || '—'}</span>
                            </td>
                          )}
                          {colMap.tags && (
                            <td className="px-2 py-2">
                              <span className="text-[9px] text-blue-200 truncate block max-w-[80px]">{row.tags || '—'}</span>
                            </td>
                          )}
                          <td className="px-2 py-2 text-right">
                            <span className="text-[9px] font-black text-white/30">{row.row_count.toLocaleString()}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Botón agregar seleccionados */}
                {selectedCount > 0 && (
                  <button onClick={addSelectedToMaster} disabled={isAddingSelected}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-500/20 transition-all">
                    {isAddingSelected
                      ? <><Loader2 size={14} className="animate-spin" /> Agregando...</>
                      : <><CheckCircle2 size={14} /> Agregar {selectedCount} al catálogo maestro</>
                    }
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-8 right-8 flex items-center gap-3 px-5 py-3.5 rounded-3xl shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          <span className="text-xs font-black">{toast.text}</span>
        </div>
      )}
    </div>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function EditRow({ data, onChange, onSave, onCancel, isSaving, isNew = false }: {
  data: EditableFields; onChange: (d: EditableFields) => void;
  onSave: () => void; onCancel: () => void; isSaving: boolean; isNew?: boolean;
}) {
  const set = (f: keyof EditableFields, v: string | boolean) => onChange({ ...data, [f]: v });
  const cls = 'w-full px-2.5 py-1.5 bg-white border border-brand-electric/40 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-brand-electric transition-all';
  return (
    <tr className={`border-b border-brand-electric/20 ${isNew ? 'bg-brand-electric/5' : 'bg-brand-deep/5'}`}>
      <td className="px-3 py-2 w-28">
        <input type="text" value={data.cwp_code} onChange={e => set('cwp_code', e.target.value.toUpperCase())}
          placeholder="A-CIV-001" className={cls} autoFocus />
      </td>
      <td className="px-3 py-2">
        <input type="text" value={data.cwp_description} onChange={e => set('cwp_description', e.target.value)}
          placeholder="Descripción del CWP" className={cls} />
      </td>
      <td className="px-3 py-2 w-32">
        <input type="text" value={data.discipline} onChange={e => set('discipline', e.target.value.toUpperCase())}
          placeholder="CIVIL" className={cls} />
      </td>
      <td className="px-3 py-2 w-32">
        <input type="text" value={data.ewp_code} onChange={e => set('ewp_code', e.target.value.toUpperCase())}
          placeholder="EWP-001" className={cls} />
      </td>
      <td className="px-3 py-2 w-32">
        <input type="text" value={data.pwp_code} onChange={e => set('pwp_code', e.target.value.toUpperCase())}
          placeholder="PWP-001" className={cls} />
      </td>
      <td className="px-3 py-2 w-32">
        <input type="text" value={data.area} onChange={e => set('area', e.target.value.toUpperCase())}
          placeholder="AREA-1" className={cls} />
      </td>
      <td className="px-3 py-2 w-32">
        <input type="text" value={data.tags} onChange={e => set('tags', e.target.value)}
          placeholder="Tags..." className={cls} />
      </td>
      <td className="px-3 py-2 w-16">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={data.is_active} onChange={e => set('is_active', e.target.checked)}
            className="w-3.5 h-3.5 accent-brand-electric" />
          <span className="text-[9px] font-black text-slate-500">{data.is_active ? 'SI' : 'NO'}</span>
        </label>
      </td>
      <td className="px-3 py-2 w-24">
        <div className="flex items-center gap-1.5">
          <button onClick={onSave} disabled={isSaving || !data.cwp_code.trim()}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-brand-deep text-white text-[9px] font-black rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-all">
            {isSaving ? <Loader2 size={9} className="animate-spin" /> : <Save size={9} />} Guardar
          </button>
          <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg transition-colors">
            <X size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function DataRow({ rec, onEdit, onDelete, confirmDelete, onConfirmDelete, onCancelDelete }: {
  rec: CWPRecord; onEdit: () => void; onDelete: () => void;
  confirmDelete: boolean; onConfirmDelete: () => void; onCancelDelete: () => void;
}) {
  return (
    <tr className={`border-b border-slate-50 hover:bg-slate-50/80 transition-colors group ${!rec.is_active ? 'opacity-40' : ''}`}>
      <td className="px-4 py-2.5 min-w-[160px]">
        <span className="text-[11px] font-black text-brand-deep uppercase tracking-tighter whitespace-nowrap">{rec.cwp_code}</span>
      </td>
      <td className="px-4 py-2.5 w-32">
        <span className="text-[10px] font-bold text-slate-500">{rec.cwp_description || <span className="text-slate-300 italic">—</span>}</span>
      </td>
      <td className="px-4 py-2.5 w-28 text-center">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${rec.discipline && rec.discipline !== '—' ? 'bg-brand-electric/10 text-brand-electric' : 'text-slate-300 italic'}`}>
          {rec.discipline || 'Sin esp.'}
        </span>
      </td>
      <td className="px-4 py-2.5 w-24 text-center">
        <span className="text-[10px] font-black text-emerald-700 uppercase">{rec.ewp_code || <span className="text-slate-300">—</span>}</span>
      </td>
      <td className="px-4 py-2.5 w-24 text-center">
        <span className="text-[10px] font-black text-amber-700 uppercase">{rec.pwp_code || <span className="text-slate-300">—</span>}</span>
      </td>
      <td className="px-4 py-2.5 w-24 text-center">
        <span className="text-[10px] font-black text-violet-700 uppercase">{rec.area || <span className="text-slate-300">—</span>}</span>
      </td>
      <td className="px-4 py-2.5 w-28 text-center text-blue-600 font-bold text-[10px]">
        {rec.tags || <span className="text-slate-300">—</span>}
      </td>
      <td className="px-4 py-2.5 w-16 text-center">
        <span className={`text-[9px] font-black uppercase ${rec.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
          {rec.is_active ? 'SI' : 'NO'}
        </span>
      </td>
      <td className="px-4 py-2.5 w-24">
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button onClick={onConfirmDelete} className="text-[9px] font-black text-rose-600 hover:text-rose-800 uppercase">Confirmar</button>
            <span className="text-slate-200 text-[9px]">|</span>
            <button onClick={onCancelDelete} className="text-[9px] font-black text-slate-400 uppercase">No</button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-brand-electric rounded-lg transition-colors"><Edit2 size={12} /></button>
            <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg transition-colors"><Trash2 size={12} /></button>
          </div>
        )}
      </td>
    </tr>
  );
}
