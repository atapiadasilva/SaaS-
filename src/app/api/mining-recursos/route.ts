import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Estadísticas de recursos por disciplina: HH del programa P333 + curva de dotación estimada.
// Dotación = HH del período / (11 h/turno × días hábiles). Regla del proyecto: 11 h × 6 d/semana.
// GET ?project_id=  → { total, disciplinas[], meses[] }
const HH_DIA = 11;           // horas por persona por día (1 turno)
const DIAS_HABILES_SEMANA = 6;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pid = req.nextUrl.searchParams.get('project_id');
  if (!pid) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  const sb = supabase as any;

  const [progRes, cwpRes] = await Promise.all([
    sb.from('mining_programa').select('cod_actividad, hh, fecha_inicio, fecha_fin, cwp_id')
      .eq('project_id', pid).eq('fuente', 'P333'),
    sb.from('mining_cwp').select('cwp_id, disciplina_cod, disciplina, disciplina_grupo').eq('project_id', pid),
  ]);
  const prog: any[] = progRes.data ?? [];
  const discDe = new Map<string, any>((cwpRes.data ?? []).map((c: any) => [c.cwp_id, c]));

  // Agregado por disciplina
  const disc = new Map<string, any>();
  // Buckets mensuales: mes -> { hh, porDisc: {cod: hh} }
  const meses = new Map<string, { hh: number; porDisc: Record<string, number> }>();

  const diasHabiles = (a: Date, b: Date) => {
    let d = 0; const cur = new Date(a);
    while (cur <= b) { if (cur.getDay() !== 0) d++; cur.setDate(cur.getDate() + 1); } // domingo libre
    return Math.max(1, d);
  };

  for (const p of prog) {
    const c = discDe.get(p.cwp_id);
    const cod = c?.disciplina_cod ?? 'N/A';
    const hh = Number(p.hh) || 0;
    if (!disc.has(cod)) disc.set(cod, {
      disciplina_cod: cod, disciplina: c?.disciplina ?? 'Sin disciplina', grupo: c?.disciplina_grupo ?? '',
      hh: 0, actividades: 0, cwps: new Set<string>(), desde: null as string | null, hasta: null as string | null,
    });
    const g = disc.get(cod);
    g.hh += hh; g.actividades++; if (p.cwp_id) g.cwps.add(p.cwp_id);
    if (p.fecha_inicio && (!g.desde || p.fecha_inicio < g.desde)) g.desde = p.fecha_inicio;
    if (p.fecha_fin && (!g.hasta || p.fecha_fin > g.hasta)) g.hasta = p.fecha_fin;

    // Repartir HH por días hábiles entre inicio y fin, acumular por mes
    if (hh > 0 && p.fecha_inicio && p.fecha_fin) {
      const ini = new Date(p.fecha_inicio + 'T00:00:00'), fin = new Date(p.fecha_fin + 'T00:00:00');
      if (fin >= ini) {
        const totDias = diasHabiles(ini, fin);
        const hhDia = hh / totDias;
        const cur = new Date(ini);
        while (cur <= fin) {
          if (cur.getDay() !== 0) {
            const mes = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
            if (!meses.has(mes)) meses.set(mes, { hh: 0, porDisc: {} });
            const m = meses.get(mes)!;
            m.hh += hhDia; m.porDisc[cod] = (m.porDisc[cod] ?? 0) + hhDia;
          }
          cur.setDate(cur.getDate() + 1);
        }
      }
    }
  }

  // Dotación por disciplina (pico y promedio) a partir de los meses
  const mesesOrd = [...meses.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const dotMesDisc = new Map<string, number[]>(); // cod -> [dotación por mes]
  for (const [mes, m] of mesesOrd) {
    const [y, mo] = mes.split('-').map(Number);
    const diasMes = diasHabiles(new Date(y, mo - 1, 1), new Date(y, mo, 0));
    const cap = HH_DIA * diasMes;
    for (const [cod, hh] of Object.entries(m.porDisc)) {
      if (!dotMesDisc.has(cod)) dotMesDisc.set(cod, []);
      dotMesDisc.get(cod)!.push(hh / cap);
    }
  }

  const disciplinas = [...disc.values()].map(g => {
    const dots = dotMesDisc.get(g.disciplina_cod) ?? [];
    return {
      disciplina_cod: g.disciplina_cod, disciplina: g.disciplina, grupo: g.grupo,
      hh: Math.round(g.hh), actividades: g.actividades, cwps: g.cwps.size,
      desde: g.desde, hasta: g.hasta,
      dotacion_pico: dots.length ? Math.ceil(Math.max(...dots)) : 0,
      dotacion_prom: dots.length ? Math.round(dots.reduce((s, x) => s + x, 0) / dots.length) : 0,
    };
  }).sort((a, b) => b.hh - a.hh);

  const mesesOut = mesesOrd.map(([mes, m]) => {
    const [y, mo] = mes.split('-').map(Number);
    const diasMes = diasHabiles(new Date(y, mo - 1, 1), new Date(y, mo, 0));
    const cap = HH_DIA * diasMes;
    const dotacion: Record<string, number> = {};
    for (const [cod, hh] of Object.entries(m.porDisc)) dotacion[cod] = Math.round((hh / cap) * 10) / 10;
    return { mes, hh: Math.round(m.hh), dotacion_total: Math.ceil(m.hh / cap), dotacion };
  });

  const hhTotal = disciplinas.reduce((s, d) => s + d.hh, 0);
  const dotPicoTotal = mesesOut.length ? Math.max(...mesesOut.map(m => m.dotacion_total)) : 0;

  return NextResponse.json({
    total: {
      hh: hhTotal, actividades: prog.length, disciplinas: disciplinas.length,
      cwps: new Set(prog.map(p => p.cwp_id).filter(Boolean)).size,
      dotacion_pico: dotPicoTotal, meses: mesesOut.length,
      regla: '11 h/turno × 6 días/semana',
    },
    disciplinas, meses: mesesOut,
  });
}
