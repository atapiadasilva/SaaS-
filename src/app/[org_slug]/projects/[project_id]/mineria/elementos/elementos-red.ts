/**
 * Utilidades de red del editor de elementos: reintentos, errores legibles y troceado de lotes.
 * Cada una existe por una falla concreta que se vio en obra — está explicada en su comentario.
 */

// Reintenta solo fallas de RED transitorias (fetch() lanzando, ej. "TypeError: fetch failed" por un
// hiccup de conexión o un hot-reload del dev server) — las respuestas HTTP de error (4xx/5xx) NO
// reintentan aquí, esas ya se manejan en el código que llama según res.ok.
export async function fetchWithRetry(url: string, init: RequestInit = {}, retries = 2, delayMs = 350): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      if (attempt >= retries) throw e;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

// Lee el body UNA vez y lo intenta parsear como JSON. Si la respuesta no fue ok, lanza con el mensaje
// más informativo posible — el `error` de nuestra API si vino, o status+body crudo si la respuesta
// no es de nuestro código (ej. un 400 genérico de infraestructura/dev-server) — así un toast nunca
// muestra solo "Bad Request" sin ninguna pista de qué lo causó.
export async function parseJsonOrThrow(res: Response): Promise<any> {
  const text = await res.text();
  let d: any = {};
  try { d = JSON.parse(text); } catch { /* respuesta no-JSON */ }
  if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`);
  return d;
}

// Supabase/PostgREST codifica los filtros `.in('col', [...])` en el QUERY STRING de la URL (no en el
// body) — con monikers que llevan caracteres especiales (=, !, #) cada uno se expande a %XX al
// codificarlo. Una lista de varios cientos de monikers fácilmente supera el límite de largo de URL
// del proxy/gateway y la request falla en silencio con 400/500 sin ningún detalle útil — la causa real
// de los "Bad Request" intermitentes al pintar/reasignar. Por eso agrupamos por PRESUPUESTO DE
// CARACTERES YA CODIFICADOS, no por una cantidad fija de elementos (que no protege si los monikers son largos).
export function chunkMonikersForUrl(monikers: string[], maxEncodedChars = 6000): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let len = 0;
  for (const m of monikers) {
    const encLen = encodeURIComponent(m).length + 1;
    if (current.length && len + encLen > maxEncodedChars) {
      chunks.push(current);
      current = [];
      len = 0;
    }
    current.push(m);
    len += encLen;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

// Corre `fn` sobre `items` con un máximo de `limit` en vuelo a la vez — los PATCH por chunk son
// independientes entre sí (cada uno toca un subconjunto de monikers distinto), así que lanzarlos en
// paralelo (en vez de uno por uno, esperando cada respuesta antes de mandar la siguiente) reduce mucho
// el tiempo total en ramas grandes, sin abrir una conexión por cada chunk a la vez (saturaría Supabase).
export async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
