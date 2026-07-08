'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2, ChevronDown, ChevronRight, Plus, X, Search,
  Maximize2, Minimize2, TrendingUp, Diamond, Flame, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface PAct {
  id: string; cwp_id: string | null; cod_actividad: string; nombre_actividad: string;
  hh: number; fecha_inicio: string | null; fecha_fin: string | null;
  tipo: string; wbs: string | null; sector: string | null;
  cantidad: number | null; unidad: string | null; duracion_dias: number | null;
}
interface PCwp {
  cwp_id: string; cwp_nombre: string; cwa_id: string | null; cv_id: string | null;
  disciplina_cod: string | null; disciplina: string | null; hh_planner: number | null;
  fecha_ini: string | null; fecha_fin: string | null; ruta_critica: boolean | null;
  fecha_ifc: string | null; status_cwp: string | null; costo_oferta_clp: number | null;
  hito_contractual: string | null;
}
interface PCwa { cwa_id: string; cwa_nombre: string | null; }
interface PIwpAct { programa_id: string; hh_asignadas_iwp: number | null; }
interface PIwp {
  iwp_id: string; cwp_id: string; descripcion: string | null; status: string;
  hh_estimadas: number; avance_fisico_pct: number;
  fecha_inicio_plan: string | null; fecha_fin_plan: string | null; crew_size: number | null;
  actividades: PIwpAct[]; constraints: { total: number; despejados: number };
}

type Vista = 'wbs' | 'cwp';
type Escala = 'año' | 'mes' | 'semana';

type Row =
  | { kind: 'group'; key: string; level: number; label: string; start: number | null; end: number | null; hh: number; nTasks: number }
  | { kind: 'cwp';   key: string; level: number; cwp: PCwp; start: number | null; end: number | null; hh: number; acts: PAct[]; iwps: PIwp[] }
  | { kind: 'task';  key: string; level: number; act: PAct; critico: boolean }
  | { kind: 'hito';  key: string; level: number; act: PAct }
  | { kind: 'iwp';   key: string; level: number; iwp: PIwp };

// ─── Helpers ─────────────────────────────────────────────────────────────────
const DAY = 86_400_000;
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const toMs = (s: string) => +new Date(s + 'T00:00:00');
const fn = (v: number) => Math.round(v).toLocaleString('es-CL');
const fd = (s: string | null) => s ? s.slice(8, 10) + '-' + MESES[+s.slice(5, 7) - 1] + '-' + s.slice(2, 4) : '—';

const PX_DIA: Record<Escala, number> = { año: 1.15, mes: 2.6, semana: 6.5 };
const LEFT_W = 680;
const fdms = (ms: number | null) => ms === null ? '—' : fd(new Date(ms).toISOString().slice(0, 10));

// Disciplina canónica detectada en el WBS de Primavera
const DISC_TOKENS: [string, string][] = [
  ['OBRAS CIVILES', 'Obras Civiles'], ['CIVIL', 'Obras Civiles'],
  ['ESTRUCTURA', 'Estructuras'], ['MOV. TIERRA', 'Mov. de Tierras'],
  ['MECÁNICA', 'Mecánica'], ['MECANICA', 'Mecánica'],
  ['PIPING', 'Piping'], ['CAÑERÍA', 'Piping'],
  ['ELECTRIC', 'Electricidad'], ['ELÉCTRIC', 'Electricidad'],
  ['INSTRUMENT', 'Instrumentación'],
  ['ARQUITECTURA', 'Arquitectura'],
];
function discOf(txt: string | null | undefined): string {
  const t = (txt ?? '').toUpperCase();
  for (const [k, label] of DISC_TOKENS) if (t.includes(k)) return label;
  return 'Otras';
}
const H_GROUP = 26, H_TASK = 21, H_IWP = 19, H_CWP = 26;

// Color por disciplina detectada en el WBS / nombre de disciplina del CWP
const DISC_COLORS: [string, string][] = [
  ['OBRAS CIVILES', '#8D6E63'], ['CIVIL', '#8D6E63'],
  ['ESTRUCTURA', '#546E7A'], ['MOV. TIERRA', '#795548'],
  ['MECÁNICA', '#E65100'], ['MECANICA', '#E65100'],
  ['PIPING', '#00838F'], ['CAÑERÍA', '#00838F'],
  ['ELECTRICIDAD', '#6A1B9A'], ['ELÉCTRIC', '#6A1B9A'],
  ['INSTRUMENTACIÓN', '#00695C'], ['INSTRUMENTACION', '#00695C'],
  ['ARQUITECTURA', '#AD1457'],
];
function discColor(txt: string | null | undefined): string {
  const t = (txt ?? '').toUpperCase();
  for (const [k, c] of DISC_COLORS) if (t.includes(k)) return c;
  return '#757575';
}

const IWP_BAR: Record<string, string> = {
  PLANIFICADO: '#BDBDBD', LISTO_PARA_TRABAJO: '#FF0000',
  EN_EJECUCION: '#F59E0B', COMPLETADO: '#16A34A', HOLD: '#64748B',
};
const IWP_LABEL: Record<string, string> = {
  PLANIFICADO: 'Planificado', LISTO_PARA_TRABAJO: 'Listo para trabajo',
  EN_EJECUCION: 'En ejecución', COMPLETADO: 'Completado', HOLD: 'En espera',
};

// ─── Nodo del árbol WBS ──────────────────────────────────────────────────────
interface WbsNode { label: string; children: Map<string, WbsNode>; acts: PAct[]; }

