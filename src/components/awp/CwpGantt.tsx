'use client';

import { useEffect, useRef, useState } from 'react';
import { Calendar, Users, AlertTriangle, ChevronDown, ChevronRight, Clock, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { metaDe, ESTADO_META, ESTADOS_IWP } from '@/lib/iwp-estado';

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

// Fila del gantt: actividad + a qué CWP pertenece (para color y chip en modo multi)
interface GanttRow { task: MTask; cwp: MCwp; }

// ─── Helpers ─────────────────────────────────────────────────────────────────
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const toMs  = (s: string) => +new Date(s + 'T00:00:00');
const fn    = (v: number) => Math.round(v).toLocaleString('es-CL');
const fd    = (s: string | null) =>
  s ? s.slice(8,10)+'-'+MESES[+s.slice(5,7)-1]+'-'+s.slice(2,4) : '—';

// El vocabulario y los colores de estado salen de `lib/iwp-estado` — la fuente única.
// Este componente tenía su propio catálogo y le faltaban LIBERADO y CERRADO: un paquete
// entregado a terreno caía al fallback y se pintaba gris como "Planificado", justo el
// estado que el Gantt existe para distinguir. Además usaba rojo para "Listo" cuando el
// resto de la plataforma pinta rojo el "Liberado".
const metaGantt = (status: string | null | undefined) => metaDe(status ?? '');

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

// ─── Barra de actividad (fila compacta de una línea) ─────────────────────────
function ActivityBar({
  row, leftPct, widthPct, minWidthPx, relatedIwps, timelineStartMs, totalMs, multi,
}: {
  row: GanttRow;
  leftPct: number;
  widthPct: number;
  minWidthPx: number;
  relatedIwps: IwpRow[];
  timelineStartMs: number;
  totalMs: number;
  multi: boolean;
}) {
  const [tip, setTip] = useState<TooltipInfo | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { task, cwp } = row;

  const showTip = (e: React.MouseEvent) => {
    setTip({
      x: e.clientX, y: e.clientY,
      title: task.n,
      rows: [
        { l: 'CWP',     v: cwp.cwp },
        { l: 'Código',  v: task.code || '—' },
        { l: 'Inicio',  v: fd(task.s) },
        { l: 'Fin',     v: fd(task.e) },
        { l: 'HH',      v: fn(task.hh) + ' HH' },
        { l: 'IWPs',    v: String(relatedIwps.length) },
      ],
    });
  };

  return (
    <div>
      {/* Fila de actividad — una sola línea, compacta */}
      <div className="flex items-stretch" style={{ minHeight: 16 }}>
        {/* Nombre */}
        <div
          className="w-[26%] shrink-0 flex items-center gap-1 pr-2 cursor-pointer group min-w-0"
          onClick={() => relatedIwps.length && setExpanded(v => !v)}
        >
          {relatedIwps.length > 0 ? (
            <span className="text-slate-400 group-hover:text-[#A00000] transition shrink-0">
              {expanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
            </span>
          ) : <span className="w-2.5 shrink-0" />}
          {multi && (
            <span
              className="shrink-0 rounded-sm px-1 text-[8px] font-extrabold text-white leading-[13px]"
              style={{ background: cwp.color }}
              title={cwp.cwp}
            >
              {cwp.disc}
            </span>
          )}
          <span className="text-[10px] text-[#33475B] truncate leading-tight" title={`${task.n} · ${task.code}`}>{task.n}</span>
        </div>

        {/* Fechas inicio – fin */}
        <div className="w-[12%] shrink-0 flex items-center text-[8.5px] text-slate-400 font-mono whitespace-nowrap overflow-hidden">
          {fd(task.s)} – {fd(task.e)}
        </div>

        {/* HH */}
        <div className="w-[6%] shrink-0 flex items-center justify-end pr-2 text-[9px] font-mono font-semibold text-slate-500 whitespace-nowrap">
          {fn(task.hh)}
        </div>

        {/* Timeline barra */}
        <div className="flex-1 relative flex items-center">
          <div
            className="absolute inset-y-[1.5px] rounded cursor-pointer transition-opacity hover:opacity-85"
            style={{
              left: `${leftPct}%`,
              width: `max(${minWidthPx}px, ${widthPct}%)`,
              backgroundColor: cwp.color,
            }}
            onMouseMove={showTip}
            onMouseLeave={() => setTip(null)}
          />
        </div>
      </div>

      {/* IWPs anidados */}
      {expanded && relatedIwps.map(iwp => {
        if (!iwp.fecha_inicio_plan || !iwp.fecha_fin_plan) return null;
        const iLeft = ((toMs(iwp.fecha_inicio_plan) - timelineStartMs) / totalMs) * 100;
        const iW    = Math.max(1, ((toMs(iwp.fecha_fin_plan) - toMs(iwp.fecha_inicio_plan)) / totalMs) * 100);
        const sc    = metaGantt(iwp.status);
        return (
          <IwpBar
            key={iwp.iwp_id}
            iwp={iwp}
            leftPct={iLeft}
            widthPct={iW}
            colorCls={sc.color}
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
  const sc = metaGantt(iwp.status);
  const blocked = iwp.constraints.total > 0 && iwp.constraints.despejados < iwp.constraints.total;

  return (
    <div className="flex items-stretch" style={{ minHeight: 14 }}>
      <div className="w-[26%] shrink-0 flex items-center pr-2 pl-6 gap-1 min-w-0">
        <Layers className="w-2.5 h-2.5 text-[#FF0000] shrink-0" />
        <span className="text-[9px] text-slate-500 truncate font-mono">{iwp.iwp_id}</span>
        {blocked && (
          <span title="Tiene constraints activos">
            <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0" />
          </span>
        )}
      </div>
      <div className="w-[12%] shrink-0 flex items-center text-[8.5px] text-slate-400 font-mono whitespace-nowrap overflow-hidden">
        {fd(iwp.fecha_inicio_plan)} – {fd(iwp.fecha_fin_plan)}
      </div>
      <div className="w-[6%] shrink-0 flex items-center justify-end pr-2 text-[8.5px] font-mono text-slate-400 whitespace-nowrap">
        {fn(iwp.hh_estimadas)}
      </div>
      <div className="flex-1 relative flex items-center">
        <div
          className="absolute inset-y-[1.5px] rounded cursor-pointer opacity-80 hover:opacity-100 transition"
          style={{ left: `${leftPct}%`, width: `max(${minWidthPx * 0.6}px, ${widthPct}%)`, backgroundColor: colorCls }}
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
        />
      </div>
      {tip && <Tooltip info={tip} />}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
// cwps = los CWP a graficar: si hay checkboxes marcados en la lista, SOLO esos;
// si no hay ninguno marcado, el CWP abierto en el panel. Las barras se colorean por CWP.
export function CwpGantt({ cwps, projectId }: { cwps: MCwp[]; projectId: string }) {
  const [iwps, setIwps] = useState<IwpRow[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(600);

  const multi = cwps.length > 1;
  const cwpsKey = cwps.map(x => x.cwp).join(',');

  // Cargar IWPs de todos los CWP visibles
  useEffect(() => {
    if (!cwpsKey) return;
    let alive = true;
    setIwps(null);
    Promise.all(
      cwpsKey.split(',').map(id =>
        fetch(`/api/mining-iwp?project_id=${projectId}&cwp_id=${encodeURIComponent(id)}`)
          .then(r => r.json())
          .then(d => (d.iwps ?? []) as IwpRow[])
          .catch(() => [] as IwpRow[])
      )
    ).then(lists => { if (alive) setIwps(lists.flat()); });
    return () => { alive = false; };
  }, [projectId, cwpsKey]);

  // Medir ancho del contenedor para calcular el minWidthPx
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setContainerW(e.contentRect.width * 0.56)); // 56% = zona timeline
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (!cwps.length) return (
    <div className="text-slate-400 text-[12px] text-center py-6">Marca al menos un CWP con el checkbox de la lista.</div>
  );

  const withProg = cwps.filter(x => x.prog);
  if (!withProg.length) return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-[11.5px]">
      ⚠ {multi ? 'Los CWP seleccionados no tienen' : 'Este CWP no tiene'} actividades en el programa todavía.
    </div>
  );

  // hh > 0 excluye filas "resumen" de P6 que tienen el mismo nombre que el CWP pero 0 HH
  const rows: GanttRow[] = withProg
    .flatMap(x => x.prog!.tasks.filter(t => t.s && t.e && t.hh > 0).map(task => ({ task, cwp: x })))
    .sort((a, b) => (a.task.s ?? '').localeCompare(b.task.s ?? ''));
  if (!rows.length) return (
    <div className="text-slate-400 text-[12px] text-center py-6">Sin actividades con fechas asignadas.</div>
  );

  const hhTotal = withProg.reduce((s, x) => s + x.prog!.hh, 0);
  const actsTotal = withProg.reduce((s, x) => s + x.prog!.acts, 0);
  const progStart = withProg.map(x => x.prog!.start).filter(Boolean).sort()[0] ?? null;
  const progEnd = withProg.map(x => x.prog!.end).filter(Boolean).sort().slice(-1)[0] ?? null;

  // Calcular rango de tiempo
  const allStartMs  = rows.map(r => toMs(r.task.s!));
  const allEndMs    = rows.map(r => toMs(r.task.e!));
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
  const hhPct = hhTotal > 0 ? Math.round((hhAsignadas / hhTotal) * 100) : 0;

  return (
    <div className="space-y-3" ref={containerRef}>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard icon={Clock}     label={multi ? `HH Programa · ${withProg.length} CWP` : 'HH Programa'}  value={fn(hhTotal) + ' HH'}  color="text-orange-600" />
        <KpiCard icon={Calendar}  label="Duración"      value={fd(progStart) + ' → ' + fd(progEnd)} color="text-slate-600" />
        <KpiCard icon={Layers}    label={`${actsTotal} actividades`} value={`${totalIwps} IWPs`} color="text-[#FF0000]" />
        <KpiCard icon={Users}     label="HH en IWPs"
          value={hhPct + '%'}
          sub={`${fn(hhAsignadas)} / ${fn(hhTotal)} HH`}
          color={hhPct >= 80 ? 'text-emerald-600' : hhPct >= 40 ? 'text-amber-600' : 'text-red-500'}
        />
      </div>

      {/* Leyenda CWP (modo combinado) */}
      {multi && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">CWP:</span>
          {cwps.map(x => (
            <span key={x.cwp} className="flex items-center gap-1.5 text-[10px] text-slate-600 font-mono">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: x.color }} />
              {x.cwp}
              <span className="text-slate-400 font-sans">{x.prog ? fn(x.prog.hh) + ' HH' : 'sin programa'}</span>
            </span>
          ))}
        </div>
      )}

      {/* Leyenda IWP status */}
      {totalIwps > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">IWP Status:</span>
          {ESTADOS_IWP.map(k => (
            <span key={k} className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: ESTADO_META[k].color }} />
              {ESTADO_META[k].label}
            </span>
          ))}
        </div>
      )}

      {/* Gantt */}
      <div className="border border-[#E2D3C4] rounded-xl overflow-hidden bg-white text-[11px]">

        {/* Header meses */}
        <div className="flex border-b border-[#E2D3C4] bg-[#FDF7F2]">
          <div className="w-[26%] shrink-0 px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Actividad / IWP
          </div>
          <div className="w-[12%] shrink-0 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Fechas
          </div>
          <div className="w-[6%] shrink-0 py-1.5 pr-2 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider border-r border-[#E2D3C4]">
            HH
          </div>
          <div className="flex-1 relative flex">
            {months.map((m, i) => (
              <div
                key={i}
                className="border-r border-[#E2D3C4] last:border-r-0 text-center py-1.5 text-[10px] font-bold text-[#5A3E28] overflow-hidden"
                style={{ width: `${m.widthPct}%` }}
              >
                <span className="truncate block px-1">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="relative">
          {/* Grid de semanas */}
          <div className="absolute inset-0 pointer-events-none z-0" style={{ left: '44%', right: 0 }}>
            {weeks.map((pct, i) => (
              <div key={i} className="absolute top-0 bottom-0 border-l border-dashed border-[#E2D3C4]/60" style={{ left: `${pct}%` }} />
            ))}
          </div>

          {/* Marcador hoy */}
          {showToday && (
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-red-400/70 z-10 pointer-events-none"
              style={{ left: `calc(44% + ${todayPct}% * 0.56)` }}
            >
              <span className="absolute -top-0 left-1 text-[9px] text-red-400 font-bold bg-white/80 px-0.5 rounded leading-none whitespace-nowrap">
                Hoy
              </span>
            </div>
          )}

          {/* Filas */}
          <div className="relative z-1 divide-y divide-[#EFE3D5]/40 py-0.5">
            {rows.map((r) => {
              const l = ((toMs(r.task.s!) - timelineStartMs) / totalMs) * 100;
              const w = Math.max(0.5, ((toMs(r.task.e!) - toMs(r.task.s!)) / totalMs) * 100);
              const related = iwpByProgramaId.get(r.task.id) ?? [];
              return (
                <ActivityBar
                  key={`${r.cwp.cwp}:${r.task.id}`}
                  row={r}
                  leftPct={l}
                  widthPct={w}
                  minWidthPx={minPx}
                  relatedIwps={related}
                  timelineStartMs={timelineStartMs}
                  totalMs={totalMs}
                  multi={multi}
                />
              );
            })}
          </div>
        </div>

        {/* Footer summary */}
        <div className="border-t border-[#E2D3C4] bg-[#FDF7F2] px-3 py-1.5 flex items-center gap-4 text-[10px] text-slate-500">
          <span>{rows.length} actividades{multi ? ` · ${withProg.length} CWP` : ''}</span>
          <span>·</span>
          <span>{fn(hhTotal)} HH totales en planner</span>
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
        {!multi && ' Marca más CWP con el checkbox de la lista para combinarlos en esta vista.'}
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
