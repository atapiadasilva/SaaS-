import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  GRUPOS_ANEXO7, columnasAMedir, estadoAtributo, exigidoEn, normalizarEtapa,
} from '@/lib/atributos-bim';

// Conformidad del modelo BIM contra el Anexo 7 (Guía BIM–AWP, Codelco VP + CChC, julio 2026).
//
// Contesta la pregunta con la que un mandante evalúa el modelo: «de los atributos que la guía exige
// en esta etapa, ¿cuántos elementos los traen?». Todo sale de `mining_elementos`, que ya está
// cargada: no hay dato nuevo que pedir para tener el informe.
//
// POR QUÉ CUENTA CON `head: true` Y NO TRAE FILAS: son decenas de miles de elementos por proyecto
// (57.519 en el Puerto). Traerlos para contar en el cliente es exactamente el error que ya costó
// caro una vez en la Sala de Apertura. Acá cada atributo es un `count(*) exact` que resuelve la
// base, y las columnas van deduplicadas por `columnasAMedir` — unas veinte queries en paralelo, no
// una por atributo.
//
// OJO CON LOS PLACEHOLDERS: `SIN-CWA`, `SIN-CWP.POR_ASIGNAR` y `{padre}.SIN-CV` son códigos de UI
// para "por asignar", no dato. Si contaran como atributo presente, el informe diría que el 100% de
// los elementos tiene CWP cuando hay 33.733 filas apuntando a paquetes que no existen. Por eso los
// atributos de paquetización se cuentan con `excluirSin`.

