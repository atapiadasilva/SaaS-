'use client';

import { use, useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Activity } from '@/components/awp/GanttChart';
import { getDiscColor } from '@/components/awp/GanttChart';
import dynamic from 'next/dynamic';
import {
  CalendarDays, Link2, ShieldAlert, Plus, X, Loader2,
  RefreshCw, ChevronRight, Clock, CheckCircle2, AlertTriangle,
  Circle, Flag, Unlink, BarChart3, TrendingUp,
} from 'lucide-react';
import {
  cleanDescription, DisciplineChart, ProgressDonut, AreaBreakdown,
  TagChips, FilterBar, type ActivityTag, type FilterState,
} from '@/components/awp/PlanCharts';

const GanttChart = dynamic(() => import('@/components/awp/GanttChart'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────
type ReqStatus   = 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
type ReqPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type ReqType     = 'PREREQUISITE' | 'ENGINEERING' | 'MATERIALS' | 'EQUIPMENT' | 'LABOR' | 'SAFETY';

interface BimLink   { id: string; bim_guid: string; element_name: string; element_type: string }
interface Requirement {
  id: string; description: string; type: ReqType;
  responsible: string; due_date: string; status: ReqStatus;
  priority: ReqPriority; comments: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<ReqStatus, { label: string; cls: string; icon: React.ElementType }> = {
  OPEN:        { label: 'Abierto',   cls: 'bg-red-100 text-red-700 border-red-200',     icon: Circle },
  IN_PROGRESS: { label: 'En Curso',  cls: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  CLOSED:      { label: 'Cerrado',   cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
};

const PRIORITY_CFG: Record<ReqPriority, { label: string; cls: string }> = {
  LOW:      { label: 'Baja',     cls: 'bg-slate-100 text-slate-500' },
  MEDIUM:   { label: 'Media',    cls: 'bg-sky-100 text-sky-600' },
  HIGH:     { label: 'Alta',     cls: 'bg-orange-100 text-orange-600' },
  CRITICAL: { label: 'Crítica',  cls: 'bg-red-100 text-red-700' },
};

const REQ_TYPES: ReqType[] = ['PREREQUISITE','ENGINEERING','MATERIALS','EQUIPMENT','LABOR','SAFETY'];
const REQ_TYPE_LABELS: Record<ReqType, string> = {
  PREREQUISITE: 'Prerrequisito', ENGINEERING: 'Ingeniería', MATERIALS: 'Materiales',
  EQUIPMENT: 'Equipos', LABOR: 'Mano de Obra', SAFETY: 'Seguridad',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function in90Days(activity: Activity): boolean {
  if (!activity.start_date && !activity.end_date) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  const horizon = new Date(today); horizon.setDate(today.getDate() + 90);
  const start = activity.start_date ? new Date(activity.start_date) : null;
  const end   = activity.end_date   ? new Date(activity.end_date)   : null;
  if (end   && end   < today)   return false;
  if (start && start > horizon) return false;
  return true;
}

// ─── New Requirement Modal ────────────────────────────────────────────────────
function NewRequirementModal({
  projectId, activityId, onClose, onSaved,
}: { projectId: string; activityId: string; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    description: '', type: 'PREREQUISITE' as ReqType,
    responsible: '', due_date: '', priority: 'MEDIUM' as ReqPriority, comments: '',
  });

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.description.trim()) return;
    setSaving(true);
    await (supabase as any).from('activity_requirements').insert({
      project_id: projectId, activity_id: activityId,
      description: form.description, type: form.type,
      responsible: form.responsible || null,
      due_date: form.due_date || null,
      priority: form.priority, status: 'OPEN',
      comments: form.comments || null,
    });
    onSaved(); onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <h3 className="font-black text-sm text-primary">Nuevo Requisito</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide">Descripción *</label>
            <textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              placeholder="Describe el requisito o restricción..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide">Tipo</label>
              <select value={form.type} onChange={e => set('type', e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                {REQ_TYPES.map(t => <option key={t} value={t}>{REQ_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide">Prioridad</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                {(Object.keys(PRIORITY_CFG) as ReqPriority[]).map(p => <option key={p} value={p}>{PRIORITY_CFG[p].label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide">Responsable</label>
              <input value={form.responsible} onChange={e => set('responsible', e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Nombre o cargo" />
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide">Fecha Compromiso</label>
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide">Comentarios</label>
            <input value={form.comments} onChange={e => set('comments', e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Opcional..." />
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-muted rounded-lg transition">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !form.description.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-sm font-black rounded-lg hover:bg-primary/90 transition disabled:opacity-50">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Guardar Requisito
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New BIM Link Modal ───────────────────────────────────────────────────────
function NewBimLinkModal({
  projectId, activityId, onClose, onSaved,
}: { projectId: string; activityId: string; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ bim_guid: '', element_name: '', element_type: '' });
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.bim_guid.trim()) return;
    setSaving(true);
    await (supabase as any).from('activity_bim_links').insert({
      project_id: projectId, activity_id: activityId,
      bim_guid: form.bim_guid.trim(),
      element_name: form.element_name || null,
      element_type: form.element_type || null,
    });
    onSaved(); onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            <h3 className="font-black text-sm text-primary">Vincular Elemento BIM</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide">GUID del Elemento *</label>
            <input value={form.bim_guid} onChange={e => set('bim_guid', e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="ej: 3abc123-..." />
            <p className="text-[10px] text-muted-foreground mt-1">Copia el GUID desde el Visor BIM al seleccionar un elemento.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide">Nombre</label>
              <input value={form.element_name} onChange={e => set('element_name', e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="ej: Viga HEB 300" />
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide">Tipo</label>
              <input value={form.element_type} onChange={e => set('element_type', e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="ej: Estructura" />
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-muted rounded-lg transition">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !form.bim_guid.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-sm font-black rounded-lg hover:bg-primary/90 transition disabled:opacity-50">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Vincular
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Activity Panel ───────────────────────────────────────────────────────────
function ActivityPanel({
  activity, projectId, bimLinks, requirements, onRefresh,
}: {
  activity: Activity; projectId: string;
  bimLinks: BimLink[]; requirements: Requirement[];
  onRefresh: () => void;
}) {
  const supabase = createClient();
  const [showBimModal, setShowBimModal] = useState(false);
  const [showReqModal, setShowReqModal] = useState(false);
  const today = new Date();

  const unlinkBim = async (linkId: string) => {
    await (supabase as any).from('activity_bim_links').delete().eq('id', linkId);
    onRefresh();
  };

  const cycleStatus = async (req: Requirement) => {
    const next: ReqStatus = req.status === 'OPEN' ? 'IN_PROGRESS' : req.status === 'IN_PROGRESS' ? 'CLOSED' : 'OPEN';
    await (supabase as any).from('activity_requirements').update({
      status: next,
      closed_date: next === 'CLOSED' ? new Date().toISOString().substring(0,10) : null,
    }).eq('id', req.id);
    onRefresh();
  };

  const openReqs = requirements.filter(r => r.status !== 'CLOSED').length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Activity header */}
      <div className="px-4 py-3 border-b border-border bg-primary/5">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-[10px] font-bold text-muted-foreground">{activity.wbs_code}</span>
          {activity.cwp_code && (
            <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-[9px] font-black rounded">{activity.cwp_code}</span>
          )}
          {activity.discipline && (
            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-black rounded">{activity.discipline}</span>
          )}
        </div>
        <p className="text-sm font-black text-primary leading-tight" title={activity.description}>{cleanDescription(activity.description)}</p>
        <div className="flex items-center gap-4 mt-2">
          <div className="text-[10px] text-slate-500">
            <span className="font-bold">Inicio:</span> {activity.start_date ? new Date(activity.start_date + 'T12:00:00').toLocaleDateString('es-CL') : '—'}
          </div>
          <div className="text-[10px] text-slate-500">
            <span className="font-bold">Fin:</span> {activity.end_date ? new Date(activity.end_date + 'T12:00:00').toLocaleDateString('es-CL') : '—'}
          </div>
          <div className="text-[10px] text-slate-500">
            <span className="font-bold">HH:</span> {activity.hh?.toLocaleString('es-CL') ?? '—'}
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${activity.progress ?? 0}%` }} />
          </div>
          <span className="text-[10px] font-black text-primary">{activity.progress ?? 0}%</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {/* BIM Links */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Link2 className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] font-black text-primary uppercase tracking-wide">Elementos BIM</span>
              <span className="text-[10px] font-bold text-muted-foreground">({bimLinks.length})</span>
            </div>
            <button onClick={() => setShowBimModal(true)}
              className="flex items-center gap-1 px-2.5 py-1 bg-primary text-white text-[10px] font-black rounded-lg hover:bg-primary/90 transition">
              <Plus className="w-3 h-3" /> Vincular
            </button>
          </div>
          {bimLinks.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic py-2">Sin elementos vinculados — usa el Visor BIM para copiar GUIDs.</p>
          ) : (
            <div className="space-y-1.5">
              {bimLinks.map(link => (
                <div key={link.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-blue-800 truncate">{link.element_name || 'Elemento sin nombre'}</p>
                    <p className="text-[9px] font-mono text-blue-400 truncate">{link.bim_guid}</p>
                  </div>
                  <button onClick={() => unlinkBim(link.id)} className="p-1 text-blue-300 hover:text-red-500 transition shrink-0">
                    <Unlink className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Requirements */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[11px] font-black text-primary uppercase tracking-wide">Requisitos</span>
              {openReqs > 0 && (
                <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[9px] font-black rounded-full">{openReqs} abiertos</span>
              )}
            </div>
            <button onClick={() => setShowReqModal(true)}
              className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 text-white text-[10px] font-black rounded-lg hover:bg-amber-600 transition">
              <Plus className="w-3 h-3" /> Levantar
            </button>
          </div>
          {requirements.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic py-2">Sin requisitos levantados para esta actividad.</p>
          ) : (
            <div className="space-y-2">
              {requirements.map(req => {
                const sc = STATUS_CFG[req.status];
                const pc = PRIORITY_CFG[req.priority];
                const Icon = sc.icon;
                const isOverdue = req.due_date && new Date(req.due_date) < today && req.status !== 'CLOSED';
                return (
                  <div key={req.id} className={`rounded-lg border p-3 space-y-1.5 ${isOverdue ? 'border-red-300 bg-red-50/50' : 'border-border bg-white'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] text-slate-700 leading-snug flex-1">{req.description}</p>
                      <button onClick={() => cycleStatus(req)} title="Cambiar estado"
                        className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-black transition hover:opacity-80 shrink-0 ${sc.cls}`}>
                        <Icon className="w-2.5 h-2.5" /> {sc.label}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${pc.cls}`}>{pc.label}</span>
                      <span className="text-[9px] text-muted-foreground">{REQ_TYPE_LABELS[req.type]}</span>
                      {req.responsible && <span className="text-[9px] text-slate-500 font-medium">{req.responsible}</span>}
                      {req.due_date && (
                        <span className={`text-[9px] font-bold ${isOverdue ? 'text-red-600' : 'text-slate-400'}`}>
                          {isOverdue && '⚠ '}{new Date(req.due_date + 'T12:00:00').toLocaleDateString('es-CL')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showBimModal && (
        <NewBimLinkModal projectId={projectId} activityId={activity.id} onClose={() => setShowBimModal(false)} onSaved={onRefresh} />
      )}
      {showReqModal && (
        <NewRequirementModal projectId={projectId} activityId={activity.id} onClose={() => setShowReqModal(false)} onSaved={onRefresh} />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function NinetyDaysPage({ params }: { params: Promise<{ org_slug: string; project_id: string }> }) {
  const { project_id } = use(params);
  const supabase = createClient();

  const [activities, setActivities]       = useState<Activity[]>([]);
  const [allBimLinks, setAllBimLinks]     = useState<BimLink[]>([]);
  const [allRequirements, setAllReqs]     = useState<Requirement[]>([]);
  const [allTags, setAllTags]             = useState<ActivityTag[]>([]);
  const [selected, setSelected]           = useState<Activity | null>(null);
  const [loading, setLoading]             = useState(true);
  const [showCharts, setShowCharts]       = useState(true);
  const [filters, setFilters]             = useState<FilterState>({
    discipline: 'ALL', area: 'ALL', tag: 'ALL', progressRange: 'ALL', onlyOpenReqs: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [actRes, linksRes, reqsRes] = await Promise.all([
      fetch(`/api/program?project_id=${project_id}`).then(r => r.json()),
      (supabase as any).from('activity_bim_links').select('*').eq('project_id', project_id),
      (supabase as any).from('activity_requirements').select('*').eq('project_id', project_id).order('created_at', { ascending: false }),
    ]);
    // Try loading tags (table may not exist yet)
    let tagsData: ActivityTag[] = [];
    try {
      const tagsRes = await fetch(`/api/activity-tags?project_id=${project_id}`);
      if (tagsRes.ok) tagsData = await tagsRes.json();
    } catch {}
    setActivities(actRes ?? []);
    setAllBimLinks(linksRes.data ?? []);
    setAllReqs(reqsRes.data ?? []);
    setAllTags(tagsData);
    setLoading(false);
  }, [project_id]);

  useEffect(() => { load(); }, [load]);

  // Filter to 90-day window
  const window90 = activities.filter(a => in90Days(a));

  // Derived filter options
  const disciplines = useMemo(() => [...new Set(activities.map(a => a.discipline).filter(Boolean))] as string[], [activities]);
  const areas = useMemo(() => {
    const set = new Set<string>();
    activities.forEach(a => { if (a.cwp_code) set.add(a.cwp_code.split('.').slice(0, 2).join('.')); });
    return [...set].sort();
  }, [activities]);
  const tagNames = useMemo(() => [...new Set(allTags.map(t => t.tag_name))], [allTags]);

  // Apply filters
  const filtered = useMemo(() => window90.filter(a => {
    if (filters.discipline !== 'ALL' && a.discipline !== filters.discipline) return false;
    if (filters.area !== 'ALL' && !a.cwp_code?.startsWith(filters.area)) return false;
    if (filters.tag !== 'ALL' && !allTags.some(t => t.activity_id === a.id && t.tag_name === filters.tag)) return false;
    if (filters.progressRange === '0' && a.progress !== 0) return false;
    if (filters.progressRange === '1-50' && (a.progress < 1 || a.progress > 50)) return false;
    if (filters.progressRange === '51-99' && (a.progress < 51 || a.progress > 99)) return false;
    if (filters.progressRange === '100' && a.progress !== 100) return false;
    if (filters.onlyOpenReqs) {
      const hasOpen = allRequirements.some(r => (r as any).activity_id === a.id && r.status !== 'CLOSED');
      if (!hasOpen) return false;
    }
    return true;
  }), [window90, filters, allTags, allRequirements]);

  // KPIs
  const today = new Date();
  const detailActs = window90.filter(a => !a.is_summary && !a.is_milestone);
  const totalHH = detailActs.reduce((s, a) => s + (a.hh || 0), 0);
  const completed = detailActs.filter(a => a.progress === 100).length;
  const notStarted = detailActs.filter(a => a.progress === 0).length;
  const inProgress = detailActs.filter(a => a.progress > 0 && a.progress < 100).length;
  const atRisk = detailActs.filter(a => {
    if (!a.end_date) return false;
    return new Date(a.end_date) < today && (a.progress ?? 0) < 100;
  }).length;
  const openReqs = allRequirements.filter(r => r.status === 'OPEN').length;

  // Chart data
  const discData = useMemo(() => {
    const map = new Map<string, { hh: number; count: number }>();
    detailActs.forEach(a => {
      if (!a.discipline) return;
      const cur = map.get(a.discipline) ?? { hh: 0, count: 0 };
      cur.hh += a.hh || 0; cur.count++; map.set(a.discipline, cur);
    });
    const total = [...map.values()].reduce((s, v) => s + v.hh, 0);
    return [...map.entries()].map(([d, v]) => ({ discipline: d, ...v, pct: total > 0 ? v.hh / total * 100 : 0 })).sort((a, b) => b.hh - a.hh);
  }, [activities]);

  const areaData = useMemo(() => {
    const map = new Map<string, { hh: number; count: number; totalProg: number }>();
    detailActs.forEach(a => {
      const area = a.cwp_code?.split('.').slice(0, 2).join('.') || 'Sin CWP';
      const cur = map.get(area) ?? { hh: 0, count: 0, totalProg: 0 };
      cur.hh += a.hh || 0; cur.count++; cur.totalProg += a.progress || 0; map.set(area, cur);
    });
    return [...map.entries()].map(([a, v]) => ({ area: a, ...v, avgProgress: v.count > 0 ? v.totalProg / v.count : 0 })).sort((a, b) => b.hh - a.hh);
  }, [activities]);

  const donutSegments = [
    { label: 'Completadas', value: completed, color: '#10B981' },
    { label: 'En curso', value: inProgress, color: '#F59E0B' },
    { label: 'Sin iniciar', value: notStarted, color: '#94A3B8' },
    { label: 'Vencidas', value: atRisk, color: '#EF4444' },
  ];

  // Tag management
  const addTag = async (actId: string, name: string, color: string) => {
    try {
      await fetch('/api/activity-tags', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id, activity_id: actId, tag_name: name, tag_color: color }),
      });
      load();
    } catch {}
  };
  const removeTag = async (tagId: string) => {
    try { await fetch(`/api/activity-tags?id=${tagId}`, { method: 'DELETE' }); load(); } catch {}
  };

  // Selected activity data
  const selBimLinks = selected ? allBimLinks.filter(l => l.activity_id === selected.id) : [];
  const selReqs     = selected ? allRequirements.filter(r => r.activity_id === selected.id) : [];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] gap-0">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-black text-primary leading-none">Plan 90 Días</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {new Date().toLocaleDateString('es-CL', { day:'numeric', month:'long' })} →{' '}
              {new Date(Date.now() + 90*864e5).toLocaleDateString('es-CL', { day:'numeric', month:'long', year:'numeric' })}
            </p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-muted transition">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-6 gap-3 mb-4 shrink-0">
        {[
          { label: 'En ventana', value: detailActs.length, sub: `${totalHH.toLocaleString('es-CL', {maximumFractionDigits:0})} HH`, color: 'text-primary', bg: 'bg-primary/5' },
          { label: 'Completadas', value: completed, sub: `${detailActs.length > 0 ? Math.round(completed/detailActs.length*100) : 0}%`, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'En curso', value: inProgress, sub: `${detailActs.length > 0 ? Math.round(inProgress/detailActs.length*100) : 0}%`, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Sin iniciar', value: notStarted, sub: `${detailActs.length > 0 ? Math.round(notStarted/detailActs.length*100) : 0}%`, color: 'text-slate-500', bg: 'bg-slate-50' },
          { label: 'Vencidas', value: atRisk, sub: 'riesgo', color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Requisitos', value: openReqs, sub: 'abiertos', color: 'text-violet-600', bg: 'bg-violet-50' },
        ].map(({ label, value, sub, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-3 border border-border`}>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-black ${color} mt-0.5 leading-none`}>{value}</p>
            <p className="text-[9px] font-bold text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Analytics Charts ──────────────────────────────────────────── */}
      <div className="shrink-0 mb-4">
        <button onClick={() => setShowCharts(v => !v)}
          className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 hover:text-slate-600 transition">
          <BarChart3 className="w-3.5 h-3.5" />
          {showCharts ? 'Ocultar' : 'Mostrar'} Análisis
          <TrendingUp className="w-3 h-3" />
        </button>
        {showCharts && (
          <div className="grid grid-cols-3 gap-3">
            <DisciplineChart data={discData} onFilter={d => setFilters(f => ({ ...f, discipline: d === f.discipline ? 'ALL' : (d ?? 'ALL') }))} />
            <ProgressDonut segments={donutSegments} total={detailActs.length} centerLabel="Actividades" />
            <AreaBreakdown data={areaData} onFilter={a => setFilters(f => ({ ...f, area: a === f.area ? 'ALL' : (a ?? 'ALL') }))} />
          </div>
        )}
      </div>

      {/* ── Main area: panel + gantt ────────────────────────────────────── */}
      <div className="flex flex-1 gap-4 min-h-0">

        {/* Left: Activity Panel */}
        <div className="w-80 shrink-0 bg-white rounded-xl border border-border overflow-hidden flex flex-col">
          {selected ? (
            <>
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30 shrink-0">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wide">Actividad Seleccionada</span>
                <button onClick={() => setSelected(null)} className="p-1 rounded hover:bg-muted transition">
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ActivityPanel
                  activity={selected} projectId={project_id}
                  bimLinks={selBimLinks} requirements={selReqs}
                  onRefresh={load}
                />
                {/* Tags section */}
                <div className="p-4 border-t border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Flag className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-[11px] font-black text-primary uppercase tracking-wide">Categorías</span>
                  </div>
                  <TagChips
                    tags={allTags.filter(t => t.activity_id === selected.id)}
                    onRemove={removeTag}
                    onAdd={(name, color) => addTag(selected.id, name, color)}
                    availableTags={tagNames}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
              <ChevronRight className="w-10 h-10 text-muted-foreground/20" />
              <p className="text-sm font-black text-slate-400">Selecciona una actividad en el Gantt</p>
              <p className="text-[11px] text-muted-foreground">Podrás vincular elementos BIM, levantar requisitos y asignar categorías.</p>
            </div>
          )}
        </div>

        {/* Right: Gantt */}
        <div className="flex-1 bg-white rounded-xl border border-border overflow-hidden flex flex-col min-w-0">
          {/* Gantt toolbar with advanced filters */}
          <div className="px-4 py-2.5 border-b border-border shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <FilterBar filters={filters} onChange={setFilters} disciplines={disciplines} areas={areas} tagNames={tagNames} />
              <span className="ml-4 text-[10px] text-muted-foreground font-bold shrink-0">
                {filtered.length} act · {selected ? `"${cleanDescription(selected.description).substring(0, 25)}…"` : '—'}
              </span>
            </div>
          </div>

          {/* Gantt chart */}
          <div className="flex-1 overflow-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <AlertTriangle className="w-10 h-10 opacity-20" />
                <p className="text-sm font-semibold">No hay actividades en los próximos 90 días</p>
                <p className="text-[11px]">Importa el programa en el módulo Programa Maestro.</p>
              </div>
            ) : (
              <GanttChart
                activities={filtered}
                onActivityClick={(act) => setSelected(act)}
                selectedActivityId={selected?.id}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
