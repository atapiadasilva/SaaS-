'use client';

import React from 'react';
import { getDiscColor } from '@/components/awp/GanttChart';

// ─── Clean Description ────────────────────────────────────────────────────────
// Strips P6 internal codes and translates common English construction terms to Spanish

// Common P6 prefix codes to strip (with optional dash/space after)
const STRIP_PREFIX_RE = /^(?:WSA|WS[A-Z]|CWP|EWP|PWP|IWP|ENTP?|EMPC?|ENPC?|CNST|PROC|SHE|QA|QC)\s*[-–—:.]?\s*/i;

// Internal area/building codes like AE, PR, LB, SB, OSBL, ISBL etc.
const STRIP_AREA_CODES = /\b(?:AE|PR|LB|SB|OSBL|ISBL|BSBL|OBL|IBL|ST|MT|HV|LV|MV)\b\s*[-–—]?\s*/g;

// Strip leading/trailing number+dot sequences like "1.2.3 -" or "14.2.14.1.2.1 "
const STRIP_LEADING_NUMS = /^[\d.]+\s*[-–—:.]?\s*/;

// Strip internal reference codes in parentheses like "(Does not incl...)"
const STRIP_PARENS_CODES = /\([^)]*(?:incl|excl|ref|see|nota)[^)]*\)/gi;

