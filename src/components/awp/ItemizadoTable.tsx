'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, ChevronUp, ChevronDown } from 'lucide-react';

// Vista Excel del Formulario ECO-02 // ITEMIZADO (CMDIC · Contrato CC-06)
// Réplica visual del formulario económico: encabezado corporativo, grilla con
// letras de columna, gridlines, fila de totales y celdas editables CWP / BMP.

interface ItemRow {
  id: string;
  item: string;
  n_partida: string | null;
  partida_bmp: string | null;
  area: string | null;
  cwa_id: string | null;
  wbs: string | null;
  descripcion_codigo: string | null;
  commodity: string | null;
  descripcion: string;
  obra: string | null;
  unidad: string | null;
  cantidad: number | null;
  hh_unidad: number | null;
  hh_item: number | null;
  pu_clp: number | null;
  p_total_clp: number | null;
  tipo_partida: string | null;
  cwp_id: string | null;
}

interface CWP { cwp_id: string; cwp_nombre: string; cwa_id: string; disciplina?: string; disciplina_cod?: string; }
interface PartidaBmp { partida: string; nombre: string | null; commodity: string | null; pasos_fisico: number; hitos_financiero: number; }

const GRID = '#D4D4D4';
const HEAD_BG = '#F2F2F2';
const num = (v: number | null | undefined, dec = 0) => v == null ? '' : v.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const clp = (v: number | null | undefined) => v == null ? '' : '$' + Math.round(v).toLocaleString('es-CL');

type ColDef = { key: keyof ItemRow | 'bmp_edit' | 'cwp_edit'; letter: string; label: string; width: number; align?: 'right' | 'center'; render?: (r: ItemRow) => string };

const COLS: ColDef[] = [
  { key: 'area', letter: 'A', label: 'Área', width: 46, align: 'center' },
  { key: 'item', letter: 'B', label: 'Item', width: 44, align: 'center' },
  { key: 'n_partida', letter: 'C', label: 'N° de Partida', width: 88 },
  { key: 'commodity', letter: 'D', label: 'Commodity', width: 130 },
  { key: 'descripcion', letter: 'E', label: 'Descripción', width: 300 },
  { key: 'obra', letter: 'F', label: 'Obra', width: 170 },
  { key: 'unidad', letter: 'G', label: 'Unidad', width: 52, align: 'center' },
  { key: 'cantidad', letter: 'H', label: 'Cantidad', width: 74, align: 'right', render: r => num(r.cantidad, r.cantidad != null && r.cantidad % 1 !== 0 ? 1 : 0) },
  { key: 'hh_item', letter: 'I', label: 'HH/Item', width: 72, align: 'right', render: r => num(r.hh_item) },
  { key: 'pu_clp', letter: 'J', label: 'PU', width: 92, align: 'right', render: r => clp(r.pu_clp) },
  { key: 'p_total_clp', letter: 'K', label: 'P. Total', width: 106, align: 'right', render: r => clp(r.p_total_clp) },
  { key: 'bmp_edit', letter: 'L', label: 'Partida BMP', width: 96, align: 'center' },
  { key: 'cwp_edit', letter: 'M', label: 'CWP', width: 110, align: 'center' },
];

