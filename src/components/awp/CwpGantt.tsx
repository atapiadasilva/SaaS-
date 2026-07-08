'use client';

import { useEffect, useRef, useState } from 'react';
import { Calendar, Users, AlertTriangle, ChevronDown, ChevronRight, Clock, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────
interface MTask {
  id: string;
  n: string;
  hh: number;
  s: string | null;
  e: string | null;
  code: string;
}
interface MProg {
  hh: number;
  acts: number;
  start: string | null;
  end: string | null;
  tasks: MTask[];
}
interface MCwp {
  cwp: string;
  disc: string;
  dn: string;
  nombre: string;
  color: string;
  prog: MProg | null;
}

interface IwpRow {
  iwp_id: string;
  descripcion: string | null;
  hh_estimadas: number;
  fecha_inicio_plan: string | null;
  fecha_fin_plan: string | null;
  status: string;
  actividades: { programa_id: string }[];
  constraints: { total: number; despejados: number };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const toMs  = (s: string) => +new Date(s + 'T00:00:00');
const fn    = (v: number) => Math.round(v).toLocaleString('es-CL');
const fd    = (s: string | null) =>
  s ? s.slice(8,10)+'-'+MESES[+s.slice(5,7)-1]+'-'+s.slice(2,4) : '—';

const IWP_STATUS_COLOR: Record<string, { bar: string; label: string }> = {
  PLANIFICADO:        { bar: 'bg-slate-300',   label: 'Planificado' },
  LISTO_PARA_TRABAJO: { bar: 'bg-[#FF0000]',   label: 'Listo' },
  EN_EJECUCION:       { bar: 'bg-amber-500',   label: 'En ejecución' },
  COMPLETADO:         { bar: 'bg-emerald-500', label: 'Completado' },
  HOLD:               { bar: 'bg-slate-500',   label: 'En espera' },
};

function addDays(dateMs: number, days: number) { return dateMs + days * 86_400_000; }

// Genera headers de meses entre dos timestamps
function buildMonths(startMs: number, endMs: number): { label: string; ms: number; widthPct: number }[] {
  const totalMs = endMs - startMs;
  const out: { label: string; ms: number; widthPct: number }[] = [];
  let cur = new Date(startMs);
  cur.setDate(1);
  while (+cur <= endMs) {
    const monthStart = Math.max(+cur, startMs);
    const nextMonth  = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const monthEnd   = Math.min(+nextMonth, endMs);
    out.push({
      label:    MESES[cur.getMonth()] + " '" + String(cur.getFullYear()).slice(2),
      ms:       +cur,
      widthPct: ((monthEnd - monthStart) / totalMs) * 100,
    });
    cur = nextMonth;
  }
  return out;
}

// Divide el timeline en semanas para el grid de fondo
function buildWeeks(startMs: number, endMs: number): number[] {
  const lines: number[] = [];
  const totalMs = endMs - startMs;
  // Avanzar al próximo lunes
  let cur = new Date(startMs);
  const dow = cur.getDay();
  const daysToMon = dow === 0 ? 1 : (8 - dow) % 7;
  cur = new Date(addDays(startMs, daysToMon));
  while (+cur < endMs) {
    lines.push(((+cur - startMs) / totalMs) * 100);
    cur = new Date(addDays(+cur, 7));
  }
  return lines;
}

// ─── Tooltip flotante ─────────────────────────────────────────────────────────
interface TooltipInfo {
  x: number;
  y: number;
  title: string;
  rows: { l: string; v: string }[];
}

function Tooltip({ info }: { info: TooltipInfo }) {
  return (
    <div
      className="fixed z-50 bg-[#0a1628] border border-white/15 rounded-xl shadow-2xl px-3 py-2.5 text-[11px] pointer-events-none min-w-[180px]"
      style={{ left: info.x + 14, top: info.y - 8 }}
    >
      <div className="font-bold text-white mb-1.5 text-[12px] leading-tight">{info.title}</div>
      {info.rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4 text-slate-300">
          <span className="text-slate-500">{r.l}</span>
          <span className="font-mono font-semibold">{r.v}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Barra de actividad ───────────────────────────────────────────────────────
function ActivityBar({
  task, leftPct, widthPct, color, minWidthPx, relatedIwps, timelineStartMs, totalMs,
}: {
  task: MTask;
  leftPct: number;
  widthPct: number;
  color: string;
  minWidthPx: number;
  relatedIwps: IwpRow[];
  timelineStartMs: number;
  totalMs: number;
}) {
  const [tip, setTip] = useState<TooltipInfo | null>(null);
  const [expanded, setExpanded] = useState(false);

  const showTip = (e: React.MouseEvent) => {
    setTip({
      x: e.clientX, y: e.clientY,
      title: task.n,
      rows: [
        { l: 'Código',  v: task.code || '—' },
        { l: 'Inicio',  v: fd(task.s) },
        { l: 'Fin',     v: fd(task.e) },
        { l: 'HH',      v: fn(task.hh) + ' HH' },
        { l: 'IWPs',    v: String(relatedIwps.length) },
      ],
    });
  };

  return (
    <div className="mb-0.5">
      {/* Fila de actividad */}
      <div className="flex items-stretch" style={{ minHeight: 20 }}>
        {/* Nombre */}
        <div
          className="w-[38%] shrink-0 flex items-center gap-1.5 pr-3 cursor-pointer group"
          onClick={() => relatedIwps.length && setExpanded(v => !v)}
        >
          {relatedIwps.length > 0 ? (
            <span className="text-slate-400 group-hover:text-[#A00000] transition shrink-0">
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </span>
          ) : <span className="w-3 shrink-0" />}
          <div className="min-w-0">
            <div className="text-[11px] text-[#33475B] truncate leading-tight" title={task.n}>{task.n}</div>
            <div className="text-[9px] text-slate-400 font-mono leading-none mt-0.5">{task.code}</div>
          </div>
        </div>

        {/* Timeline barra */}
        <div className="flex-1 relative flex items-center py-0.5">
          <div
            className="absolute inset-y-0.5 rounded-md cursor-pointer transition-opacity hover:opacity-85 flex items-center overflow-hidden"
            style={{
              left: `${leftPct}%`,
              width: `max(${minWidthPx}px, ${widthPct}%)`,
              backgroundColor: color,
            }}
            onMouseMove={showTip}
            onMouseLeave={() => setTip(null)}
          >
            <span className="text-[9px] text-white font-bold whitespace-nowrap px-1.5 drop-shadow">
              {fn(task.hh)} HH
            </span>
          </div>
        </div>

        {/* HH label derecha */}
        <div className="w-16 shrink-0 flex items-center justify-end text-[10px] text-slate-400 font-mono pr-1">
          {fd(task.s)} – {fd(task.e)}
        </div>
      </div>

      {/* IWPs anidados */}
      {expanded && relatedIwps.map(iwp => {
        if (!iwp.fecha_inicio_plan || !iwp.fecha_fin_plan) return null;
        const iLeft = ((toMs(iwp.fecha_inicio_plan) - timelineStartMs) / totalMs) * 100;
        const iW    = Math.max(1, ((toMs(iwp.fecha_fin_plan) - toMs(iwp.fecha_inicio_plan)) / totalMs) * 100);
        const sc    = IWP_STATUS_COLOR[iwp.status?.toUpperCase()] ?? IWP_STATUS_COLOR.PLANIFICADO;
        return (
          <IwpBar
            key={iwp.iwp_id}
            iwp={iwp}
            leftPct={iLeft}
            widthPct={iW}
            colorCls={sc.bar}
            minWidthPx={minWidthPx}
          />
        );
      })}

      {tip && <Tooltip info={tip} />}
    </div>
  );
}

// ─── Barra de IWP ────────────────────────────────────────────────────────────
function IwpBar({
  iwp, leftPct, widthPct, colorCls, minWidthPx,
}: {
  iwp: IwpRow;
  leftPct: number;
  widthPct: number;
  colorCls: string;
  minWidthPx: number;
}) {
  const [tip, setTip] = useState<TooltipInfo | null>(null);
  const sc = IWP_STATUS_COLOR[iwp.status?.toUpperCase()] ?? IWP_STATUS_COLOR.PLANIFICADO;
  const blocked = iwp.constraints.total > 0 && iwp.constraints.despejados < iwp.constraints.total;

  return (
    <div className="flex items-stretch mb-0.5 pl-6" style={{ minHeight: 17 }}>
      <div className="w-[38%] shrink-0 flex items-center pr-3 pl-2 gap-1.5">
        <Layers className="w-2.5 h-2.5 text-[#FF0000] shrink-0" />
        <span className="text-[10px] text-slate-500 truncate font-mono">{iwp.iwp_id}</span>
        {blocked && (
          <span title="Tiene constraints activos">
            <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0" />
          </span>
        )}
      </div>
      <div className="flex-1 relative flex items-center py-0.5">
        <div
          className={cn('absolute inset-y-0.5 rounded cursor-pointer opacity-80 hover:opacity-100 transition flex items-center overflow-hidden', colorCls)}
          style={{ left: `${leftPct}%`, width: `max(${minWidthPx * 0.6}px, ${widthPct}%)` }}
          onMouseMove={e => setTip({
            x: e.clientX, y: e.clientY,
            title: `IWP: ${iwp.iwp_id}`,
            rows: [
              { l: 'Desc',   v: iwp.descripcion ?? '—' },
              { l: 'Estado', v: sc.label },
              { l: 'HH',     v: fn(iwp.hh_estimadas) + ' HH' },
              { l: 'Inicio', v: fd(iwp.fecha_inicio_plan) },
              { l: 'Fin',    v: fd(iwp.fecha_fin_plan) },
              { l: 'Const.', v: `${iwp.constraints.despejados}/${iwp.constraints.total} despejadas` },
            ],
          })}
          onMouseLeave={() => setTip(null)}
        >
          <span className="text-[8px] text-white font-bold px-1 whitespace-nowrap">{iwp.iwp_id}</span>
        </div>
      </div>
      <div className="w-16 shrink-0" />
      {tip && <Tooltip info={tip} />}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function CwpGantt({ c, projectId }: { c: MCwp; projectId: string }) {
  const [iwps, setIwps] = useState<IwpRow[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(600);

  // Cargar IWPs del CWP
  useEffect(() => {
    fetch(`/api/mining-iwp?project_id=${projectId}&cwp_id=${encodeURIComponent(c.cwp)}`)
      .then(r => r.json())
      .then(d => setIwps(d.rows ?? []))
      .catch(() => setIwps([]));
  }, [projectId, c.cwp]);

  // Medir ancho del contenedor para calcular el minWidthPx
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setContainerW(e.contentRect.width * 0.62)); // 62% = zona timeline
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const p = c.prog;
  if (!p) return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-[11.5px]">
      ⚠ Este CWP no tiene actividades en el programa todavía.
    </div>
  );

  // hh > 0 excluye filas "resumen" de P6 que tienen el mismo nombre que el CWP pero 0 HH
  const tasks = p.tasks.filter(t => t.s && t.e && t.hh > 0).sort((a, b) => (a.s ?? '').localeCompare(b.s ?? ''));
  if (!tasks.length) return (
    <div className="text-slate-400 text-[12px] text-center py-6">Sin actividades con fechas asignadas.</div>
  );

  // Calcular rango de tiempo
  const allStartMs  = tasks.map(t => toMs(t.s!));
  const allEndMs    = tasks.map(t => toMs(t.e!));
  // Incluir también IWPs en el rango si los hay
  const iwpStartMs  = (iwps ?? []).filter(i => i.fecha_inicio_plan).map(i => toMs(i.fecha_inicio_plan!));
  const iwpEndMs    = (iwps ?? []).filter(i => i.fecha_fin_plan).map(i => toMs(i.fecha_fin_plan!));
  const timelineStartMs = Math.min(...allStartMs, ...iwpStartMs);
  const timelineEndMs   = Math.max(...allEndMs, ...iwpEndMs);
  const totalMs         = Math.max(1, timelineEndMs - timelineStartMs);

  // Marcador de hoy
  const todayMs    = +new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
  const todayPct   = ((todayMs - timelineStartMs) / totalMs) * 100;
  const showToday  = todayPct >= 0 && todayPct <= 100;

  const months  = buildMonths(timelineStartMs, timelineEndMs);
  const weeks   = buildWeeks(timelineStartMs, timelineEndMs);
  const minPx   = Math.max(24, containerW / (totalMs / 86_400_000 / 3)); // al menos 3 días visible

  // Mapa: programa_id → IWPs que lo contienen
  const iwpByProgramaId = new Map<string, IwpRow[]>();
  for (const iwp of (iwps ?? [])) {
    for (const act of (iwp.actividades ?? [])) {
      const arr = iwpByProgramaId.get(act.programa_id) ?? [];
      arr.push(iwp);
      iwpByProgramaId.set(act.programa_id, arr);
    }
  }

  const totalIwps = (iwps ?? []).length;
  const hhAsignadas = (iwps ?? []).reduce((s, i) => s + (i.hh_estimadas ?? 0), 0);
  const hhPct = p.hh > 0 ? Math.round((hhAsignadas / p.hh) * 100) : 0;

  return (
    <div className="space-y-3" ref={containerRef}>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard icon={Clock}     label="HH Programa"  value={fn(p.hh) + ' HH'}  color="text-orange-600" />
        <KpiCard icon={Calendar}  label="Duración"      value={fd(p.start) + ' → ' + fd(p.end)} color="text-slate-600" />
        <KpiCard icon={Layers}    label={`${p.acts} actividades`} value={`${totalIwps} IWPs`} color="text-[#FF0000]" />
        <KpiCard icon={Users}     label="HH en IWPs"
          value={hhPct + '%'}
          sub={`${fn(hhAsignadas)} / ${fn(p.hh)} HH`}
          color={hhPct >= 80 ? 'text-emerald-600' : hhPct >= 40 ? 'text-amber-600' : 'text-red-500'}
        />
      </div>

      {/* Leyenda IWP status */}
      {totalIwps > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">IWP Status:</span>
          {Object.entries(IWP_STATUS_COLOR).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className={cn('w-2.5 h-2.5 rounded-sm', v.bar)} />
              {v.label}
            </span>
          ))}
        </div>
      )}

      {/* Gantt */}
      <div className="border border-[#E2D3C4] rounded-xl overflow-hidden bg-white text-[11px]">

        {/* Header meses */}
        <div className="flex border-b border-[#E2D3C4] bg-[#FDF7F2]">
          <div className="w-[38%] shrink-0 px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-r border-[#E2D3C4]">
            Actividad / IWP
          </div>
          <div className="flex-1 relative flex">
            {months.map((m, i) => (
              <div
                key={i}
                className="border-r border-[#E2D3C4] last:border-r-0 text-center py-2 text-[10px] font-bold text-[#5A3E28] overflow-hidden"
                style={{ width: `${m.widthPct}%` }}
              >
                <span className="truncate block px-1">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="w-16 shrink-0 border-l border-[#E2D3C4] py-2 text-center text-[10px] text-slate-400 font-bold">
            Fechas
          </div>
        </div>

        {/* Body */}
        <div className="relative">
          {/* Grid de semanas */}
          <div className="absolute inset-0 pointer-events-none z-0" style={{ left: '38%', right: '4rem' }}>
            {weeks.map((pct, i) => (
              <div key={i} className="absolute top-0 bottom-0 border-l border-dashed border-[#E2D3C4]/60" style={{ left: `${pct}%` }} />
            ))}
          </div>

          {/* Marcador hoy */}
          {showToday && (
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-red-400/70 z-10 pointer-events-none"
              style={{ left: `calc(38% + ${todayPct}% * 0.62)` }}
            >
              <span className="absolute -top-0 left-1 text-[9px] text-red-400 font-bold bg-white/80 px-0.5 rounded leading-none whitespace-nowrap">
                Hoy
              </span>
            </div>
          )}

          {/* Filas */}
          <div className="relative z-1 divide-y divide-[#EFE3D5]/50 py-1">
            {tasks.map((t) => {
              const l = ((toMs(t.s!) - timelineStartMs) / totalMs) * 100;
              const w = Math.max(0.5, ((toMs(t.e!) - toMs(t.s!)) / totalMs) * 100);
              const related = iwpByProgramaId.get(t.id) ?? [];
              return (
                <ActivityBar
                  key={t.id}
                  task={t}
                  leftPct={l}
                  widthPct={w}
                  color={c.color}
                  minWidthPx={minPx}
                  relatedIwps={related}
                  timelineStartMs={timelineStartMs}
                  totalMs={totalMs}
                />
              );
            })}
          </div>
        </div>

        {/* Footer summary */}
        <div className="border-t border-[#E2D3C4] bg-[#FDF7F2] px-3 py-2 flex items-center gap-4 text-[10px] text-slate-500">
          <span>{tasks.length} actividades</span>
          <span>·</span>
          <span>{fn(p.hh)} HH totales en planner</span>
          {totalIwps > 0 && (
            <>
              <span>·</span>
              <span className="text-[#FF0000] font-semibold">{totalIwps} IWPs creados · {fn(hhAsignadas)} HH asignadas ({hhPct}%)</span>
            </>
          )}
          {iwps === null && (
            <span className="text-slate-400 animate-pulse">Cargando IWPs…</span>
          )}
        </div>
      </div>

      {/* Hint */}
      <p className="text-[10px] text-slate-400">
        Haz click en el <ChevronRight className="inline w-3 h-3" /> de una actividad para ver los IWPs asociados.
        Crea IWPs en la pestaña <strong>IWP</strong>.
      </p>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-[#FFF7EF] border border-[#F2D2AE] rounded-xl px-3 py-2.5 flex items-start gap-2">
      <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', color ?? 'text-orange-500')} />
      <div>
        <div className={cn('text-[15px] font-extrabold font-mono leading-tight', color ?? 'text-[#C2630A]')}>{value}</div>
        {sub && <div className="text-[9px] text-slate-400 font-mono">{sub}</div>}
        <div className="text-[10px] text-[#7A5A33] mt-0.5">{label}</div>
      </div>
    </div>
  );
}