const TRANSLATE: [RegExp, string][] = [
  // Compound phrases first (longer matches)
  [/\bPipe\s*insulation\s*traced\s*lines?\b/gi, 'Aislación trazado líneas tuberías'],
  [/\bPiping\s*insulation\s*traced\s*lines?\b/gi, 'Aislación trazado líneas cañerías'],
  [/\bPipe\s*insulation\b/gi, 'Aislación de tuberías'],
  [/\bPiping\s*insulation\b/gi, 'Aislación de cañerías'],
  [/\bMechanical\s*Completion\b/gi, 'Completamiento mecánico'],
  [/\bSoil\s*improvement\b/gi, 'Mejoramiento de suelo'],
  [/\breadyto\s*be\s*energized\b/gi, 'lista para energizar'],
  [/\bready\s*to\s*be\s*energized\b/gi, 'lista para energizar'],
  [/\bDoes\s*not\s*incl(?:ude)?\b/gi, 'no incluye'],
  [/\bConstruction\s*of\b/gi, 'Construcción de'],
  [/\bInstallation\s*of\b/gi, 'Instalación de'],
  [/\bCable\s*tray[s]?\b/gi, 'Bandeja portacables'],
  [/\bPressure\s*test(?:ing)?\b/gi, 'Prueba de presión'],
  [/\bpre[\s-]*com(?:missioning)?\b/gi, 'Pre-comisionamiento'],
  [/\bSurge\s*arrest[eo]r[s]?\b/gi, 'Pararrayos'],
  [/\bElectro\s*mangers?\b/gi, 'Electroimanes'],
  [/\bControl\s*panel[s]?\b/gi, 'Tablero de control'],
  [/\bSwitch\s*gear[s]?\b/gi, 'Celdas de distribución'],
  [/\bSwitch\s*yard[s]?\b/gi, 'Patio de maniobras'],
  [/\bTransformer[s]?\b/gi, 'Transformadores'],
  [/\bCircuit\s*breaker[s]?\b/gi, 'Interruptores'],
  [/\bBus\s*bar[s]?\b/gi, 'Barras colectoras'],
  [/\bBulk\s*material[s]?\b/gi, 'Material a granel'],
  [/\b(?:Compacted|Compact)\s*(?:back)?fill\b/gi, 'Relleno compactado'],
  // Single words
  [/\btraced\s*lines?\b/gi, 'trazado de líneas'],
  [/\bfoundation[s]?\b/gi, 'fundaciones'],
  [/\bdelivery\b/gi, 'entrega'],
  [/\bSubstation[s]?\b/gi, 'Subestación'],
  [/\bConstruction\b/gi, 'Construcción'],
  [/\bInstallation\b/gi, 'Instalación'],
  [/\bCompacted\b/gi, 'Compactado'],
  [/\bBackfill(?:ing)?\b/gi, 'Relleno'],
  [/\bExcavation\b/gi, 'Excavación'],
  [/\bReinforcement\b/gi, 'Armadura'],
  [/\bFormwork\b/gi, 'Encofrado'],
  [/\bConcrete\b/gi, 'Hormigón'],
  [/\bGrouting\b/gi, 'Grouting'],
  [/\bScaffolding\b/gi, 'Andamios'],
  [/\bFireproofing\b/gi, 'Ignifugación'],
  [/\bHydrotest(?:ing)?\b/gi, 'Prueba hidrostática'],
  [/\bWelding\b/gi, 'Soldadura'],
  [/\bTesting\b/gi, 'Pruebas'],
  [/\bPainting\b/gi, 'Pintura'],
  [/\bCleaning\b/gi, 'Limpieza'],
  [/\bCleanup\b/gi, 'Limpieza'],
  [/\bRemoval\b/gi, 'Retiro'],
  [/\bErection\b/gi, 'Montaje'],
  [/\bEquipment\b/gi, 'Equipos'],
  [/\bElectrical\b/gi, 'Eléctrico'],
  [/\bMechanical\b/gi, 'Mecánico'],
  [/\bStructure[s]?\b/gi, 'Estructuras'],
  [/\bSteel\b/gi, 'Acero'],
  [/\bPiling\b/gi, 'Pilotaje'],
  [/\bColumn[s]?\b/gi, 'Columnas'],
  [/\bBeam[s]?\b/gi, 'Vigas'],
  [/\bDrain[s]?\b/gi, 'Drenaje'],
  [/\bSlab[s]?\b/gi, 'Losa'],
  [/\bSoil[s]?\b/gi, 'Suelo'],
  [/\bPiping\b/gi, 'Cañerías'],
  [/\bPipe[s]?\b/gi, 'Tuberías'],
  [/\bValve[s]?\b/gi, 'Válvulas'],
  [/\bSupport[s]?\b/gi, 'Soportes'],
  [/\bHanger[s]?\b/gi, 'Colgadores'],
  [/\bInsulation\b/gi, 'Aislación'],
  [/\bRoof(?:ing)?\b/gi, 'Techumbre'],
  [/\bWall[s]?\b/gi, 'Muros'],
  [/\bFloor(?:ing)?\b/gi, 'Piso'],
  [/\bPlate[s]?\b/gi, 'Placas'],
  [/\bBolt[s]?\b/gi, 'Pernos'],
  [/\bWire[s]?\b/gi, 'Cables'],
  [/\bCable[s]?\b/gi, 'Cables'],
  [/\bTray[s]?\b/gi, 'Bandejas'],
  [/\bDuct[s]?\b/gi, 'Ductos'],
  [/\bTank[s]?\b/gi, 'Estanques'],
  [/\bVessel[s]?\b/gi, 'Recipientes'],
  [/\bPump[s]?\b/gi, 'Bombas'],
  [/\bMotor[s]?\b/gi, 'Motores'],
  [/\bArea[s]?\b/gi, 'Área'],
  [/\bSite\b/gi, 'Sitio'],
  [/\bPlant\b/gi, 'Planta'],
  [/\bUnit\b/gi, 'Unidad'],
  [/\band\b/gi, 'y'],
  [/\bof\b/gi, 'de'],
  [/\bfor\b/gi, 'para'],
  [/\bwith\b/gi, 'con'],
  [/\bin\b/gi, 'en'],
  [/\bfrom\b/gi, 'desde'],
  [/\bto\b/gi, 'a'],
  [/\bincluding\b/gi, 'incluyendo'],
  [/\bcomplete\b/gi, 'completo'],
  [/\bfinish\b/gi, 'terminación'],
  [/\bfinal\b/gi, 'final'],
  [/\bnew\b/gi, 'nuevo'],
  [/\bmain\b/gi, 'principal'],
  [/\bsecondary\b/gi, 'secundario'],
  [/\bprimary\b/gi, 'primario'],
  [/\bauxiliary\b/gi, 'auxiliar'],
  [/\btemporary\b/gi, 'temporal'],
  [/\bpermanent\b/gi, 'permanente'],
  [/\bunderground\b/gi, 'subterráneo'],
  [/\baboveground\b/gi, 'en superficie'],
];