export default function ItemizadoTable({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [cwps, setCwps] = useState<CWP[]>([]);
  const [partidas, setPartidas] = useState<PartidaBmp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [soloSinCwp, setSoloSinCwp] = useState(false);
  const [soloSinBmp, setSoloSinBmp] = useState(false);
  const [sortBy, setSortBy] = useState<string>('item');
  const [sortAsc, setSortAsc] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ rowId: string; kind: 'cwp' | 'bmp' } | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [selRow, setSelRow] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  // Arrastre tipo Excel (fill handle): arrastra el cuadradito de una celda CWP/BMP con valor para rellenar hacia abajo/arriba
  const [drag, setDrag] = useState<{ kind: 'cwp' | 'bmp'; value: string; from: number; to: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const load = async () => {
    try {
      const res = await fetch(`/api/mining-conciliacion?project_id=${projectId}&rel=eco2_full`);
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error);
      setItems(d.items ?? []);
      setCwps(d.cwps ?? []);
      setPartidas(d.partidas ?? []);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [projectId]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPicker(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const bmpCodes = useMemo(() => new Set(partidas.map(p => p.partida)), [partidas]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    let rows = items;
    if (q) rows = rows.filter(r => [r.item, r.n_partida, r.descripcion, r.obra, r.area, r.commodity, r.cwp_id, r.partida_bmp].some(v => v && String(v).toUpperCase().includes(q)));
    if (soloSinCwp) rows = rows.filter(r => !r.cwp_id);
    if (soloSinBmp) rows = rows.filter(r => !r.partida_bmp || !bmpCodes.has(r.partida_bmp));
    const s = [...rows];
    s.sort((a: any, b: any) => {
      const av = a[sortBy]; const bv = b[sortBy];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : (!isNaN(Number(av)) && !isNaN(Number(bv)) ? Number(av) - Number(bv) : String(av).localeCompare(String(bv), 'es-CL'));
      return sortAsc ? cmp : -cmp;
    });
    return s;
  }, [items, search, soloSinCwp, soloSinBmp, sortBy, sortAsc, bmpCodes]);

  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  // Al soltar el mouse, aplica el valor arrastrado a todas las filas del rango
  useEffect(() => {
    const up = async () => {
      const d = dragRef.current;
      if (!d) return;
      setDrag(null);
      const [a, b] = [Math.min(d.from, d.to), Math.max(d.from, d.to)];
      const campo = d.kind === 'cwp' ? 'cwp_id' : 'partida_bmp';
      const rows = filteredRef.current.slice(a, b + 1).filter(r => (r as any)[campo] !== d.value);
      if (!rows.length) return;
      setSaving('bulk');
      setError(null);
      const ids = new Set(rows.map(r => r.id));
      setItems(prev => prev.map(r => ids.has(r.id) ? { ...r, [campo]: d.value } : r));
      try {
        await Promise.all(rows.map(r =>
          fetch('/api/mining-conciliacion', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projectId, rel: d.kind === 'cwp' ? 'eco2_cwp' : 'item_bmp', id: r.id, target: d.value }),
          }).then(async res => { if (!res.ok) { const dd = await res.json(); throw new Error(dd?.error); } })
        ));
      } catch (e: any) {
        setError(`Error al rellenar: ${e.message} — recargando datos`);
        load();
      }
      setSaving(null);
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [projectId]);

  const tot = useMemo(() => ({
    hh: items.reduce((s, r) => s + (r.hh_item ?? 0), 0),
    clp: items.reduce((s, r) => s + (r.p_total_clp ?? 0), 0),
    cwpOk: items.filter(r => r.cwp_id).length,
    bmpOk: items.filter(r => r.partida_bmp && bmpCodes.has(r.partida_bmp)).length,
  }), [items, bmpCodes]);

  const asignar = async (row: ItemRow, kind: 'cwp' | 'bmp', target: string | null) => {
    setSaving(row.id); setError(null);
    try {
      const res = await fetch('/api/mining-conciliacion', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, rel: kind === 'cwp' ? 'eco2_cwp' : 'item_bmp', id: row.id, target }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error);
      setItems(prev => prev.map(r => r.id === row.id ? { ...r, [kind === 'cwp' ? 'cwp_id' : 'partida_bmp']: target } : r));
      setPicker(null); setPickerSearch('');
    } catch (e: any) { setError(e.message); }
    setSaving(null);
  };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 96, color: '#757575', fontSize: 13 }}><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> Cargando ECO-2…</div>;
  if (error && !items.length) return <div style={{ color: '#A00000', fontSize: 13, padding: 32 }}>{error}</div>;

  const totalW = 34 + COLS.reduce((s, c) => s + c.width, 0);
  const fontFam = "'Calibri', 'Segoe UI', sans-serif";

  const cellStyle = (align?: string): React.CSSProperties => ({
    border: `1px solid ${GRID}`,
    padding: '2px 6px',
    fontSize: 11,
    fontFamily: fontFam,
    color: '#1A1A1A',
    textAlign: (align as any) ?? 'left',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    backgroundColor: 'white',
  });

  const renderPicker = (row: ItemRow, kind: 'cwp' | 'bmp') => {
    const q = pickerSearch.toUpperCase();
    const opts = kind === 'cwp'
      ? cwps.filter(c => !q || c.cwp_id.toUpperCase().includes(q) || c.cwp_nombre.toUpperCase().includes(q))
      : partidas.filter(p => !q || p.partida.toUpperCase().includes(q) || (p.nombre ?? '').toUpperCase().includes(q) || (p.commodity ?? '').toUpperCase().includes(q));
    return (
      <div ref={pickerRef} style={{ position: 'absolute', top: '100%', right: 0, marginTop: 2, backgroundColor: 'white', border: '1px solid #BDBDBD', borderRadius: 6, boxShadow: '0 12px 28px rgba(0,0,0,0.18)', zIndex: 200, width: 320, maxHeight: 300, overflowY: 'auto', textAlign: 'left' }}>
        <div style={{ padding: 6, borderBottom: `1px solid ${GRID}`, position: 'sticky', top: 0, backgroundColor: 'white', display: 'flex', gap: 6 }}>
          <input autoFocus value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder={kind === 'cwp' ? 'Buscar CWP…' : 'Buscar partida BMP…'} style={{ flex: 1, padding: '4px 8px', border: '1px solid #E0E0E0', borderRadius: 4, fontSize: 11, outline: 'none', fontFamily: fontFam }} />
          {(kind === 'cwp' ? row.cwp_id : row.partida_bmp) && (
            <button onClick={() => asignar(row, kind, null)} style={{ fontSize: 10, color: '#A00000', background: 'none', border: '1px solid #FECACA', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>Quitar</button>
          )}
        </div>
        {kind === 'bmp' && row.n_partida && (
          <div style={{ padding: '4px 8px', fontSize: 9.5, color: '#757575', borderBottom: `1px solid ${GRID}`, backgroundColor: '#FAFAFA' }}>N° Partida del item: <b style={{ fontFamily: 'monospace' }}>{row.n_partida}</b></div>
        )}
        {(opts as any[]).slice(0, 80).map((o: any) => {
          const code = kind === 'cwp' ? o.cwp_id : o.partida;
          const name = kind === 'cwp' ? o.cwp_nombre : (o.nombre ?? '');
          const sub = kind === 'cwp' ? (o.disciplina ?? '') : `${o.commodity ?? ''} · ${o.pasos_fisico} pasos físicos · ${o.hitos_financiero} hitos pago`;
          const sugerido = kind === 'bmp' && row.n_partida && row.n_partida.startsWith(code);
          return (
            <button key={code} onClick={() => asignar(row, kind, code)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 10px', borderBottom: '1px solid #F5F5F5', backgroundColor: sugerido ? '#FEF3C7' : 'transparent', border: 'none', cursor: 'pointer', fontFamily: fontFam }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#EBF3FD')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = sugerido ? '#FEF3C7' : 'transparent')}>
              <span style={{ fontFamily: 'monospace', fontSize: 10.5, fontWeight: 700, color: '#1A1A1A' }}>{code}</span>
              {sugerido && <span style={{ marginLeft: 6, fontSize: 8.5, fontWeight: 900, color: '#B45309' }}>SUGERIDO</span>}
              <div style={{ fontSize: 10, color: '#33475B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
              <div style={{ fontSize: 9, color: '#9E9E9E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ fontFamily: fontFam }}>
      {/* Barra de control (fuera de la "hoja") */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <Search style={{ width: 13, height: 13, position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#BDBDBD' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar en la hoja…" style={{ paddingLeft: 26, paddingRight: 10, paddingTop: 5, paddingBottom: 5, borderRadius: 4, border: '1px solid #D0D0D0', fontSize: 11.5, outline: 'none', width: 200, fontFamily: fontFam }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#33475B', cursor: 'pointer' }}>
          <input type="checkbox" checked={soloSinCwp} onChange={e => setSoloSinCwp(e.target.checked)} /> Solo sin CWP ({items.length - tot.cwpOk})
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#33475B', cursor: 'pointer' }}>
          <input type="checkbox" checked={soloSinBmp} onChange={e => setSoloSinBmp(e.target.checked)} /> Solo sin BMP ({items.length - tot.bmpOk})
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, backgroundColor: tot.cwpOk === items.length ? '#DCFCE7' : '#FEE2E2', color: tot.cwpOk === items.length ? '#166534' : '#A00000' }}>CWP {Math.round(tot.cwpOk / Math.max(items.length, 1) * 100)}%</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, backgroundColor: tot.bmpOk === items.length ? '#DCFCE7' : '#FEF3C7', color: tot.bmpOk === items.length ? '#166534' : '#B45309' }}>BMP {Math.round(tot.bmpOk / Math.max(items.length, 1) * 100)}%</span>
        </div>
      </div>
      {error && <div style={{ marginBottom: 8, fontSize: 10.5, color: '#A00000', backgroundColor: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '6px 10px' }}>{error}</div>}

      {/* La "hoja" Excel */}
      <div style={{ border: '1px solid #BDBDBD', borderRadius: 2, overflow: 'auto', maxHeight: 'calc(100vh - 250px)', backgroundColor: '#E8E8E8' }}>
        <div style={{ width: totalW, minWidth: '100%', backgroundColor: 'white' }}>
          {/* Encabezado corporativo del formulario */}
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 220px', borderBottom: `2px solid #1A1A1A`, backgroundColor: 'white', position: 'sticky', left: 0 }}>
            <div style={{ borderRight: `1px solid ${GRID}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
              <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: 1, color: '#FF0000', lineHeight: 1 }}>EISA</div>
              <div style={{ fontSize: 7.5, color: '#757575', marginTop: 2, textAlign: 'center' }}>INGENIERÍA Y CONSTRUCCIÓN</div>
            </div>
            <div style={{ textAlign: 'center', padding: '6px 8px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#33475B' }}>COMPAÑÍA MINERA DOÑA INÉS DE COLLAHUASI SCM · VICEPRESIDENCIA DE PROYECTOS</div>
              <div style={{ fontSize: 9.5, color: '#757575' }}>Proyecto Crecimiento Ujina — Contrato CC-06: Obras Civiles y Montaje Puerto Collahuasi</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', marginTop: 2 }}>FORMULARIO ECO-02 <span style={{ color: '#FF0000' }}>//</span> ITEMIZADO</div>
            </div>
            <div style={{ borderLeft: `1px solid ${GRID}`, fontSize: 9, color: '#33475B', padding: '6px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <div><b>N° CMDIC:</b> <span style={{ fontFamily: 'monospace' }}>333-BA-05000010</span></div>
              <div><b>EMISIÓN:</b> 29-04-2025 · <b>REV:</b> 0</div>
              <div><b>ITEMS:</b> {num(items.length)} · <b>HH:</b> {num(tot.hh)}</div>
            </div>
          </div>

          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: totalW }}>
            <colgroup>
              <col style={{ width: 34 }} />
              {COLS.map(c => <col key={c.key} style={{ width: c.width }} />)}
            </colgroup>
            <thead>
              {/* Letras de columna estilo Excel */}
              <tr>
                <th style={{ ...cellStyle('center'), backgroundColor: '#E8E8E8', color: '#757575', fontSize: 9.5, fontWeight: 400, position: 'sticky', top: 0, zIndex: 10 }} />
                {COLS.map(c => (
                  <th key={c.key} style={{ ...cellStyle('center'), backgroundColor: '#E8E8E8', color: '#757575', fontSize: 9.5, fontWeight: 400, position: 'sticky', top: 0, zIndex: 10 }}>{c.letter}</th>
                ))}
              </tr>
              {/* Encabezados de columna */}
              <tr>
                <th style={{ ...cellStyle('center'), backgroundColor: HEAD_BG, fontWeight: 700, fontSize: 9.5, position: 'sticky', top: 21, zIndex: 10 }}>#</th>
                {COLS.map(c => {
                  const sortable = c.key !== 'bmp_edit' && c.key !== 'cwp_edit';
                  return (
                    <th key={c.key}
                      onClick={() => { if (!sortable) return; if (sortBy === c.key) setSortAsc(!sortAsc); else { setSortBy(c.key as string); setSortAsc(true); } }}
                      style={{ ...cellStyle(c.align ?? 'center'), backgroundColor: HEAD_BG, fontWeight: 700, fontSize: 10, cursor: sortable ? 'pointer' : 'default', position: 'sticky', top: 21, zIndex: 10, userSelect: 'none' }}>
                      {c.label}{sortBy === c.key && (sortAsc ? <ChevronUp style={{ width: 10, height: 10, display: 'inline', marginLeft: 2 }} /> : <ChevronDown style={{ width: 10, height: 10, display: 'inline', marginLeft: 2 }} />)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const bmpOk = r.partida_bmp && bmpCodes.has(r.partida_bmp);
                const sel = selRow === r.id;
                const enRango = (kind: 'cwp' | 'bmp') => !!drag && drag.kind === kind && i >= Math.min(drag.from, drag.to) && i <= Math.max(drag.from, drag.to);
                const handle = (kind: 'cwp' | 'bmp', value: string | null) => value ? (
                  <div
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setDrag({ kind, value, from: i, to: i }); }}
                    title="Arrastra para rellenar (como Excel)"
                    style={{ position: 'absolute', right: 0, bottom: 0, width: 8, height: 8, backgroundColor: '#FF0000', border: '1px solid white', cursor: 'crosshair', zIndex: 5 }} />
                ) : null;
                return (
                  <tr key={r.id} onClick={() => setSelRow(r.id)}
                    onMouseEnter={() => { if (dragRef.current) setDrag(d => d ? { ...d, to: i } : d); }}
                    style={{ backgroundColor: sel ? '#EBF3FD' : 'white', userSelect: drag ? 'none' : undefined }}>
                    <td style={{ ...cellStyle('center'), backgroundColor: '#F7F7F7', color: '#9E9E9E', fontSize: 9.5 }}>{i + 1}</td>
                    {COLS.map(c => {
                      if (c.key === 'bmp_edit') {
                        const rango = enRango('bmp');
                        return (
                          <td key={c.key} style={{ ...cellStyle('center'), backgroundColor: rango ? '#FEE2E2' : sel ? '#EBF3FD' : undefined, position: 'relative', overflow: 'visible', outline: rango ? '2px dashed #FF0000' : undefined, outlineOffset: -2 }}>
                            <button onClick={e => { e.stopPropagation(); setPicker(picker?.rowId === r.id && picker.kind === 'bmp' ? null : { rowId: r.id, kind: 'bmp' }); setPickerSearch(''); }}
                              style={{ width: '100%', border: 'none', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace', fontWeight: 700, padding: '1px 4px', borderRadius: 3, backgroundColor: bmpOk ? '#DCFCE7' : r.partida_bmp ? '#FEF3C7' : '#FEE2E2', color: bmpOk ? '#166534' : r.partida_bmp ? '#B45309' : '#A00000' }}>
                              {saving === r.id || (saving === 'bulk' && rango) ? '…' : (r.partida_bmp ?? '+ BMP')}
                            </button>
                            {handle('bmp', r.partida_bmp)}
                            {picker?.rowId === r.id && picker.kind === 'bmp' && renderPicker(r, 'bmp')}
                          </td>
                        );
                      }
                      if (c.key === 'cwp_edit') {
                        const rango = enRango('cwp');
                        return (
                          <td key={c.key} style={{ ...cellStyle('center'), backgroundColor: rango ? '#FEE2E2' : sel ? '#EBF3FD' : undefined, position: 'relative', overflow: 'visible', outline: rango ? '2px dashed #FF0000' : undefined, outlineOffset: -2 }}>
                            <button onClick={e => { e.stopPropagation(); setPicker(picker?.rowId === r.id && picker.kind === 'cwp' ? null : { rowId: r.id, kind: 'cwp' }); setPickerSearch(''); }}
                              style={{ width: '100%', border: 'none', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace', fontWeight: 700, padding: '1px 4px', borderRadius: 3, backgroundColor: r.cwp_id ? '#DCFCE7' : '#FEE2E2', color: r.cwp_id ? '#166534' : '#A00000' }}>
                              {saving === r.id || (saving === 'bulk' && rango) ? '…' : (r.cwp_id ?? '+ CWP')}
                            </button>
                            {handle('cwp', r.cwp_id)}
                            {picker?.rowId === r.id && picker.kind === 'cwp' && renderPicker(r, 'cwp')}
                          </td>
                        );
                      }
                      const raw = c.render ? c.render(r) : (r[c.key as keyof ItemRow] ?? '');
                      return <td key={c.key} title={String(raw)} style={{ ...cellStyle(c.align), backgroundColor: sel ? '#EBF3FD' : undefined }}>{raw as string}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...cellStyle('center'), backgroundColor: HEAD_BG }} />
                <td colSpan={7} style={{ ...cellStyle(), backgroundColor: HEAD_BG, fontWeight: 900, fontSize: 10.5 }}>TOTAL CONTRATO ({num(filtered.length)} de {num(items.length)} items visibles)</td>
                <td style={{ ...cellStyle('right'), backgroundColor: HEAD_BG }} />
                <td style={{ ...cellStyle('right'), backgroundColor: HEAD_BG, fontWeight: 900 }}>{num(tot.hh)}</td>
                <td style={{ ...cellStyle('right'), backgroundColor: HEAD_BG }} />
                <td style={{ ...cellStyle('right'), backgroundColor: HEAD_BG, fontWeight: 900 }}>{clp(tot.clp)}</td>
                <td style={{ ...cellStyle('center'), backgroundColor: HEAD_BG, fontWeight: 700, fontSize: 9.5, color: '#B45309' }}>{num(tot.bmpOk)}✓</td>
                <td style={{ ...cellStyle('center'), backgroundColor: HEAD_BG, fontWeight: 700, fontSize: 9.5, color: '#166534' }}>{num(tot.cwpOk)}✓</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