interface Conteo { n: number; error?: string }

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const pid = params.get('project_id');
  if (!pid) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const etapa = normalizarEtapa(params.get('etapa'));
  const disciplina = params.get('disciplina')?.trim() || null;

  const sb = supabase as any;

  // El selector de disciplina y los conteos TIENEN que mirar la misma columna. Se resuelve cuál es
  // antes de contar nada: en el Puerto las disciplinas del explorador salen de `disciplina_modelo`
  // y no de `disciplina`, así que filtrar por la columna equivocada devolvía universo 0 y toda la
  // pantalla en guiones, sin error visible.
  const [totalRes, filtrosRes] = await Promise.all([
    sb.from('mining_elementos').select('*', { count: 'exact', head: true }).eq('project_id', pid),
    // Una sola llamada devuelve todos los valores distintos de las columnas de filtro con su conteo;
    // de ahí sale el selector de disciplina sin una query aparte.
    sb.rpc('mining_elementos_filtros', { p_project_id: pid }),
  ]);

  const totalProyecto = totalRes.count ?? 0;

  // La RPC cubre las columnas del explorador; cuál de ellas describe mejor la disciplina cambia
  // entre proyectos (los onboardeados no siempre traen `disciplina` poblada), así que se toma la
  // primera que venga con valores.
  const filtros: { columna: string; valor: string; n: number }[] = filtrosRes.error ? [] : (filtrosRes.data ?? []);
  const columnaDisciplina = ['disciplina', 'disciplina_modelo', 'especialidad_cod']
    .find(c => filtros.some(f => f.columna === c && f.valor)) ?? 'disciplina';
  const disciplinas = filtros
    .filter(f => f.columna === columnaDisciplina && f.valor)
    .map(f => ({ valor: f.valor, n: f.n }))
    .sort((a, b) => b.n - a.n);

  const base = () => {
    let q = sb.from('mining_elementos').select('*', { count: 'exact', head: true }).eq('project_id', pid);
    if (disciplina) q = q.eq(columnaDisciplina, disciplina);
    return q;
  };

  const objetivo = columnasAMedir(etapa);
  const conteos = new Map<string, Conteo>();
  let universo = 0;
  let via: 'rpc' | 'conteos' = 'rpc';

  // Camino rápido: la función agrega las ~20 columnas en un solo recorrido de la tabla.
  const rpc = await sb.rpc('mining_atributos_cobertura', {
    p_project_id: pid,
    p_columna_disciplina: columnaDisciplina,
    p_disciplina: disciplina,
  });

  if (!rpc.error && rpc.data && typeof rpc.data === 'object') {
    const d = rpc.data as Record<string, number>;
    universo = Number(d.universo ?? 0);
    for (const { columna } of objetivo) {
      const v = d[columna];
      conteos.set(columna, v == null ? { n: 0, error: 'columna fuera de la función' } : { n: Number(v) });
    }
  } else {
    // Mientras `scripts/sql/08-anexo7-atributos.sql` no esté aplicado, la función no existe y hay
    // que contar columna por columna. Da exactamente el mismo número, pero medido en el Puerto son
    // ~7 segundos por carga contra los milisegundos de la función. Van todas en paralelo: el pooler
    // de Supabase las serializa igual, así que el trabajo total es el mismo y lanzarlas de a lotes
    // sólo alarga la espera (se probó de a seis: 18,6 s contra 7,4 s).
    via = 'conteos';

    const univRes = await base();
    if (univRes.error) return NextResponse.json({ error: univRes.error.message }, { status: 500 });
    universo = univRes.count ?? 0;

    await Promise.all(objetivo.map(async ({ columna, excluirSin }) => {
      let q = base().not(columna, 'is', null).neq(columna, '');
      // `not.ilike` deja fuera tanto el balde global (`SIN-CWP.POR_ASIGNAR`) como los placeholders
      // anidados (`312101.SIN-CV`), que es justo lo que hay que descontar.
      if (excluirSin) q = q.not(columna, 'ilike', '%SIN-%');
      const { count, error } = await q;
      conteos.set(columna, error ? { n: 0, error: error.message } : { n: count ?? 0 });
    }));
  }

  // ── Armado por grupo ──
  const grupos = GRUPOS_ANEXO7.map(g => {
    const atributos = g.atributos.map(a => {
      const exigido = exigidoEn(a, etapa);
      const estado = estadoAtributo(a);
      const c = a.columna ? conteos.get(a.columna) : undefined;
      const n = exigido && c ? c.n : null;
      return {
        clave: a.clave,
        descripcion: a.descripcion,
        tipo: a.tipo,
        etapas: a.etapas,
        exigido,
        estado,
        columna: a.columna ?? null,
        propuesta: a.propuesta ?? null,
        nota: a.nota ?? null,
        n_con_dato: n,
        pct: n != null && universo > 0 ? Math.round((n / universo) * 1000) / 10 : null,
        error: c?.error ?? null,
      };
    });

    const exigidos = atributos.filter(a => a.exigido);
    const medibles = exigidos.filter(a => a.pct != null);
    return {
      clave: g.clave,
      label: g.label,
      disciplinar: g.disciplinar,
      n_exigidos: exigidos.length,
      n_capturados: exigidos.filter(a => a.estado === 'capturado').length,
      n_propuestos: exigidos.filter(a => a.estado === 'propuesto').length,
      n_no_capturados: exigidos.filter(a => a.estado === 'no_capturado').length,
      // Cobertura del grupo: promedio simple sobre los atributos que la plataforma puede medir.
      // Los que no tienen columna no entran al promedio — entran al conteo de brecha, que es donde
      // corresponde: no es que el modelo esté mal, es que el dato no tiene dónde vivir todavía.
      pct_medible: medibles.length
        ? Math.round((medibles.reduce((s, a) => s + (a.pct ?? 0), 0) / medibles.length) * 10) / 10
        : null,
      atributos,
    };
  });

  const todos = grupos.flatMap(g => g.atributos.filter(a => a.exigido));
  const medibles = todos.filter(a => a.pct != null);

  return NextResponse.json({
    etapa,
    disciplina,
    columna_disciplina: columnaDisciplina,
    // `conteos` avisa que la función SQL todavía no está aplicada: mismo número, mucho más lento.
    via,
    disciplinas,
    universo,
    total_proyecto: totalProyecto,
    resumen: {
      n_exigidos: todos.length,
      n_capturados: todos.filter(a => a.estado === 'capturado').length,
      n_propuestos: todos.filter(a => a.estado === 'propuesto').length,
      n_no_capturados: todos.filter(a => a.estado === 'no_capturado').length,
      // Dos cifras distintas y las dos importan: `pct_medible` es qué tan lleno está lo que sí
      // guardamos; `pct_cobertura_catalogo` es qué proporción del catálogo la plataforma siquiera
      // puede contestar. La primera la mejora el modelador, la segunda la mejora la plataforma.
      pct_medible: medibles.length
        ? Math.round((medibles.reduce((s, a) => s + (a.pct ?? 0), 0) / medibles.length) * 10) / 10
        : null,
      pct_cobertura_catalogo: todos.length
        ? Math.round((todos.filter(a => a.estado === 'capturado').length / todos.length) * 1000) / 10
        : 0,
    },
    grupos,
  });
}