// ═════════════════════════════════════════════════════════════════════════════
export default function PlanificacionPage() {
  const params = useParams();
  const projectId = params.project_id as string;

  const [acts, setActs] = useState<PAct[] | null>(null);
  const [cwps, setCwps] = useState<PCwp[]>([]);
  const [cwas, setCwas] = useState<PCwa[]>([]);
  const [iwps, setIwps] = useState<PIwp[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [vista, setVista] = useState<Vista>('cwp');
  const [escala, setEscala] = useState<Escala>('mes');
  const [showCurva, setShowCurva] = useState(true);
  const [search, setSearch] = useState('');
  const [discFilter, setDiscFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [iwpModal, setIwpModal] = useState<{ cwp: PCwp; acts: PAct[]; iwps: PIwp[] } | null>(null);
  const [cwpModal, setCwpModal] = useState<{ act: PAct } | null>(null);

  const loadData = (showError = true) => {
    fetch(`/api/mining-planificacion?project_id=${projectId}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`); return d; })
      .then(d => { setActs(d.actividades ?? []); setCwps(d.cwps ?? []); setCwas(d.cwas ?? []); })
      .catch(e => { if (showError) setError(e.message); });
  };

  const loadIwps = () => {
    fetch(`/api/mining-iwp?project_id=${projectId}`)
      .then(r => r.json()).then(d => setIwps(d.rows ?? [])).catch(() => {});
  };

  useEffect(() => {
    loadData(true);
    loadIwps();
  }, [projectId]);

  // ── HH asignadas a IWP por actividad del programa ──
  const hhAsignada = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of iwps) for (const a of i.actividades ?? [])
      m.set(a.programa_id, (m.get(a.programa_id) ?? 0) + Number(a.hh_asignadas_iwp ?? 0));
    return m;
  }, [iwps]);

  const iwpsByCwp = useMemo(() => {
    const m = new Map<string, PIwp[]>();
    for (const i of iwps) { const arr = m.get(i.cwp_id) ?? []; arr.push(i); m.set(i.cwp_id, arr); }
    return m;
  }, [iwps]);

  // ── Opciones y aplicación de filtros (disciplina desde el WBS, área = sector P6) ──
  const discOptions = useMemo(() => {
    const s = new Set<string>();
    for (const a of acts ?? []) s.add(discOf(a.wbs));
    return [...s].sort();
  }, [acts]);

  const areaOptions = useMemo(() => {
    const s = new Set<string>();
    for (const a of acts ?? []) s.add(a.sector ?? '—');
    return [...s].sort();
  }, [acts]);

  const filtering = !!(search.trim() || discFilter || areaFilter);
  const actsF = useMemo(() => {
    if (!acts) return null;
    const q = search.trim().toLowerCase();
    return acts.filter(a =>
      (!q || a.nombre_actividad.toLowerCase().includes(q) || a.cod_actividad.toLowerCase().includes(q) || (a.cwp_id ?? '').toLowerCase().includes(q)) &&
      (!discFilter || discOf(a.wbs) === discFilter) &&
      (!areaFilter || (a.sector ?? '—') === areaFilter)
    );
  }, [acts, search, discFilter, areaFilter]);

  // ── Rango temporal (redondeado a mes) ──
  const rango = useMemo(() => {
    const dated = (acts ?? []).filter(a => a.fecha_inicio && a.fecha_fin);
    if (!dated.length) return null;
    let min = Math.min(...dated.map(a => toMs(a.fecha_inicio!)));
    let max = Math.max(...dated.map(a => toMs(a.fecha_fin!)));
    for (const i of iwps) {
      if (i.fecha_inicio_plan) min = Math.min(min, toMs(i.fecha_inicio_plan));
      if (i.fecha_fin_plan) max = Math.max(max, toMs(i.fecha_fin_plan));
    }
    const d0 = new Date(min); const t0 = +new Date(d0.getFullYear(), d0.getMonth(), 1);
    const d1 = new Date(max); const t1 = +new Date(d1.getFullYear(), d1.getMonth() + 1, 1);
    return { t0, t1 };
  }, [acts, iwps]);

  const pxd = PX_DIA[escala];
  const timelineW = rango ? Math.ceil((rango.t1 - rango.t0) / DAY) * pxd : 0;
  const x = (ms: number) => rango ? ((ms - rango.t0) / DAY) * pxd : 0;

  const months = useMemo(() => {
    if (!rango) return [];
    const out: { label: string; x: number; w: number; year: number }[] = [];
    let cur = new Date(rango.t0);
    while (+cur < rango.t1) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      out.push({ label: MESES[cur.getMonth()], x: x(+cur), w: x(Math.min(+next, rango.t1)) - x(+cur), year: cur.getFullYear() });
      cur = next;
    }
    return out;
  }, [rango, pxd]);

  const todayMs = +new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
  const todayX = rango && todayMs >= rango.t0 && todayMs <= rango.t1 ? x(todayMs) : null;

  // ── Curva S: HH plan acumuladas + HH cubiertas por IWP, y barras mensuales ──
  const curva = useMemo(() => {
    if (!rango || !actsF) return null;
    const tareas = actsF.filter(a => a.tipo === 'Tarea' && a.hh > 0 && a.fecha_inicio && a.fecha_fin);
    if (!tareas.length) return null;
    const nW = Math.ceil((rango.t1 - rango.t0) / (7 * DAY));
    const plan = new Array(nW + 1).fill(0);
    const cov = new Array(nW + 1).fill(0);
    const porMes = new Map<number, number>();
    for (const a of tareas) {
      const s = toMs(a.fecha_inicio!), e = toMs(a.fecha_fin!);
      const days = Math.max(1, (e - s) / DAY + 1);
      const rate = a.hh / days;
      const rateCov = (hhAsignada.get(a.id) ?? 0) / days;
      for (let d = s; d <= e; d += DAY) {
        const w = Math.min(nW, Math.max(0, Math.floor((d - rango.t0) / (7 * DAY))));
        plan[w] += rate; cov[w] += rateCov;
        const dd = new Date(d); const mk = dd.getFullYear() * 12 + dd.getMonth();
        porMes.set(mk, (porMes.get(mk) ?? 0) + rate);
      }
    }
    const totalHH = plan.reduce((s, v) => s + v, 0) || 1;
    let accP = 0, accC = 0;
    const pts = plan.map((v, w) => {
      accP += v; accC += cov[w];
      return { ms: rango.t0 + (w + 1) * 7 * DAY, plan: accP / totalHH, cov: accC / totalHH };
    });
    const meses = [...porMes.entries()].map(([mk, hh]) => ({
      ms: +new Date(Math.floor(mk / 12), mk % 12, 1),
      msEnd: +new Date(Math.floor(mk / 12), mk % 12 + 1, 1),
      hh,
    }));
    const peak = Math.max(...meses.map(m => m.hh));
    return { pts, meses, peak, totalHH };
  }, [rango, actsF, hhAsignada]);

  // ── Filas según vista ──
  const cwaName = useMemo(() => new Map(cwas.map(c => [c.cwa_id, c.cwa_nombre ?? ''])), [cwas]);

  const rows = useMemo<Row[]>(() => {
    if (!actsF) return [];

    const out: Row[] = [];

    if (vista === 'wbs') {
      // Árbol desde la ruta WBS de Primavera ("A > B > C")
      const root: WbsNode = { label: '', children: new Map(), acts: [] };
      for (const a of actsF) {
        const segs = (a.wbs ?? 'SIN WBS').split(' > ').map(s => s.trim()).filter(Boolean);
        let node = root;
        for (const s of segs) {
          if (!node.children.has(s)) node.children.set(s, { label: s, children: new Map(), acts: [] });
          node = node.children.get(s)!;
        }
        node.acts.push(a);
      }
      const walk = (node: WbsNode, level: number, path: string) => {
        const agg = (n: WbsNode): { start: number | null; end: number | null; hh: number; nT: number } => {
          let start: number | null = null, end: number | null = null, hh = 0, nT = 0;
          for (const a of n.acts) {
            if (a.fecha_inicio) start = start === null ? toMs(a.fecha_inicio) : Math.min(start, toMs(a.fecha_inicio));
            if (a.fecha_fin) end = end === null ? toMs(a.fecha_fin) : Math.max(end, toMs(a.fecha_fin));
            if (a.tipo === 'Tarea') { hh += a.hh; nT++; }
          }
          for (const c of n.children.values()) {
            const r = agg(c);
            if (r.start !== null) start = start === null ? r.start : Math.min(start, r.start);
            if (r.end !== null) end = end === null ? r.end : Math.max(end, r.end);
            hh += r.hh; nT += r.nT;
          }
          return { start, end, hh, nT };
        };
        for (const [seg, child] of child_sorted(node)) {
          const key = path + '|' + seg;
          const { start, end, hh, nT } = agg(child);
          out.push({ kind: 'group', key, level, label: seg, start, end, hh, nTasks: nT });
          if (isCollapsed(key)) continue;
          walk(child, level + 1, key);
          const sorted = [...child.acts].sort((a, b) => (a.fecha_inicio ?? '').localeCompare(b.fecha_inicio ?? ''));
          for (const a of sorted) {
            if (a.tipo !== 'Tarea' || a.hh <= 0) out.push({ kind: 'hito', key: 'h' + a.id, level: level + 1, act: a });
            else out.push({ kind: 'task', key: a.id, level: level + 1, act: a, critico: false });
          }
        }
      };
      const child_sorted = (n: WbsNode) => [...n.children.entries()];
      const isCollapsed = (key: string) => allCollapsed ? !collapsed.has(key) : collapsed.has(key);
      walk(root, 0, '');
      return out;
    }

    // ── Vista CWP: CWA → CWP → (actividades + IWPs) ──
    const actsByCwp = new Map<string, PAct[]>();
    for (const a of actsF) {
      const k = a.cwp_id ?? '—';
      const arr = actsByCwp.get(k) ?? []; arr.push(a); actsByCwp.set(k, arr);
    }
    const cwpsConData = cwps
      .filter(c => actsByCwp.has(c.cwp_id) || (!filtering && (iwpsByCwp.get(c.cwp_id)?.length ?? 0) > 0))
      .sort((a, b) => (a.fecha_ini ?? '9').localeCompare(b.fecha_ini ?? '9'));
    const byCwa = new Map<string, PCwp[]>();
    for (const c of cwpsConData) {
      const k = c.cwa_id ?? '—';
      const arr = byCwa.get(k) ?? []; arr.push(c); byCwa.set(k, arr);
    }
    const isCollapsed = (key: string) => allCollapsed ? !collapsed.has(key) : collapsed.has(key);

    for (const [cwaId, list] of [...byCwa.entries()].sort()) {
      let gS: number | null = null, gE: number | null = null, gHH = 0, gN = 0;
      for (const c of list) {
        const cActs = actsByCwp.get(c.cwp_id) ?? [];
        for (const a of cActs) {
          if (a.fecha_inicio) gS = gS === null ? toMs(a.fecha_inicio) : Math.min(gS, toMs(a.fecha_inicio));
          if (a.fecha_fin) gE = gE === null ? toMs(a.fecha_fin) : Math.max(gE, toMs(a.fecha_fin));
          if (a.tipo === 'Tarea') { gHH += a.hh; gN++; }
        }
      }
      const gKey = 'cwa|' + cwaId;
      out.push({ kind: 'group', key: gKey, level: 0, label: `CWA ${cwaId} — ${cwaName.get(cwaId) ?? ''}`, start: gS, end: gE, hh: gHH, nTasks: gN });
      if (isCollapsed(gKey)) continue;

      for (const c of list) {
        const cActs = (actsByCwp.get(c.cwp_id) ?? []).sort((a, b) => (a.fecha_inicio ?? '').localeCompare(b.fecha_inicio ?? ''));
        const tareas = cActs.filter(a => a.tipo === 'Tarea' && a.hh > 0);
        let s: number | null = null, e: number | null = null;
        for (const a of cActs) {
          if (a.fecha_inicio) s = s === null ? toMs(a.fecha_inicio) : Math.min(s, toMs(a.fecha_inicio));
          if (a.fecha_fin) e = e === null ? toMs(a.fecha_fin) : Math.max(e, toMs(a.fecha_fin));
        }
        const hh = tareas.reduce((sum, a) => sum + a.hh, 0);
        const cKey = 'cwp|' + c.cwp_id;
        const cIwps = iwpsByCwp.get(c.cwp_id) ?? [];
        out.push({ kind: 'cwp', key: cKey, level: 1, cwp: c, start: s, end: e, hh, acts: tareas, iwps: cIwps });
        if (isCollapsed(cKey)) continue;
        for (const a of cActs) {
          if (a.tipo !== 'Tarea' || a.hh <= 0) out.push({ kind: 'hito', key: 'h' + a.id, level: 2, act: a });
          else out.push({ kind: 'task', key: a.id, level: 2, act: a, critico: !!c.ruta_critica });
        }
        for (const i of cIwps) out.push({ kind: 'iwp', key: 'i' + i.iwp_id, level: 2, iwp: i });
      }
    }
    return out;
  }, [actsF, cwps, vista, filtering, collapsed, allCollapsed, iwpsByCwp, cwaName]);

  const toggle = (key: string) => setCollapsed(prev => {
    const n = new Set(prev);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  // ── KPIs ──
  const kpi = useMemo(() => {
    const tareas = (actsF ?? []).filter(a => a.tipo === 'Tarea' && a.hh > 0);
    const hhTotal = tareas.reduce((s, a) => s + a.hh, 0);
    const hhIwp = iwps.reduce((s, i) => s + (i.hh_estimadas ?? 0), 0);
    const criticos = cwps.filter(c => c.ruta_critica).length;
    return {
      hhTotal, nActs: tareas.length, nIwps: iwps.length, hhIwp,
      pctIwp: hhTotal ? Math.round((hhIwp / hhTotal) * 100) : 0,
      criticos, peak: curva?.peak ?? 0,
    };
  }, [actsF, iwps, cwps, curva]);

  // ─────────────────────────────────────────────────────────────────────────
  if (error) return <div className="text-[#A00000] text-[13px] p-8">{error}</div>;
  if (!acts || !rango) return (
    <div className="flex items-center justify-center gap-2 py-24 text-[#757575] text-[13px]">
      <Loader2 className="w-4 h-4 animate-spin text-[#FF0000]" /> Cargando programa…
    </div>
  );

  const curvaH = 130;

  return (
    <div className="-m-6 h-[calc(100%+3rem)] flex flex-col bg-white">
      {/* ── Header del módulo ── */}
      <div className="px-6 pt-4 pb-3 border-b border-[#EEEEEE] shrink-0">
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <h1 className="font-display text-[20px] font-bold text-[#1A1A1A] leading-tight">
              PLANIFICACIÓN <span className="text-[#FF0000]">P333</span>
            </h1>
            <p className="text-[10.5px] text-[#757575]">Programa contractual Rev E · {kpi.nActs} actividades · sin modelo, solo el hilo del plan</p>
          </div>

          {/* KPIs */}
          <div className="flex gap-6 ml-auto flex-wrap">
            <Kpi v={fn(kpi.hhTotal)} l="HH programa" />
            <Kpi v={fn(kpi.peak)} l="HH mes pico" />
            <Kpi v={`${kpi.nIwps} · ${kpi.pctIwp}%`} l="IWP · HH cubiertas" accent />
            <Kpi v={String(kpi.criticos)} l="CWP ruta crítica" icon={<Flame className="w-3 h-3 text-[#FF0000]" />} />
          </div>
        </div>

        {/* Controles */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <div className="flex rounded-full border border-[#E0E0E0] overflow-hidden">
            {([['cwp', 'Por CWP · IWP'], ['wbs', 'Programa contractual']] as [Vista, string][]).map(([v, l]) => (
              <button key={v} onClick={() => { setVista(v); setCollapsed(new Set()); setAllCollapsed(false); }}
                className={cn('px-4 py-1.5 text-[11px] font-bold transition',
                  vista === v ? 'bg-[#FF0000] text-white' : 'text-[#757575] hover:text-[#A00000]')}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex rounded-full border border-[#E0E0E0] overflow-hidden">
            {(['año', 'mes', 'semana'] as Escala[]).map(s => (
              <button key={s} onClick={() => setEscala(s)}
                className={cn('px-3 py-1.5 text-[11px] font-bold capitalize transition',
                  escala === s ? 'bg-[#1A1A1A] text-white' : 'text-[#757575] hover:text-[#1A1A1A]')}>
                {s}
              </button>
            ))}
          </div>
          <button onClick={() => setShowCurva(v => !v)}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition',
              showCurva ? 'border-[#FF0000] text-[#FF0000] bg-red-50' : 'border-[#E0E0E0] text-[#757575]')}>
            <TrendingUp className="w-3 h-3" /> Curva S
          </button>
          <button onClick={() => { setAllCollapsed(v => !v); setCollapsed(new Set()); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border border-[#E0E0E0] text-[#757575] hover:text-[#1A1A1A] transition">
            {allCollapsed ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
            {allCollapsed ? 'Expandir todo' : 'Contraer todo'}
          </button>

          {/* Filtros disciplina / área */}
          <select value={discFilter} onChange={e => setDiscFilter(e.target.value)}
            className={cn('px-3 py-1.5 rounded-full text-[11px] font-bold border bg-white focus:outline-none cursor-pointer transition',
              discFilter ? 'border-[#FF0000] text-[#A00000] bg-red-50' : 'border-[#E0E0E0] text-[#757575]')}>
            <option value="">Disciplina: todas</option>
            {discOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)}
            className={cn('px-3 py-1.5 rounded-full text-[11px] font-bold border bg-white focus:outline-none cursor-pointer transition',
              areaFilter ? 'border-[#FF0000] text-[#A00000] bg-red-50' : 'border-[#E0E0E0] text-[#757575]')}>
            <option value="">Área: todas</option>
            {areaOptions.map(s => <option key={s} value={s}>Área {s}</option>)}
          </select>
          {(discFilter || areaFilter) && (
            <button onClick={() => { setDiscFilter(''); setAreaFilter(''); }}
              className="text-[10px] font-bold text-[#A00000] hover:underline">Limpiar filtros</button>
          )}

          <div className="relative ml-auto">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#BDBDBD]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar actividad, código o CWP…"
              className="pl-8 pr-3 py-1.5 rounded-full border border-[#E0E0E0] text-[11px] w-[240px] focus:outline-none focus:border-[#FF0000]/60 bg-white" />
          </div>
        </div>
      </div>

      {/* ── Gantt ── */}
      <div className="flex-1 overflow-auto relative">
        <div style={{ width: LEFT_W + timelineW, minWidth: '100%' }}>

          {/* Header de meses (sticky top) */}
          <div className="sticky top-0 z-30 flex bg-white border-b-2 border-[#FF0000]" style={{ height: 40 }}>
            <div className="sticky left-0 z-40 bg-white border-r border-[#EEEEEE] flex items-end px-3 pb-1 shrink-0 gap-2" style={{ width: LEFT_W }}>
              <span className="text-[9px] font-black uppercase tracking-[0.15em] text-[#BDBDBD] flex-1">Actividad / paquete</span>
              <span className="text-[9px] font-black uppercase tracking-[0.15em] text-[#BDBDBD] w-[62px] text-center">CWP</span>
              <span className="text-[9px] font-black uppercase tracking-[0.15em] text-[#BDBDBD] w-[50px] text-right">HH</span>
              <span className="text-[9px] font-black uppercase tracking-[0.15em] text-[#BDBDBD] w-[52px] text-right">Inicio</span>
              <span className="text-[9px] font-black uppercase tracking-[0.15em] text-[#BDBDBD] w-[52px] text-right">Fin</span>
            </div>
            <div className="relative" style={{ width: timelineW }}>
              {months.map((m, i) => (
                <div key={i} className="absolute bottom-0 top-0 border-r border-[#EEEEEE] flex flex-col justify-end pb-1"
                  style={{ left: m.x, width: m.w }}>
                  {(i === 0 || m.label === 'Ene') && (
                    <span className="absolute top-1 left-1 text-[9px] font-black text-[#FF0000]">{m.year}</span>
                  )}
                  <span className="text-[9.5px] font-bold text-[#757575] text-center truncate">{m.label}</span>
                </div>
              ))}
              {todayX !== null && <div className="absolute top-0 bottom-0 w-[2px] bg-[#FF0000] z-10" style={{ left: todayX }} />}
            </div>
          </div>

          {/* Curva S (sticky bajo el header) */}
          {showCurva && curva && (
            <div className="sticky z-20 flex bg-white border-b border-[#EEEEEE]" style={{ top: 40, height: curvaH }}>
              <div className="sticky left-0 z-30 bg-white border-r border-[#EEEEEE] shrink-0 px-3 py-2 flex flex-col justify-center gap-1.5 min-w-max" style={{ width: LEFT_W }}>
                <div className="font-display text-[12px] font-bold text-[#1A1A1A]">CURVA S <span className="text-[#FF0000]">DEL PROGRAMA</span></div>
                <div className="flex items-center gap-1.5 text-[9.5px] text-[#757575]"><span className="w-4 h-[3px] bg-[#FF0000] rounded inline-block" /> HH plan acumuladas ({fn(curva.totalHH)} HH)</div>
                <div className="flex items-center gap-1.5 text-[9.5px] text-[#757575]"><span className="w-4 border-t-2 border-dashed border-[#1A1A1A] inline-block" /> HH cubiertas por IWP ({kpi.pctIwp}%)</div>
                <div className="flex items-center gap-1.5 text-[9.5px] text-[#757575]"><span className="w-4 h-2 bg-red-100 border border-red-200 inline-block rounded-sm" /> HH por mes (pico {fn(curva.peak)})</div>
              </div>
              <div className="relative" style={{ width: timelineW }}>
                <svg width={timelineW} height={curvaH} className="block">
                  {/* Barras mensuales */}
                  {curva.meses.map((m, i) => {
                    const h = (m.hh / curva.peak) * (curvaH - 26);
                    return <rect key={i} x={x(m.ms) + 1} y={curvaH - h} width={Math.max(2, x(m.msEnd) - x(m.ms) - 2)} height={h}
                      fill="#FEE2E2" stroke="#FECACA" strokeWidth={1} />;
                  })}
                  {/* Área + línea curva plan */}
                  <path d={`M ${x(rango.t0)},${curvaH} ` + curva.pts.map(p => `L ${x(Math.min(p.ms, rango.t1))},${curvaH - p.plan * (curvaH - 14)}`).join(' ') + ` L ${timelineW},${curvaH} Z`}
                    fill="rgba(255,0,0,0.05)" />
                  <path d={`M ${x(rango.t0)},${curvaH} ` + curva.pts.map(p => `L ${x(Math.min(p.ms, rango.t1))},${curvaH - p.plan * (curvaH - 14)}`).join(' ')}
                    fill="none" stroke="#FF0000" strokeWidth={2} />
                  {/* Curva cobertura IWP */}
                  <path d={`M ${x(rango.t0)},${curvaH} ` + curva.pts.map(p => `L ${x(Math.min(p.ms, rango.t1))},${curvaH - p.cov * (curvaH - 14)}`).join(' ')}
                    fill="none" stroke="#1A1A1A" strokeWidth={1.5} strokeDasharray="4 3" />
                  {/* Marcas 25/50/75% */}
                  {[0.25, 0.5, 0.75].map(p => (
                    <g key={p}>
                      <line x1={0} x2={timelineW} y1={curvaH - p * (curvaH - 14)} y2={curvaH - p * (curvaH - 14)} stroke="#F5F5F5" strokeWidth={1} />
                      <text x={4} y={curvaH - p * (curvaH - 14) - 2} fontSize={8} fill="#BDBDBD">{p * 100}%</text>
                    </g>
                  ))}
                </svg>
                {todayX !== null && <div className="absolute top-0 bottom-0 w-[2px] bg-[#FF0000]/60" style={{ left: todayX }} />}
              </div>
            </div>
          )}

          {/* Filas */}
          <div className="relative">
            {/* Gridlines de mes + línea hoy, detrás de las filas */}
            <div className="absolute inset-y-0 pointer-events-none z-0" style={{ left: LEFT_W, width: timelineW }}>
              {months.map((m, i) => (
                <div key={i} className="absolute top-0 bottom-0 border-l border-[#F5F5F5]" style={{ left: m.x }} />
              ))}
              {todayX !== null && <div className="absolute top-0 bottom-0 w-[2px] bg-[#FF0000]/30" style={{ left: todayX }} />}
            </div>

            {rows.map(row => (
              <GanttRow key={row.key} row={row} x={x} pxd={pxd}
                collapsed={allCollapsed ? !collapsed.has(row.key) : collapsed.has(row.key)}
                onToggle={() => toggle(row.key)}
                hhAsignada={hhAsignada}
                onOpenIwp={row.kind === 'cwp' ? () => setIwpModal({ cwp: row.cwp, acts: row.acts, iwps: row.iwps }) : undefined}
                onAssignCwp={row.kind === 'task' ? () => setCwpModal({ act: row.act }) : undefined}
              />
            ))}
            {rows.length === 0 && (
              <div className="py-16 text-center text-[#757575] italic text-[12px]">Sin resultados para “{search}”.</div>
            )}
          </div>
        </div>
      </div>

      {/* Modal apertura rápida de IWP */}
      {iwpModal && (
        <QuickIwpModal projectId={projectId} cwp={iwpModal.cwp} acts={iwpModal.acts} iwps={iwpModal.iwps}
          hhAsignada={hhAsignada}
          onClose={() => setIwpModal(null)}
          onCreated={() => { setIwpModal(null); loadIwps(); }} />
      )}

      {/* Modal de asignación de CWP a actividad */}
      {cwpModal && (
        <AssignCwpModal projectId={projectId} act={cwpModal.act} cwps={cwps}
          onClose={() => setCwpModal(null)}
          onAssigned={() => { setCwpModal(null); loadData(false); }} />
      )}
    </div>
  );
}

// ─── KPI chico del header ────────────────────────────────────────────────────
function Kpi({ v, l, accent, icon }: { v: string; l: string; accent?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="text-center">
      <div className={cn('text-[16px] font-black flex items-center justify-center gap-1', accent ? 'text-[#FF0000]' : 'text-[#1A1A1A]')}>{icon}{v}</div>
      <div className="text-[8.5px] uppercase tracking-wider text-[#BDBDBD]">{l}</div>
    </div>
  );
}

// ─── Fila del Gantt ──────────────────────────────────────────────────────────
function GanttRow({ row, x, pxd, collapsed, onToggle, hhAsignada, onOpenIwp, onAssignCwp }: {
  row: Row; x: (ms: number) => number; pxd: number;
  collapsed: boolean; onToggle: () => void;
  hhAsignada: Map<string, number>;
  onOpenIwp?: () => void;
  onAssignCwp?: () => void;
}) {
  const h = row.kind === 'group' ? H_GROUP : row.kind === 'cwp' ? H_CWP : row.kind === 'iwp' ? H_IWP : H_TASK;
  const indent = 8 + row.level * 16;

  // ── Celda izquierda ──
  let left: React.ReactNode = null;
  let bar: React.ReactNode = null;

  if (row.kind === 'group') {
    left = (
      <button onClick={onToggle} className="flex items-center gap-1 min-w-0 flex-1 text-left group">
        {collapsed ? <ChevronRight className="w-3 h-3 text-[#757575] shrink-0" /> : <ChevronDown className="w-3 h-3 text-[#757575] shrink-0" />}
        <span className="text-[10.5px] font-black text-[#1A1A1A] uppercase truncate group-hover:text-[#A00000]">{row.label}</span>
        <span className="text-[9px] text-[#BDBDBD] shrink-0 ml-1">{row.nTasks} act</span>
      </button>
    );
    if (row.start !== null && row.end !== null) {
      const l = x(row.start), w = Math.max(3, x(row.end + DAY) - l);
      bar = (
        <div className="absolute" style={{ left: l, width: w, top: '50%', transform: 'translateY(-50%)' }}>
          <div className="h-[5px] bg-[#1A1A1A] rounded-[1px]" />
          <div className="absolute left-0 top-[5px] w-[2px] h-[4px] bg-[#1A1A1A]" />
          <div className="absolute right-0 top-[5px] w-[2px] h-[4px] bg-[#1A1A1A]" />
        </div>
      );
    }
  }

  if (row.kind === 'cwp') {
    const c = row.cwp;
    const color = discColor(c.disciplina ?? c.disciplina_cod);
    const nIwp = row.iwps.length;
    left = (
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <button onClick={onToggle} className="shrink-0">
          {collapsed ? <ChevronRight className="w-3 h-3 text-[#757575]" /> : <ChevronDown className="w-3 h-3 text-[#757575]" />}
        </button>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
        <span className="font-mono text-[10.5px] font-black text-[#1A1A1A] shrink-0">{c.cwp_id}</span>
        {c.ruta_critica && <Flame className="w-3 h-3 text-[#FF0000] shrink-0" />}
        <span className="text-[10px] text-[#757575] truncate">{c.cwp_nombre}</span>
        <span className={cn('text-[8.5px] font-bold px-1.5 rounded-full shrink-0', nIwp ? 'bg-red-50 text-[#A00000]' : 'bg-slate-100 text-slate-400')}>
          {nIwp} IWP
        </span>
        <button onClick={onOpenIwp}
          className="shrink-0 flex items-center gap-0.5 text-[9px] font-black text-white bg-[#FF0000] hover:bg-[#A00000] rounded-full px-2 py-[2px] transition shadow-sm"
          title={`Abrir un IWP de ${c.cwp_id}`}>
          <Plus className="w-2.5 h-2.5" /> IWP
        </button>
      </div>
    );
    if (row.start !== null && row.end !== null) {
      const l = x(row.start), w = Math.max(3, x(row.end + DAY) - l);
      bar = (
        <div className="absolute rounded-sm" title={`${c.cwp_id} — ${c.cwp_nombre}\n${fn(row.hh)} HH · ${nIwp} IWP`}
          style={{ left: l, width: w, top: '50%', transform: 'translateY(-50%)', height: 9, background: color, opacity: 0.85, outline: c.ruta_critica ? '2px solid #FF0000' : undefined, outlineOffset: 1 }} />
      );
    }
  }

  if (row.kind === 'task') {
    const a = row.act;
    const asig = hhAsignada.get(a.id) ?? 0;
    const color = row.critico ? '#FF0000' : discColor(a.wbs);
    left = (
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span className="w-3 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-[#33475B] truncate leading-tight" title={a.nombre_actividad}>{a.nombre_actividad}</div>
        </div>
        {asig > 0 && <span className="shrink-0 text-[8px] font-bold text-[#A00000] bg-red-50 rounded-full px-1.5" title={`${fn(asig)} HH ya en IWP`}>IWP</span>}
      </div>
    );
    if (a.fecha_inicio && a.fecha_fin) {
      const l = x(toMs(a.fecha_inicio)), w = Math.max(3, x(toMs(a.fecha_fin) + DAY) - l);
      const covPct = a.hh > 0 ? Math.min(100, (asig / a.hh) * 100) : 0;
      bar = (
        <div className="absolute rounded-sm overflow-hidden" title={`${a.cod_actividad}\n${a.nombre_actividad}\n${fd(a.fecha_inicio)} → ${fd(a.fecha_fin)} · ${fn(a.hh)} HH${asig ? `\n${fn(asig)} HH en IWP` : ''}`}
          style={{ left: l, width: w, top: '50%', transform: 'translateY(-50%)', height: 8, background: color, opacity: 0.75 }}>
          {covPct > 0 && <div className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${covPct}%` }} />}
        </div>
      );
    }
  }

  if (row.kind === 'hito') {
    const a = row.act;
    left = (
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span className="w-3 shrink-0" />
        <Diamond className="w-2.5 h-2.5 text-[#1A1A1A] fill-[#1A1A1A] shrink-0" />
        <span className="text-[9.5px] text-[#757575] italic truncate" title={a.nombre_actividad}>{a.nombre_actividad}</span>
      </div>
    );
    const ms = a.fecha_inicio ?? a.fecha_fin;
    if (ms) {
      bar = (
        <div className="absolute w-[9px] h-[9px] bg-[#1A1A1A] rotate-45" title={`◆ ${a.nombre_actividad}\n${fd(ms)}`}
          style={{ left: x(toMs(ms)) - 4, top: '50%', transform: 'translateY(-50%) rotate(45deg)' }} />
      );
    }
  }

  if (row.kind === 'iwp') {
    const i = row.iwp;
    const color = IWP_BAR[i.status] ?? '#BDBDBD';
    const pend = i.constraints.total - i.constraints.despejados;
    left = (
      <div className="flex items-center gap-1.5 min-w-0 flex-1 pl-3">
        <Layers className="w-2.5 h-2.5 text-[#FF0000] shrink-0" />
        <span className="font-mono text-[9.5px] font-bold text-[#1A1A1A] truncate">{i.iwp_id}</span>
        <span className="text-[8.5px] shrink-0 px-1.5 rounded-full font-bold" style={{ background: color + '22', color }}>
          {IWP_LABEL[i.status] ?? i.status}
        </span>
        {pend > 0 && <span className="text-[8.5px] text-[#A00000] font-bold shrink-0">⚠ {pend}</span>}
      </div>
    );
    if (i.fecha_inicio_plan && i.fecha_fin_plan) {
      const l = x(toMs(i.fecha_inicio_plan)), w = Math.max(3, x(toMs(i.fecha_fin_plan) + DAY) - l);
      bar = (
        <div className="absolute rounded-full overflow-hidden border" title={`${i.iwp_id}\n${i.descripcion ?? ''}\n${fn(i.hh_estimadas)} HH · ${Math.round(i.avance_fisico_pct)}% avance`}
          style={{ left: l, width: w, top: '50%', transform: 'translateY(-50%)', height: 7, borderColor: color, background: color + '33' }}>
          <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, i.avance_fisico_pct)}%`, background: color }} />
        </div>
      );
    }
  }

  // Columnas de datos estilo tabla P6: CWP · HH · Inicio · Fin
  const cwp = row.kind === 'task' ? row.act.cwp_id : null;
  const noCwp = row.kind === 'task' && !cwp;
  const cols: [string, string, string, string] =
    row.kind === 'group' ? ['—', fn(row.hh), fdms(row.start), fdms(row.end)]
    : row.kind === 'cwp' ? ['—', fn(row.hh), fdms(row.start), fdms(row.end)]
    : row.kind === 'task' ? [cwp ?? '—', fn(row.act.hh), fd(row.act.fecha_inicio), fd(row.act.fecha_fin)]
    : row.kind === 'iwp' ? ['—', fn(row.iwp.hh_estimadas), fd(row.iwp.fecha_inicio_plan), fd(row.iwp.fecha_fin_plan)]
    : ['—', '—', fd(row.act.fecha_inicio ?? row.act.fecha_fin), ''];

  const colCls = cn('text-[8.5px] font-mono shrink-0',
    row.kind === 'group' || row.kind === 'cwp' ? 'text-[#1A1A1A] font-bold' : 'text-[#9E9E9E]');
  const cwpColCls = cn('text-[8.5px] font-mono shrink-0 text-center font-bold',
    noCwp ? 'text-[#A00000]' : 'text-[#1A1A1A]');

  return (
    <div className={cn('flex border-b relative z-[1]',
      noCwp ? 'bg-red-50 border-red-200 border-l-4 border-l-[#FF0000]' : 'border-[#FAFAFA]',
      row.kind === 'group' && 'bg-[#FAFAFA]/70')} style={{ height: h }}>
      <div className="sticky left-0 z-10 flex items-center gap-2 border-r border-[#EEEEEE] shrink-0 pr-3"
        style={{ width: LEFT_W, paddingLeft: indent, background: noCwp ? '#FEE2E2' : (row.kind === 'group' ? '#FAFAFA' : '#FFFFFF') }}>
        {left}
        {row.kind === 'task' && onAssignCwp ? (
          <button onClick={onAssignCwp}
            className={cn('w-[62px] text-center rounded px-1 py-0.5 transition hover:bg-red-100 font-bold text-[8.5px]',
              noCwp ? 'text-[#A00000] hover:underline cursor-pointer' : 'text-[#1A1A1A] hover:text-[#A00000]')}>
            {cols[0]}
          </button>
        ) : (
          <span className={cwpColCls + ' w-[62px]'}>{cols[0]}</span>
        )}
        <span className={cn(colCls, 'w-[50px] text-right ml-auto')}>{cols[1]}</span>
        <span className={cn(colCls, 'w-[52px] text-right')}>{cols[2]}</span>
        <span className={cn(colCls, 'w-[52px] text-right')}>{cols[3]}</span>
      </div>
      <div className="relative flex-1">{bar}</div>
    </div>
  );
}

// ─── Modal de apertura rápida de IWP ─────────────────────────────────────────
function QuickIwpModal({ projectId, cwp, acts, iwps, hhAsignada, onClose, onCreated }: {
  projectId: string; cwp: PCwp; acts: PAct[]; iwps: PIwp[];
  hhAsignada: Map<string, number>;
  onClose: () => void; onCreated: () => void;
}) {
  // ID autogenerado: siguiente correlativo del CWP
  const nextNum = useMemo(() => {
    let max = 0;
    for (const i of iwps) {
      const m = i.iwp_id.match(/IWP[-_]?(\d+)$/i);
      if (m) max = Math.max(max, +m[1]);
    }
    return max + 1;
  }, [iwps]);
  const iwpId = `${cwp.cwp_id}-IWP-${String(nextNum).padStart(2, '0')}`;

  // Pre-seleccionar actividades que aún no están (completas) en ningún IWP
  const [sel, setSel] = useState<Map<string, number>>(() => {
    const m = new Map<string, number>();
    for (const a of acts) {
      const rest = Math.max(0, a.hh - (hhAsignada.get(a.id) ?? 0));
      if (rest > 0 && rest === a.hh) m.set(a.id, rest);
    }
    return m;
  });
  const [descripcion, setDescripcion] = useState('');
  const [crew, setCrew] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selActs = acts.filter(a => sel.has(a.id));
  const hhTotal = [...sel.values()].reduce((s, v) => s + v, 0);
  const fechas = useMemo(() => {
    const ss = selActs.map(a => a.fecha_inicio).filter(Boolean).sort();
    const es = selActs.map(a => a.fecha_fin).filter(Boolean).sort();
    return { ini: ss[0] ?? null, fin: es[es.length - 1] ?? null };
  }, [selActs]);
  const [fIni, setFIni] = useState<string>('');
  const [fFin, setFFin] = useState<string>('');
  useEffect(() => { setFIni(fechas.ini ?? ''); setFFin(fechas.fin ?? ''); }, [fechas.ini, fechas.fin]);

  const crewN = crew ? +crew : null;
  const turnos = crewN && hhTotal ? hhTotal / (crewN * 11) : null;

  const toggleAct = (a: PAct) => setSel(prev => {
    const n = new Map(prev);
    if (n.has(a.id)) n.delete(a.id);
    else n.set(a.id, Math.max(0, a.hh - (hhAsignada.get(a.id) ?? 0)) || a.hh);
    return n;
  });

  const crear = async () => {
    setSaving(true); setErr(null);
    try {
      const res = await fetch('/api/mining-iwp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId, cwp_id: cwp.cwp_id, iwp_id: iwpId,
          descripcion: descripcion || `Paquete de instalación ${nextNum} de ${cwp.cwp_nombre}`,
          fecha_inicio_plan: fIni || null, fecha_fin_plan: fFin || null,
          crew_size: crewN,
          actividades: [...sel.entries()].map(([programa_id, hh]) => ({ programa_id, hh_asignadas_iwp: hh })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || `HTTP ${res.status}`);
      onCreated();
    } catch (e: any) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b-2 border-[#FF0000] flex items-center gap-3 shrink-0">
          <div>
            <div className="font-display text-[16px] font-bold text-[#1A1A1A]">ABRIR <span className="text-[#FF0000]">IWP</span></div>
            <div className="text-[10.5px] text-[#757575]">{cwp.cwp_id} — {cwp.cwp_nombre} · se creará como <b className="font-mono text-[#1A1A1A]">{iwpId}</b></div>
          </div>
          <button onClick={onClose} className="ml-auto p-2 rounded-lg hover:bg-red-50 text-[#757575] hover:text-[#A00000]"><X className="w-4 h-4" /></button>
        </div>

        {/* Actividades */}
        <div className="flex-1 overflow-auto px-6 py-3">
          <div className="text-[9.5px] font-black uppercase tracking-[0.14em] text-[#BDBDBD] mb-2">
            Actividades del programa ({sel.size}/{acts.length} seleccionadas) — destildar las que no van en este paquete
          </div>
          <div className="space-y-1">
            {acts.map(a => {
              const asig = hhAsignada.get(a.id) ?? 0;
              const rest = Math.max(0, a.hh - asig);
              const on = sel.has(a.id);
              return (
                <button key={a.id} onClick={() => toggleAct(a)}
                  className={cn('w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg border text-left transition',
                    on ? 'border-[#FF0000]/50 bg-red-50/60' : 'border-[#EEEEEE] hover:border-[#E0E0E0]')}>
                  <span className={cn('w-3.5 h-3.5 rounded border-2 shrink-0 flex items-center justify-center',
                    on ? 'bg-[#FF0000] border-[#FF0000]' : 'border-[#BDBDBD]')}>
                    {on && <span className="text-white text-[9px] font-black leading-none">✓</span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-[#1A1A1A] truncate">{a.nombre_actividad}</div>
                    <div className="text-[8.5px] text-[#BDBDBD] font-mono">{a.cod_actividad} · {fd(a.fecha_inicio)} → {fd(a.fecha_fin)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10.5px] font-black text-[#1A1A1A]">{fn(on ? (sel.get(a.id) ?? 0) : rest)} HH</div>
                    {asig > 0 && <div className="text-[8px] text-[#A00000]">{fn(asig)} ya en IWP</div>}
                  </div>
                </button>
              );
            })}
            {acts.length === 0 && <div className="text-[11px] text-[#757575] italic py-4">Este CWP no tiene actividades con HH en el programa vigente.</div>}
          </div>
        </div>

        {/* Config + crear */}
        <div className="px-6 py-4 border-t border-[#EEEEEE] shrink-0 space-y-3 bg-[#FAFAFA]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-[8.5px] font-black uppercase tracking-wider text-[#757575]">Inicio plan</span>
              <input type="date" value={fIni} onChange={e => setFIni(e.target.value)}
                className="w-full mt-0.5 border border-[#E0E0E0] rounded-lg px-2 py-1.5 text-[11px] bg-white focus:outline-none focus:border-[#FF0000]/60" />
            </label>
            <label className="block">
              <span className="text-[8.5px] font-black uppercase tracking-wider text-[#757575]">Fin plan</span>
              <input type="date" value={fFin} onChange={e => setFFin(e.target.value)}
                className="w-full mt-0.5 border border-[#E0E0E0] rounded-lg px-2 py-1.5 text-[11px] bg-white focus:outline-none focus:border-[#FF0000]/60" />
            </label>
            <label className="block">
              <span className="text-[8.5px] font-black uppercase tracking-wider text-[#757575]">Cuadrilla (personas)</span>
              <input type="number" min={1} value={crew} onChange={e => setCrew(e.target.value)} placeholder="—"
                className="w-full mt-0.5 border border-[#E0E0E0] rounded-lg px-2 py-1.5 text-[11px] bg-white focus:outline-none focus:border-[#FF0000]/60" />
            </label>
            <div className="block">
              <span className="text-[8.5px] font-black uppercase tracking-wider text-[#757575]">Tamaño del paquete</span>
              <div className="mt-0.5 text-[13px] font-black text-[#1A1A1A]">{fn(hhTotal)} HH
                {turnos != null && <span className={cn('text-[10px] font-bold ml-1.5', turnos > 10 ? 'text-amber-600' : 'text-green-600')}>≈ {turnos.toFixed(1)} turnos</span>}
              </div>
            </div>
          </div>
          <input value={descripcion} onChange={e => setDescripcion(e.target.value)}
            placeholder={`Descripción (opcional) — ej: Paquete de instalación ${nextNum} de ${cwp.cwp_nombre}`}
            className="w-full border border-[#E0E0E0] rounded-lg px-3 py-2 text-[11px] bg-white focus:outline-none focus:border-[#FF0000]/60" />
          {turnos != null && turnos > 10 && (
            <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              ⚠ COAA recomienda IWP de 1–2 semanas de trabajo (≈ 6–12 turnos). Este paquete da {turnos.toFixed(1)} turnos — considera dividirlo.
            </div>
          )}
          {err && <div className="text-[10.5px] text-[#A00000] bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">{err}</div>}
          <div className="flex items-center gap-3">
            <button onClick={crear} disabled={saving || sel.size === 0}
              className="flex items-center gap-1.5 bg-[#FF0000] hover:bg-[#A00000] disabled:opacity-40 text-white text-[12px] font-black rounded-full px-6 py-2.5 transition shadow-[0_2px_10px_rgba(255,0,0,0.25)]">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Crear {iwpId}
            </button>
            <span className="text-[10px] text-[#757575]">Se generarán automáticamente las restricciones IFC, material y permisos.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de asignación rápida de CWP ───────────────────────────────────────
function AssignCwpModal({ projectId, act, cwps, onClose, onAssigned }: {
  projectId: string; act: PAct; cwps: PCwp[];
  onClose: () => void; onAssigned: () => void;
}) {
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filtered = cwps.filter(c =>
    JSON.stringify(c).toUpperCase().includes(search.toUpperCase()));

  const asignar = async (cwp_id: string) => {
    setSaving(true); setErr(null);
    try {
      const res = await fetch('/api/mining-planificacion', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, programa_id: act.id, cwp_id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || `HTTP ${res.status}`);
      onAssigned();
    } catch (e: any) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-[420px] w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white border-b-2 border-[#FF0000] px-6 py-4 flex items-center justify-between">
          <div>
            <div className="font-display text-[14px] font-bold text-[#1A1A1A]">{act.cwp_id ? 'Cambiar' : 'Asignar'} <span className="text-[#FF0000]">CWP</span></div>
            <div className="text-[9.5px] text-[#757575] mt-0.5">{act.nombre_actividad}</div>
            {act.cwp_id && <div className="text-[9px] text-amber-700 mt-1">Actualmente: <span className="font-bold">{act.cwp_id}</span></div>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-red-50 text-[#757575] hover:text-[#A00000]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Buscador */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#BDBDBD]" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar CWP por código, nombre, disciplina…"
              className="w-full pl-8 pr-3 py-2 rounded-full border border-[#E0E0E0] text-[11px] bg-white focus:outline-none focus:border-[#FF0000]/60" />
          </div>

          {err && <div className="text-[10.5px] text-[#A00000] bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">{err}</div>}

          {/* Lista de CWPs */}
          <div className="max-h-[400px] overflow-auto space-y-1.5">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-[#757575] italic text-[11px]">Sin resultados para "{search}".</div>
            ) : (
              filtered.map(c => (
                <button key={c.cwp_id} onClick={() => asignar(c.cwp_id)} disabled={saving}
                  className="w-full text-left flex items-center gap-2 p-3 rounded-xl border border-[#EEEEEE] hover:border-[#FF0000]/60 hover:bg-red-50 transition disabled:opacity-40">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold text-[#1A1A1A]">{c.cwp_id}</div>
                    <div className="text-[9px] text-[#757575] truncate">{c.cwp_nombre}</div>
                    <div className="text-[8.5px] text-[#BDBDBD]">
                      {c.disciplina ?? c.disciplina_cod} · {fn(c.hh_planner ?? 0)} HH
                    </div>
                  </div>
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF0000] shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
