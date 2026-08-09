'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  CheckSquare, Square, Plus, Save, Palette, Eye, AlertTriangle, Eraser, Paintbrush, StopCircle,
  Loader2, ChevronDown, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseCwp } from '@/lib/awp-codigo';
import { parseJsonOrThrow } from './elementos-red';
import {
  CONTRASTE_COLOR, colorForIndex, hexToRgb, isSinAsignar, loadRevisionPrefs, paintColorFor,
  rgbToHex, saveRevisionPrefs,
} from './elementos-colores';
import { NIVELES, NIVEL_LABEL, type Nivel, type PaintTarget, type RevisionItem } from './elementos-tipos';

// CWP_ID = {CV}.{DISC}{NNN} (ej. 312101.D001) → CV = "312101" → CWA = CV[:4] = "3121"
// (misma convención que deriveCwaCv en /api/mining-elementos) — usado para armar el árbol CWA→CV→CWP.
function deriveCwaCvFromCwp(cwpId: string): { cwa: string | null; cv: string | null } {
  // El formato del CWP cambia por proyecto (CV.DiscSeq, CWP-área-sector-disc-seq,
  // WBS-CV-DiscSeq…), así que la derivación va contra el parser central. Antes se exigía
  // aquí un patrón de 6 dígitos y un punto: cualquier otro proyecto veía TODOS sus paquetes
  // caer en "sin clasificar", sin árbol CWA → CV.
  const p = parseCwp(cwpId);
  if (p) return { cwa: p.cwa_id, cv: p.cv_id };
  // "{CV}.SIN-CWP" → un CWP se asignó al revés (CV sin CWP todavía): anidar bajo su CV/CWA real.
  const mCv = cwpId.match(/^(\d{6})\.SIN-CWP$/);
  if (mCv) { const cv = mCv[1]; return { cwa: cv.slice(0, 4), cv }; }
  // "{CWA}.SIN-CV.SIN-CWP" → un elemento solo tiene CWA asignado: anidar bajo un CV sintético "por asignar".
  const mCwa = cwpId.match(/^(\d{4})\.SIN-CV\.SIN-CWP$/);
  if (mCwa) return { cwa: mCwa[1], cv: `${mCwa[1]}.SIN-CV` };
  return { cwa: null, cv: null };
}

// CWP_ID = {CV}.{DISC}{NNN} → la disciplina es la parte alfabética entre el punto y el número
// (ej. "312101.C001" → "C" = Civil, "312101.EH001" → "EH" = cableado) — es la MISMA letra sin importar
// el CWA/CV, así que sirve para agrupar "todos los Civil" del proyecto entero independiente de en qué
// sector/área caigan.
function deriveDisciplinaFromCwp(cwpId: string): string | null {
  const m = cwpId.match(/^\d{6}\.([A-Za-z]+)\d+$/);
  return m ? m[1].toUpperCase() : null;
}

function GroupCheckbox({ state }: { state: 'all' | 'some' | 'none' }) {
  if (state === 'all') return <CheckSquare className="w-3.5 h-3.5 text-blue-600" />;
  if (state === 'some') return (
    <div className="w-3.5 h-3.5 rounded-sm border-2 border-blue-600 flex items-center justify-center shrink-0">
      <div className="w-1.5 h-0.5 bg-blue-600" />
    </div>
  );
  return <Square className="w-3.5 h-3.5 text-slate-300" />;
}