export function cleanDescription(raw?: string): string {
  if (!raw) return '—';
  let s = raw.trim();
  
  // 1. Strip P6 prefix codes
  s = s.replace(STRIP_PREFIX_RE, '');
  
  // 2. Strip internal area codes
  s = s.replace(STRIP_AREA_CODES, '');
  
  // 3. Strip leading number sequences (WBS paths in descriptions)
  s = s.replace(STRIP_LEADING_NUMS, '');
  
  // 4. Strip parenthetical notes
  s = s.replace(STRIP_PARENS_CODES, '');
  
  // 5. Translate English→Spanish
  for (const [re, rep] of TRANSLATE) s = s.replace(re, rep);
  
  // 6. Clean up formatting artifacts
  s = s.replace(/\s*[-–—]\s*$/g, '');     // trailing dashes
  s = s.replace(/^\s*[-–—]\s*/g, '');      // leading dashes
  s = s.replace(/\s*[-–—]\s*[-–—]\s*/g, ' — '); // double dashes
  s = s.replace(/\s{2,}/g, ' ');           // multiple spaces
  s = s.replace(/^[,.\s]+/, '');           // leading punctuation
  s = s.trim();
  
  if (!s) return raw.trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Discipline Chart (horizontal bars) ───────────────────────────────────────

interface DiscData { discipline: string; hh: number; count: number; pct: number }

export function DisciplineChart({ data, onFilter }: { data: DiscData[]; onFilter?: (d: string | null) => void }) {
  if (!data.length) return null;
  const maxHH = Math.max(...data.map(d => d.hh));

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Distribución HH por Disciplina</p>
      <div className="space-y-2">
        {data.map(d => {
          const dc = getDiscColor(d.discipline);
          const pct = maxHH > 0 ? (d.hh / maxHH * 100) : 0;
          return (
            <button key={d.discipline} onClick={() => onFilter?.(d.discipline)} className="w-full text-left group">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dc.bar }} />
                <span className="text-[10px] font-bold text-slate-600 flex-1 truncate">{d.discipline}</span>
                <span className="text-[10px] font-black text-slate-500">{d.hh.toLocaleString('es-CL', { maximumFractionDigits: 0 })} HH</span>
                <span className="text-[9px] font-bold text-slate-400 w-10 text-right">{d.count} act</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden group-hover:bg-slate-200 transition">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: dc.bar }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Progress Donut ───────────────────────────────────────────────────────────

interface DonutData { label: string; value: number; color: string }

export function ProgressDonut({ segments, total, centerLabel }: { segments: DonutData[]; total: number; centerLabel: string }) {
  const R = 60, C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Estado de Actividades</p>
      <div className="flex items-center gap-6">
        <svg width={150} height={150} viewBox="0 0 150 150" className="shrink-0">
          <circle cx={75} cy={75} r={R} fill="none" stroke="#F1F5F9" strokeWidth={16} />
          {segments.map((seg, i) => {
            const pct = total > 0 ? seg.value / total : 0;
            const dash = pct * C;
            const el = (
              <circle key={i} cx={75} cy={75} r={R} fill="none" stroke={seg.color}
                strokeWidth={16} strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset} strokeLinecap="round"
                transform="rotate(-90 75 75)" className="transition-all duration-500" />
            );
            offset += dash;
            return el;
          })}
          <text x={75} y={70} textAnchor="middle" className="fill-slate-800 text-xl font-black">{total}</text>
          <text x={75} y={86} textAnchor="middle" className="fill-slate-400 text-[9px] font-bold uppercase">{centerLabel}</text>
        </svg>
        <div className="space-y-2 flex-1">
          {segments.map(seg => (
            <div key={seg.label} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-[10px] font-bold text-slate-600 flex-1">{seg.label}</span>
              <span className="text-[11px] font-black text-slate-700">{seg.value}</span>
              <span className="text-[9px] font-bold text-slate-400">{total > 0 ? Math.round(seg.value / total * 100) : 0}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Area Breakdown (CWP) ─────────────────────────────────────────────────────

interface AreaData { area: string; hh: number; count: number; avgProgress: number }

export function AreaBreakdown({ data, onFilter }: { data: AreaData[]; onFilter?: (a: string | null) => void }) {
  if (!data.length) return null;
  const maxHH = Math.max(...data.map(d => d.hh));

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">HH por Área / CWP</p>
      <div className="space-y-2 max-h-[200px] overflow-y-auto">
        {data.slice(0, 15).map(d => {
          const pct = maxHH > 0 ? (d.hh / maxHH * 100) : 0;
          const progColor = d.avgProgress >= 100 ? '#10B981' : d.avgProgress > 50 ? '#F59E0B' : '#94A3B8';
          return (
            <button key={d.area} onClick={() => onFilter?.(d.area)} className="w-full text-left group">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold text-slate-600 flex-1 truncate font-mono">{d.area}</span>
                <span className="text-[10px] font-black text-slate-500">{d.hh.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: progColor + '20', color: progColor }}>
                  {Math.round(d.avgProgress)}%
                </span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden group-hover:bg-slate-200 transition relative">
                <div className="h-full rounded-full transition-all bg-indigo-400" style={{ width: `${pct}%` }} />
                <div className="absolute top-0 left-0 h-full rounded-full bg-emerald-500 opacity-50" style={{ width: `${pct * d.avgProgress / 100}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tag Chips ────────────────────────────────────────────────────────────────

const TAG_COLORS = ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316'];

export interface ActivityTag {
  id: string;
  project_id: string;
  activity_id: string;
  tag_name: string;
  tag_color: string;
}

export function TagChips({
  tags, onRemove, onAdd, availableTags,
}: {
  tags: ActivityTag[];
  onRemove: (id: string) => void;
  onAdd: (name: string, color: string) => void;
  availableTags: string[];
}) {
  const [adding, setAdding] = React.useState(false);
  const [newTag, setNewTag] = React.useState('');
  const [newColor, setNewColor] = React.useState(TAG_COLORS[0]);

  const handleAdd = () => {
    if (!newTag.trim()) return;
    onAdd(newTag.trim(), newColor);
    setNewTag(''); setAdding(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map(t => (
          <span key={t.id} className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[9px] font-black text-white"
            style={{ backgroundColor: t.tag_color }}>
            {t.tag_name}
            <button onClick={() => onRemove(t.id)} className="w-3.5 h-3.5 rounded-full bg-white/30 hover:bg-white/50 flex items-center justify-center text-[8px] transition">×</button>
          </span>
        ))}
        {!adding && (
          <button onClick={() => setAdding(true)} className="px-2 py-0.5 rounded-full border border-dashed border-slate-300 text-[9px] font-bold text-slate-400 hover:border-slate-500 hover:text-slate-600 transition">
            + Categoría
          </button>
        )}
      </div>
      {adding && (
        <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
          <input value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="Nombre..." autoFocus
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="flex-1 text-[11px] px-2 py-1 rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            list="available-tags" />
          <datalist id="available-tags">
            {availableTags.map(t => <option key={t} value={t} />)}
          </datalist>
          <div className="flex gap-1">
            {TAG_COLORS.map(c => (
              <button key={c} onClick={() => setNewColor(c)}
                className={`w-4 h-4 rounded-full border-2 transition ${newColor === c ? 'border-slate-800 scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <button onClick={handleAdd} className="px-2 py-1 bg-indigo-500 text-white text-[9px] font-black rounded-md hover:bg-indigo-600 transition">OK</button>
          <button onClick={() => setAdding(false)} className="text-[9px] text-slate-400 hover:text-slate-600">×</button>
        </div>
      )}
    </div>
  );
}

// ─── Advance Filter Bar ───────────────────────────────────────────────────────

type ProgressRange = 'ALL' | '0' | '1-50' | '51-99' | '100';

export interface FilterState {
  discipline: string;
  area: string;
  tag: string;
  progressRange: ProgressRange;
  onlyOpenReqs: boolean;
}

export function FilterBar({
  filters, onChange, disciplines, areas, tagNames,
}: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  disciplines: string[];
  areas: string[];
  tagNames: string[];
}) {
  const set = (key: keyof FilterState, value: any) => onChange({ ...filters, [key]: value });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filtros:</span>

      <select value={filters.discipline} onChange={e => set('discipline', e.target.value)}
        className="text-[10px] font-bold border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
        <option value="ALL">Todas las disciplinas</option>
        {disciplines.map(d => <option key={d} value={d}>{d}</option>)}
      </select>

      <select value={filters.area} onChange={e => set('area', e.target.value)}
        className="text-[10px] font-bold border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
        <option value="ALL">Todas las áreas</option>
        {areas.map(a => <option key={a} value={a}>{a}</option>)}
      </select>

      {tagNames.length > 0 && (
        <select value={filters.tag} onChange={e => set('tag', e.target.value)}
          className="text-[10px] font-bold border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
          <option value="ALL">Todas las categorías</option>
          {tagNames.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      )}

      <select value={filters.progressRange} onChange={e => set('progressRange', e.target.value)}
        className="text-[10px] font-bold border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
        <option value="ALL">Todo avance</option>
        <option value="0">Sin iniciar (0%)</option>
        <option value="1-50">En inicio (1–50%)</option>
        <option value="51-99">Avanzado (51–99%)</option>
        <option value="100">Completado (100%)</option>
      </select>

      <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 cursor-pointer">
        <input type="checkbox" checked={filters.onlyOpenReqs} onChange={e => set('onlyOpenReqs', e.target.checked)}
          className="rounded border-slate-300" />
        Con requisitos
      </label>

      {(filters.discipline !== 'ALL' || filters.area !== 'ALL' || filters.tag !== 'ALL' || filters.progressRange !== 'ALL' || filters.onlyOpenReqs) && (
        <button onClick={() => onChange({ discipline: 'ALL', area: 'ALL', tag: 'ALL', progressRange: 'ALL', onlyOpenReqs: false })}
          className="text-[9px] font-bold text-rose-500 hover:text-rose-600 border border-rose-200 px-2 py-1 rounded-lg transition bg-rose-50">
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
