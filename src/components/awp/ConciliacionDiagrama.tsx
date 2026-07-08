'use client';

import { useMemo } from 'react';

// Diagrama relacional del ecosistema de datos AWP — réplica del estilo "canvas oscuro"
// con tablas como nodos y conexiones etiquetadas con cobertura en vivo.

interface Props {
  stats: any | null;
  relaciones: any[] | null;
}

const GRUPO_COLOR: Record<string, string> = {
  nucleo: '#3B82F6',      // Núcleo AWP (azul)
  programa: '#A855F7',    // Programa (morado)
  cobro: '#F59E0B',       // Contractual / Cobro (naranjo)
  documental: '#2DD4BF',  // Documental (teal)
};

interface Nodo {
  id: string; titulo: string; filas: number; grupo: keyof typeof GRUPO_COLOR;
  campos: string[]; x: number; y: number; w?: number;
}

export default function ConciliacionDiagrama({ stats, relaciones }: Props) {
  const s = stats ?? {};

  const nodos: Nodo[] = useMemo(() => [
    { id: 'cwa',    titulo: 'T_CWA',        filas: s.cwa ?? 0,        grupo: 'nucleo',    campos: ['CWA_ID (PK)', 'Nombre CWA', 'Área'],                        x: 40,  y: 60 },
    { id: 'cv',     titulo: 'T_CV',         filas: s.cv ?? 0,         grupo: 'nucleo',    campos: ['CV_ID (PK)', 'CWA_ID (FK)', 'Nombre CV'],                   x: 40,  y: 230 },
    { id: 'cwp',    titulo: 'T_CWP',        filas: s.cwp ?? 0,        grupo: 'nucleo',    campos: ['CWP_ID (PK)', 'CWA_ID (FK)', 'CV_ID (FK)', 'DISCIPLINA'],   x: 330, y: 210 },
    { id: 'prog',   titulo: 'T_PROGRAMA',   filas: s.programa ?? 0,   grupo: 'programa',  campos: ['TASK_ID P6 (PK)', 'CWP_ID (FK)', 'Fechas · HH'],            x: 650, y: 40 },
    { id: 'item',   titulo: 'T_ITEMIZADO',  filas: s.itemizado ?? 0,  grupo: 'cobro',     campos: ['ITEM (PK)', 'PARTIDA_BMP (FK)', 'CWP_ID (FK)', 'PU · P Total · HH'], x: 650, y: 300 },
    { id: 'bmp',    titulo: 'T_BMP',        filas: s.bmpPartidas ?? 0, grupo: 'cobro',    campos: ['PARTIDA (PK)', 'Pasos físicos', 'Hitos de pago'],           x: 950, y: 370 },
    { id: 'aconex', titulo: 'T_DOC_ACONEX', filas: s.aconex ?? 0,     grupo: 'documental', campos: ['N° CMDIC (PK)', 'CWP_ID_EXACTO (FK)', 'Tipo doc · Rev'],   x: 650, y: 520 },
    { id: 'planos', titulo: 'T_PLANOS',     filas: s.planos ?? 0,     grupo: 'documental', campos: ['DOC (PK)', 'CWP_ID (FK)', 'Disciplina'],                   x: 330, y: 520 },
    { id: 'hitos',  titulo: 'T_HITOS',      filas: s.hitos ?? 0,      grupo: 'cobro',     campos: ['N° hito', 'Plazo días', 'Multa 0,3%/día'],                  x: 950, y: 60 },
  ], [s]);

  const pct = (ok: number, total: number) => total ? Math.round(ok / total * 1000) / 10 : 100;

  const edges = useMemo(() => {
    const rel = (id: string) => (relaciones ?? []).find((r: any) => r.id === id);
    return [
      { de: 'cwa',  a: 'cv',     label: '100% → 100% · 1:N',  cob: 100 },
      { de: 'cv',   a: 'cwp',    label: '100% → 100% · 1:N',  cob: 100 },
      { de: 'cwp',  a: 'prog',   label: `${rel('prog_cwp')?.cobertura ?? pct(s.programaOk ?? 0, s.programa ?? 0)}% · N:1`, cob: rel('prog_cwp')?.cobertura ?? 100 },
      { de: 'cwp',  a: 'item',   label: `${rel('eco2_cwp')?.cobertura ?? pct(s.itemizadoCwpOk ?? 0, s.itemizado ?? 0)}% · N:1`, cob: rel('eco2_cwp')?.cobertura ?? 0 },
      { de: 'item', a: 'bmp',    label: `${rel('item_bmp')?.cobertura ?? pct(s.itemizadoBmpOk ?? 0, s.itemizado ?? 0)}% · N:1`, cob: rel('item_bmp')?.cobertura ?? 0 },
      { de: 'cwp',  a: 'aconex', label: `${rel('aconex_cwp')?.cobertura ?? pct(s.aconexOk ?? 0, s.aconex ?? 0)}% · N:1`, cob: rel('aconex_cwp')?.cobertura ?? 0 },
      { de: 'cwp',  a: 'planos', label: `${pct(s.planosOk ?? 0, s.planos ?? 0)}% · N:1`, cob: pct(s.planosOk ?? 0, s.planos ?? 0) },
      { de: 'item', a: 'hitos',  label: 'contractual', cob: 100 },
    ];
  }, [relaciones, s]);

  const NW = 240; // ancho nodo
  const nodeH = (n: Nodo) => 34 + n.campos.length * 20;
  const center = (n: Nodo) => ({ cx: n.x + NW / 2, cy: n.y + nodeH(n) / 2 });

  const edgeColor = (cob: number) => cob >= 98 ? '#22C55E' : cob >= 80 ? '#FBBF24' : '#EF4444';

  return (
    <div style={{ borderRadius: '16px', overflow: 'auto', border: '2px solid #EEEEEE', backgroundColor: '#0B1220' }}>
      {/* Leyenda */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px', padding: '10px 18px', borderBottom: '1px solid #1E293B', fontSize: '10px', color: '#94A3B8', flexWrap: 'wrap' }}>
        {Object.entries({ nucleo: 'Núcleo AWP', programa: 'Programa / P333', cobro: 'Contractual / Cobro', documental: 'Documental' }).map(([k, label]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: GRUPO_COLOR[k] }} /> {label}
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>Conexión: <b style={{ color: '#22C55E' }}>OK</b> · <b style={{ color: '#FBBF24' }}>revisar</b> · <b style={{ color: '#EF4444' }}>crítico</b> — etiqueta: <b>cobertura% · cardinalidad</b></span>
      </div>

      <div style={{ position: 'relative', width: '1240px', height: '680px', margin: '0 auto' }}>
        {/* Conexiones SVG */}
        <svg width="1240" height="680" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#1E293B" />
            </pattern>
          </defs>
          <rect width="1240" height="680" fill="url(#dots)" />
          {edges.map((e, i) => {
            const de = nodos.find(n => n.id === e.de)!;
            const a = nodos.find(n => n.id === e.a)!;
            const p1 = center(de); const p2 = center(a);
            const midX = (p1.cx + p2.cx) / 2; const midY = (p1.cy + p2.cy) / 2;
            const color = edgeColor(e.cob);
            return (
              <g key={i}>
                <path d={`M ${p1.cx} ${p1.cy} C ${midX} ${p1.cy}, ${midX} ${p2.cy}, ${p2.cx} ${p2.cy}`}
                  fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.75} />
                <rect x={midX - 62} y={midY - 11} width={124} height={20} rx={5} fill="#0B1220" stroke={color} strokeWidth={1} />
                <text x={midX} y={midY + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={color} fontFamily="monospace">{e.label}</text>
              </g>
            );
          })}
        </svg>

        {/* Nodos */}
        {nodos.map(n => (
          <div key={n.id} style={{ position: 'absolute', left: n.x, top: n.y, width: NW, borderRadius: '10px', backgroundColor: '#111C30', border: '1px solid #1E293B', boxShadow: '0 6px 18px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
            <div style={{ padding: '7px 12px', backgroundColor: GRUPO_COLOR[n.grupo], display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 900, color: '#0B1220', fontFamily: 'monospace' }}>{n.titulo}</span>
              <span style={{ fontSize: '9.5px', fontWeight: 700, color: 'rgba(11,18,32,0.75)' }}>{n.filas.toLocaleString('es-CL')} filas</span>
            </div>
            <div style={{ padding: '6px 0' }}>
              {n.campos.map((c, i) => (
                <div key={i} style={{ padding: '3px 12px', fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '999px', backgroundColor: GRUPO_COLOR[n.grupo], opacity: 0.7, flexShrink: 0 }} />
                  {c}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
