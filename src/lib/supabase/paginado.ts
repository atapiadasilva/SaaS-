// PostgREST devuelve como máximo 1000 filas por respuesta y NO avisa cuando trunca:
// una query sin paginar sobre una tabla grande devuelve 1000 filas y parece exitosa.
// Cualquier API que agregue (KPI, conciliación, estado de pago) tiene que paginar o
// terminará mostrando totales silenciosamente incompletos.
const PAGE = 1000;

/**
 * Ejecuta una query paginada hasta agotar la tabla y devuelve todas las filas juntas.
 * `build` recibe el rango y debe aplicar `.range(from, to)` a la query.
 */
export async function fetchAllPaged<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<{ data: T[]; error: any }> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return { data: out, error };
    const filas = data ?? [];
    out.push(...filas);
    if (filas.length < PAGE) return { data: out, error: null };
  }
}