export default function RevisionPanel({ projectId, viewerReady, onColorByLevel, onFocus, onViewSelected, onVerSinAsignar, paintTarget, onArmPaint, onStopPaint, onCatalogChanged, onNivelChange, refreshSignal }: {
  onVerSinAsignar: (nivel: Nivel) => void;
  projectId: string; viewerReady: boolean;
  onColorByLevel: (nivel: Nivel, selections: { codigo: string; r: number; g: number; b: number; a: number }[]) => void;
  onFocus: (nivel: Nivel, codigo: string) => void;
  onViewSelected: (nivel: Nivel, selections: { codigo: string; r: number; g: number; b: number; a: number }[]) => void;
  paintTarget: PaintTarget | null;
  onArmPaint: (nivel: Nivel, codigo: string, r: number, g: number, b: number, a: number) => void;
  onStopPaint: () => void;
  onCatalogChanged: () => void;
  onNivelChange?: (nivel: Nivel) => void;
  // Se incrementa desde la página cada vez que una reasignación (pintura 3D, árbol, fila o bulk)
  // escribe en la BD, para recargar los conteos (nElementos) sin esperar a un cambio de pestaña.
  refreshSignal?: number;
}) {
  // Los defaults de useState deben ser IGUALES en server y cliente (el server nunca tiene
  // localStorage) — si no, React detecta un mismatch de hidratación. La preferencia guardada se
  // aplica recién en el useEffect de abajo, que solo corre en el cliente después del montaje.
  // CWP por defecto: es el nivel donde se trabaja. CWA/CV/SWP son agrupaciones más gruesas
  // que se visitan de vez en cuando, no el punto de partida.
  const [nivel, setNivel] = useState<Nivel>('cwp');
  const nivelRef = useRef(nivel);
  nivelRef.current = nivel;
  const [items, setItems] = useState<RevisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [expandedCwa, setExpandedCwa] = useState<Set<string>>(new Set());
  const [expandedCv, setExpandedCv] = useState<Set<string>>(new Set());
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({});
  const [pendingOverrides, setPendingOverrides] = useState<Record<string, string>>({});
  const [savingColors, setSavingColors] = useState(false);
  const [colorError, setColorError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [mostrarFiltro, setMostrarFiltro] = useState<'todas' | 'oficiales' | 'creadas'>('todas');
  const [colorearCreadas, setColorearCreadas] = useState(true);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    const prefs = loadRevisionPrefs(projectId);
    if (prefs.nivel) setNivel(prefs.nivel);
    if (prefs.mostrarFiltro) setMostrarFiltro(prefs.mostrarFiltro);
    if (prefs.colorearCreadas !== undefined) setColorearCreadas(prefs.colorearCreadas);
    setPrefsLoaded(true);
  }, [projectId]);

  useEffect(() => { onNivelChange?.(nivel); }, [nivel, onNivelChange]);

  useEffect(() => {
    if (!prefsLoaded) return;
    saveRevisionPrefs(projectId, { nivel, mostrarFiltro, colorearCreadas });
  }, [projectId, nivel, mostrarFiltro, colorearCreadas, prefsLoaded]);
  const [newCodigo, setNewCodigo] = useState('');
  const [newNombre, setNewNombre] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const nivelPedido = nivel;
    Promise.all([
      fetch(`/api/mining-revision?project_id=${projectId}&nivel=${nivelPedido}`).then(parseJsonOrThrow),
      fetch(`/api/mining-colores?project_id=${projectId}&nivel=${nivelPedido}`).then(parseJsonOrThrow),
    ]).then(([rev, col]) => {
      // Si el usuario ya cambió de pestaña mientras esta respuesta viajaba, descártala —
      // sin este guard, una respuesta vieja (ej. CWA) puede llegar después y pisar los items de la pestaña actual (CV).
      if (nivelPedido !== nivelRef.current) return;
      setItems(rev.items ?? []);
      setColorOverrides(col.colores ?? {});
      setPendingOverrides({});
    }).catch(() => {}).finally(() => { if (nivelPedido === nivelRef.current) setLoading(false); });
  }, [projectId, nivel]);

  const saveColors = useCallback(async () => {
    if (!Object.keys(pendingOverrides).length) return;
    setSavingColors(true);
    setColorError(null);
    try {
      const res = await fetch('/api/mining-colores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, nivel, colores: pendingOverrides }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? 'Error al guardar colores');
      setColorOverrides(prev => ({ ...prev, ...pendingOverrides }));
      setPendingOverrides({});
    } catch (e: any) {
      setColorError(e.message);
    } finally {
      setSavingColors(false);
    }
  }, [pendingOverrides, projectId, nivel]);

  const createCategoria = useCallback(async () => {
    const codigo = newCodigo.trim();
    if (!codigo) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/mining-catalogo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, nivel, codigo, nombre: newNombre.trim() || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? 'Error al crear la categoría');
      setNewCodigo('');
      setNewNombre('');
      setShowNewForm(false);
      load();
      onCatalogChanged();
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  }, [newCodigo, newNombre, projectId, nivel, load, onCatalogChanged]);

  useEffect(() => { load(); setChecked(new Set()); }, [load]);

  // refreshSignal cambia tras CUALQUIER reasignación (pintura 3D, árbol, fila o bulk) — recarga los
  // conteos sin tocar `checked` (a diferencia del efecto de arriba, que sí lo resetea porque ahí el
  // cambio es de nivel/proyecto, no de datos). No se lista `load` en las deps a propósito: ya cambia
  // de nivel/projectId vía el efecto de arriba, listarlo aquí también duplicaría el fetch en cada
  // cambio de pestaña.
  const didMountRefreshRef = useRef(false);
  useEffect(() => {
    if (!didMountRefreshRef.current) { didMountRefreshRef.current = true; return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  // "Oficiales" = vienen del itemizado/DevPack original (catálogo importado). "Creadas" = se agregaron
  // después desde esta misma página (botón "+ Nueva categoría") o son placeholders "por asignar".
  const itemsFiltrados = useMemo(() => {
    if (mostrarFiltro === 'todas') return items;
    // "Sin asignar" siempre queda visible — no es ni oficial ni creada, es la bandeja de pendientes.
    return items.filter(it => isSinAsignar(it.codigo) || (mostrarFiltro === 'oficiales' ? it.esOficial : !it.esOficial));
  }, [items, mostrarFiltro]);

  // Árbol CWA → CV → CWP solo para el nivel CWP (los SIN-CWP.* sin patrón derivable quedan sueltos al final).
  const cwpTree = useMemo(() => {
    if (nivel !== 'cwp') return null;
    const byCwa = new Map<string, Map<string, RevisionItem[]>>();
    const sueltos: RevisionItem[] = [];
    for (const it of itemsFiltrados) {
      const { cwa, cv } = deriveCwaCvFromCwp(it.codigo);
      if (!cwa || !cv) { sueltos.push(it); continue; }
      if (!byCwa.has(cwa)) byCwa.set(cwa, new Map());
      const cvMap = byCwa.get(cwa)!;
      if (!cvMap.has(cv)) cvMap.set(cv, []);
      cvMap.get(cv)!.push(it);
    }
    return { byCwa, sueltos };
  }, [itemsFiltrados, nivel]);

  // Por defecto el árbol queda totalmente expandido (son pocos CWA/CV).
  useEffect(() => {
    if (!cwpTree) return;
    setExpandedCwa(new Set(cwpTree.byCwa.keys()));
    setExpandedCv(new Set([...cwpTree.byCwa.values()].flatMap(m => [...m.keys()])));
  }, [cwpTree]);

  const colorIndexByCodigo = useMemo(() => new Map(items.map((it, i) => [it.codigo, i])), [items]);
  const esOficialPorCodigo = useMemo(() => new Map(items.map(it => [it.codigo, it.esOficial])), [items]);
  const colorOf = (codigo: string): { r: number; g: number; b: number; a: number } => {
    if (!isSinAsignar(codigo)) {
      const hex = pendingOverrides[codigo] ?? colorOverrides[codigo];
      if (hex) return { ...hexToRgb(hex), a: 1 };
    }
    return paintColorFor(codigo, colorIndexByCodigo.get(codigo) ?? 0, esOficialPorCodigo.get(codigo) ?? true, colorearCreadas);
  };

  // Marcar un checkbox aísla/colorea de inmediato esos elementos en el visor — no hace falta
  // apretar un botón "Colorear marcados" aparte, el check ES la acción.
  //
  // toggleChecked/toggleGroup son simples: solo tocan el estado `checked`, nada más. Un único
  // useEffect (más abajo) reacciona a ese cambio y dispara la vista — así hay UN solo lugar que
  // decide cuándo mirar el visor, en vez de repetir la llamada en cada handler (eso fue lo que se
  // rompió antes: llamar setState de otro componente desde dentro de un updater de setChecked).
  const toggleChecked = (codigo: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(codigo) ? next.delete(codigo) : next.add(codigo);
      return next;
    });
  };

  const toggleGroup = (codes: string[]) => {
    setChecked(prev => {
      const next = new Set(prev);
      const allOn = codes.length > 0 && codes.every(c => next.has(c));
      for (const c of codes) allOn ? next.delete(c) : next.add(c);
      return next;
    });
  };

  // Ref con la última versión de "qué significa ver estos códigos" — se actualiza cada render pero
  // su IDENTIDAD nunca cambia, así el efecto de abajo puede depender SOLO de `checked` sin quedar
  // con datos viejos (nivel/colores/filtro actuales) ni reactivarse de más.
  const viewCheckedRef = useRef<(codes: Set<string>) => void>(() => {});
  viewCheckedRef.current = (codes: Set<string>) => {
    if (!codes.size) return;
    onViewSelected(nivel, itemsFiltrados.filter(it => codes.has(it.codigo)).map(it => ({ codigo: it.codigo, ...colorOf(it.codigo) })));
  };
  useEffect(() => { viewCheckedRef.current(checked); }, [checked]);

  const groupState = (codes: string[]): 'all' | 'some' | 'none' => {
    if (!codes.length) return 'none';
    const n = codes.filter(c => checked.has(c)).length;
    return n === 0 ? 'none' : n === codes.length ? 'all' : 'some';
  };

  const allCodes = useMemo(() => itemsFiltrados.map(i => i.codigo), [itemsFiltrados]);
  const selectAllState = groupState(allCodes);

  // Marcar un checkbox ya aísla/colorea esos elementos al instante (ver viewCodes) — este botón
  // colorea TODO el nivel filtrado de una vez (respeta el filtro Oficiales/Creadas).
  const handleColorear = () => {
    onColorByLevel(nivel, itemsFiltrados.map(it => ({ codigo: it.codigo, ...colorOf(it.codigo) })));
  };

  // El modelo entra YA coloreado por el nivel activo, y se recolorea al cambiar de pestaña.
  // El flujo pedido es "ver todo por color e ir pintando la propiedad que quiero" — no
  // apretar un botón para poder empezar. La ref evita recolorear en cada refresh de conteos.
  const autoColorRef = useRef('');
  useEffect(() => {
    if (!viewerReady || loading || !itemsFiltrados.length) return;
    const clave = `${projectId}:${nivel}`;
    if (autoColorRef.current === clave) return;
    autoColorRef.current = clave;
    handleColorear();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerReady, loading, nivel, projectId, itemsFiltrados.length]);

  // Vista de contraste — dos modos:
  // 1) Con CWP marcados en el árbol: cada uno marcado queda con un color de paleta DISTINTO por
  //    posición (ignora colorOf()/overrides por disciplina a propósito — esos hacen que todos los
  //    CWP de una misma disciplina comparten color y el límite entre ellos se pierde). Todo lo NO
  //    marcado queda casi negro, para que el límite de batería ENTRE los CWP marcados resalte.
  // 2) Sin nada marcado: fallback al contraste original oficial-vs-no-oficial (límite de batería AWP).
  const handleVistaContraste = () => {
    if (checked.size > 0) {
      const checkedCodes = items.map(it => it.codigo).filter(c => checked.has(c));
      const idxByCodigo = new Map(checkedCodes.map((c, i) => [c, i]));
      onColorByLevel(nivel, items.map(it => {
        const idx = idxByCodigo.get(it.codigo);
        return { codigo: it.codigo, ...(idx !== undefined ? { ...colorForIndex(idx), a: 1 } : CONTRASTE_COLOR) };
      }));
      return;
    }
    onColorByLevel(nivel, items.map(it => ({
      codigo: it.codigo,
      ...(it.esOficial && !isSinAsignar(it.codigo) ? { ...colorOf(it.codigo) } : CONTRASTE_COLOR),
    })));
  };

  const renderItem = (it: RevisionItem) => {
    const armed = paintTarget?.nivel === nivel && paintTarget.codigo === it.codigo;
    const sinAsignar = isSinAsignar(it.codigo);
    const { r, g, b, a } = colorOf(it.codigo);
    return (
      <div key={it.codigo} className={cn('px-3 py-2 border-b border-slate-100 hover:bg-blue-50 flex items-center gap-2', armed && 'bg-amber-50')}>
        <button onClick={() => toggleChecked(it.codigo)} className="shrink-0">
          {checked.has(it.codigo) ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5 text-slate-300" />}
        </button>
        {sinAsignar ? (
          <span className="w-3 h-3 rounded-full shrink-0 border-2 border-dashed border-slate-400 bg-white" title="Sin asignar — restaura el color nativo del CAD" />
        ) : (
          <input
            type="color"
            value={rgbToHex(r, g, b)}
            onClick={e => e.stopPropagation()}
            onChange={e => {
              const hex = e.target.value;
              setPendingOverrides(prev => {
                const next = { ...prev, [it.codigo]: hex };
                // Misma disciplina (la letra del CWP, ej. "C" de Civil) → mismo color en TODO el
                // proyecto, sin importar el CWA/CV: así no hay que repintar cada uno a mano.
                if (nivel === 'cwp') {
                  const disc = deriveDisciplinaFromCwp(it.codigo);
                  if (disc) {
                    for (const other of items) {
                      if (other.codigo !== it.codigo && deriveDisciplinaFromCwp(other.codigo) === disc) {
                        next[other.codigo] = hex;
                      }
                    }
                  }
                }
                return next;
              });
            }}
            title={nivel === 'cwp' ? 'Elegir un color para esta disciplina — se aplica a todos los CWP con la misma letra (recuerda Guardar)' : 'Elegir un color personalizado para este código (recuerda Guardar)'}
            className="w-3.5 h-3.5 shrink-0 rounded-full border-0 p-0 cursor-pointer appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border [&::-webkit-color-swatch]:border-slate-300"
          />
        )}
        <div onClick={() => onFocus(nivel, it.codigo)} className="flex-1 overflow-hidden cursor-pointer">
          <div className="font-mono text-[11px] font-bold text-[#1A1A1A] flex items-center gap-1.5">
            {it.codigo}
            {!sinAsignar && !it.esOficial && (
              <span className="px-1 py-0 rounded text-[8px] font-black uppercase bg-violet-100 text-violet-600 shrink-0">Nueva</span>
            )}
          </div>
          {it.nombre && <div className="text-[10px] text-slate-400 truncate">{it.nombre}</div>}
        </div>
        <span className="text-[10px] text-slate-400 font-mono shrink-0">{it.nElementos.toLocaleString('es-CL')}</span>
        <button
          onClick={() => armed ? onStopPaint() : onArmPaint(nivel, it.codigo, r, g, b, a)}
          title={armed
            ? 'Detener: dejar de mover elementos aquí'
            : sinAsignar
              ? 'Sacar de la categoría: click en 🖌️, luego click en los elementos mal pintados para restaurar su color original y quitarlos de este nivel'
              : 'Mover elementos aquí: click en 🖌️, luego click en los elementos del modelo'}
          className={cn('p-1 rounded shrink-0', armed ? 'bg-amber-500 text-white' : sinAsignar ? 'bg-slate-100 hover:bg-slate-200 text-slate-500 ring-1 ring-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-500')}
        >
          {armed ? <StopCircle className="w-3.5 h-3.5" /> : sinAsignar ? <Eraser className="w-3.5 h-3.5" /> : <Paintbrush className="w-3.5 h-3.5" />}
        </button>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Panel descomprimido: el flujo normal es MIRAR el modelo ya coloreado y PINTAR.
          Lo diario queda a la vista (una fila de acciones); lo ocasional se pliega:
          crear categoría vive junto al filtro, el límite de batería aparece recién al
          marcar 2, y la ayuda larga es un desplegable. */}
      <div className="px-3 py-2 border-b border-slate-100 space-y-2 shrink-0">
        <div className="flex gap-1">
          {NIVELES.map(n => (
            <button
              key={n} onClick={() => setNivel(n)}
              className={cn('flex-1 py-1 rounded text-[10.5px] font-bold uppercase',
                nivel === n ? 'bg-[#FF0000] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}
            >
              {NIVEL_LABEL[n]}
            </button>
          ))}
        </div>

        {/* Las dos acciones del día a día, en una sola fila */}
        <div className="flex gap-1.5">
          <button
            onClick={handleColorear}
            disabled={!viewerReady || loading}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-[#FF0000] hover:bg-[#A00000] disabled:opacity-40 text-white rounded px-2 py-1.5 text-[10.5px] font-bold"
            title={!viewerReady ? 'Abre el modelo 3D primero' : 'Vuelve a colorear todo el modelo por este nivel'}
          >
            <Palette className="w-3.5 h-3.5" /> Recolorear
          </button>
          <button
            onClick={() => onVerSinAsignar(nivel)}
            disabled={!viewerReady || loading}
            className="flex-1 inline-flex items-center justify-center gap-1.5 border-2 border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-40 text-[#A00000] rounded px-2 py-1.5 text-[10.5px] font-black"
            title={`Aísla en rojo la geometría que todavía no pertenece a ningún ${NIVEL_LABEL[nivel]}`}
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Falta por asignar
          </button>
        </div>

        {/* Solo aparece cuando tiene sentido: con 2+ paquetes marcados */}
        {checked.size >= 2 && (
          <button
            onClick={handleVistaContraste}
            disabled={!viewerReady || loading}
            className="w-full inline-flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-black disabled:opacity-40 text-white rounded px-2 py-1.5 text-[10.5px] font-bold"
            title={`Los ${checked.size} marcados con colores bien distintos entre sí y el resto en negro`}
          >
            <Eye className="w-3.5 h-3.5" /> Límite de batería ({checked.size})
          </button>
        )}
        {Object.keys(pendingOverrides).length > 0 && (
          <button
            onClick={saveColors} disabled={savingColors}
            className="w-full inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded px-2 py-1.5 text-[10.5px] font-bold"
          >
            <Save className="w-3.5 h-3.5" /> {savingColors ? 'Guardando…' : `Guardar ${Object.keys(pendingOverrides).length} color(es)`}
          </button>
        )}
        {colorError && <p className="text-[9.5px] text-red-600 font-bold">{colorError}</p>}

        {/* Filtro + crear categoría en la misma fila: crear es ocasional */}
        <div className="flex items-center gap-1">
          {(['todas', 'oficiales', 'creadas'] as const).map(f => (
            <button
              key={f} onClick={() => setMostrarFiltro(f)}
              className={cn('flex-1 py-1 rounded text-[9.5px] font-bold uppercase',
                mostrarFiltro === f ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}
            >
              {f === 'todas' ? 'Todas' : f === 'oficiales' ? 'Oficiales' : 'Creadas'}
            </button>
          ))}
          <button
            onClick={() => setShowNewForm(v => !v)}
            title={`Nueva categoría ${NIVEL_LABEL[nivel]}`}
            className={cn('shrink-0 px-2 py-1 rounded text-[9.5px] font-bold border border-dashed',
              showNewForm ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-blue-300 text-blue-600 hover:bg-blue-50')}
          >
            <Plus className="w-3 h-3 inline" /> Nueva
          </button>
        </div>
        {showNewForm && (
          <div className="border border-blue-200 bg-blue-50 rounded p-2 space-y-1.5">
            <input
              autoFocus value={newCodigo} onChange={e => setNewCodigo(e.target.value)}
              placeholder={`Código del nuevo ${NIVEL_LABEL[nivel]}…`}
              className="w-full px-2 py-1 text-[11px] border border-slate-200 rounded"
            />
            <input
              value={newNombre} onChange={e => setNewNombre(e.target.value)}
              placeholder="Nombre (opcional)"
              className="w-full px-2 py-1 text-[11px] border border-slate-200 rounded"
            />
            {createError && <p className="text-[9.5px] text-red-600 font-bold">{createError}</p>}
            <div className="flex gap-1.5">
              <button
                onClick={createCategoria} disabled={creating || !newCodigo.trim()}
                className="flex-1 inline-flex items-center justify-center gap-1 bg-[#FF0000] hover:bg-[#A00000] disabled:opacity-40 text-white rounded px-2 py-1 text-[10.5px] font-bold"
              >
                {creating ? 'Creando…' : 'Crear'}
              </button>
              <button
                onClick={() => { setShowNewForm(false); setNewCodigo(''); setNewNombre(''); setCreateError(null); }}
                className="px-2 py-1 text-[10.5px] font-bold text-slate-500 hover:text-slate-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {checked.size > 0 && (
          <p className="text-[9.5px] text-blue-600 font-bold text-center">{checked.size} marcado(s) — aislado(s) en el visor</p>
        )}

        {/* La ayuda larga, plegada: estorbaba más de lo que ayudaba siempre visible */}
        <details className="text-[9.5px] text-slate-400 leading-snug">
          <summary className="cursor-pointer font-bold text-slate-500 select-none">¿Cómo se usa?</summary>
          <p className="mt-1">
            El modelo entra coloreado por {NIVEL_LABEL[nivel]}. Click en uno de la lista para ubicarlo en el visor.
            Si ves elementos del color equivocado, click en 🖌️ del {NIVEL_LABEL[nivel]} correcto y luego click en esos
            elementos en el modelo para moverlos ahí — nada se guarda hasta que aprietas <b>Guardar</b>; <b>Detener</b> descarta
            y restaura los colores. Para sacar un elemento de su categoría usa el botón <Eraser className="w-2.5 h-2.5 inline" /> de
            &quot;Sin {NIVEL_LABEL[nivel]} asignado&quot; (círculo punteado) y click en el elemento.
          </p>
          <label className="mt-1.5 flex items-center gap-1.5 text-[9.5px] text-slate-500 font-bold cursor-pointer">
            <input type="checkbox" checked={colorearCreadas} onChange={e => setColorearCreadas(e.target.checked)} className="accent-blue-600" />
            Colorear las &quot;Nuevas&quot; con su propio color (si no, quedan con el color normal del CAD)
          </label>
        </details>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => toggleGroup(allCodes)}
            disabled={!allCodes.length}
            className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-blue-600 disabled:opacity-40"
          >
            <GroupCheckbox state={selectAllState} /> {selectAllState === 'all' ? 'Deseleccionar todos' : 'Seleccionar todos'}
          </button>
          {checked.size > 0 && <span className="text-[10px] text-slate-400">{checked.size} marcado(s)</span>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400 gap-2 text-[11px]"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
        ) : !itemsFiltrados.length ? (
          <div className="p-6 text-center text-[11px] text-slate-400 italic">
            {items.length ? 'Nada que mostrar con este filtro.' : `Sin ${NIVEL_LABEL[nivel]} para este proyecto.`}
          </div>
        ) : nivel !== 'cwp' || !cwpTree ? (
          mostrarFiltro !== 'todas' ? itemsFiltrados.map(renderItem) : (
            <>
              {itemsFiltrados.some(it => it.esOficial || isSinAsignar(it.codigo)) && (
                <div className="px-2 py-1 bg-slate-100 border-b border-slate-200">
                  <span className="text-[9.5px] font-black uppercase text-slate-500">Oficiales</span>
                </div>
              )}
              {itemsFiltrados.filter(it => it.esOficial || isSinAsignar(it.codigo)).map(renderItem)}
              {itemsFiltrados.some(it => !it.esOficial && !isSinAsignar(it.codigo)) && (
                <div className="px-2 py-1 bg-violet-50 border-b border-violet-100">
                  <span className="text-[9.5px] font-black uppercase text-violet-600">Creadas en la app</span>
                </div>
              )}
              {itemsFiltrados.filter(it => !it.esOficial && !isSinAsignar(it.codigo)).map(renderItem)}
            </>
          )
        ) : (
          <>
            {[...cwpTree.byCwa.entries()].map(([cwa, cvMap]) => {
              const cwaCodes = [...cvMap.values()].flat().map(i => i.codigo);
              const cwaOpen = expandedCwa.has(cwa);
              return (
                <div key={cwa}>
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-100 border-b border-slate-200">
                    <button onClick={() => toggleGroup(cwaCodes)} className="shrink-0"><GroupCheckbox state={groupState(cwaCodes)} /></button>
                    <button
                      onClick={() => setExpandedCwa(prev => { const n = new Set(prev); n.has(cwa) ? n.delete(cwa) : n.add(cwa); return n; })}
                      className="flex items-center gap-1 flex-1 text-left"
                    >
                      {cwaOpen ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                      <span className="font-mono text-[11px] font-black text-[#1A1A1A]">CWA {cwa}</span>
                      <span className="text-[9px] text-slate-400">({cwaCodes.length} CWP)</span>
                    </button>
                  </div>
                  {cwaOpen && [...cvMap.entries()].map(([cv, cvItems]) => {
                    const cvCodes = cvItems.map(i => i.codigo);
                    const cvOpen = expandedCv.has(cv);
                    return (
                      <div key={cv}>
                        <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 border-b border-slate-100">
                          <button onClick={() => toggleGroup(cvCodes)} className="shrink-0"><GroupCheckbox state={groupState(cvCodes)} /></button>
                          <button
                            onClick={() => setExpandedCv(prev => { const n = new Set(prev); n.has(cv) ? n.delete(cv) : n.add(cv); return n; })}
                            className="flex items-center gap-1 flex-1 text-left"
                          >
                            {cvOpen ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                            <span className="font-mono text-[10.5px] font-bold text-slate-600">CV {cv}</span>
                            <span className="text-[9px] text-slate-400">({cvCodes.length})</span>
                          </button>
                        </div>
                        {cvOpen && cvItems.map(renderItem)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {cwpTree.sueltos.length > 0 && (
              <div>
                <div className="px-2 py-1.5 bg-slate-100 border-b border-slate-200">
                  <span className="text-[10px] font-black uppercase text-slate-500">Sin clasificar (sin CWA/CV derivable)</span>
                </div>
                {cwpTree.sueltos.map(renderItem)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
