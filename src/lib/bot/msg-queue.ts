// Consolidador de mensajes: cuando un usuario envía varios mensajes seguidos en
// ráfaga (algo muy común en WhatsApp), los acumula durante una ventana corta y
// los entrega al agente como uno solo — inspirado en el queue manager de
// BuilderBot (https://builderbot.cloud).
//
// Funciona así:
// 1. Llega mensaje → se guarda en un buffer por teléfono.
// 2. Se inicia (o reinicia) un timer de DEBOUNCE_MS ms.
// 3. Si llega otro mensaje del mismo teléfono antes de que expire, se concatena
//    al buffer y el timer se reinicia.
// 4. Cuando el timer expira sin nuevos mensajes, se ejecuta el callback con
//    todos los fragmentos consolidados.
//
// Esto evita que el bot responda 3 veces si el usuario escribe rápido.

interface PendingMessage {
  texto: string;
  tipoMensaje: 'texto' | 'audio';
}

interface PendingEntry {
  fragments: PendingMessage[];
  timer: ReturnType<typeof setTimeout>;
}

export type ConsolidatedCallback = (consolidated: {
  textoConsolidado: string;
  tipoMensaje: 'texto' | 'audio';
}) => Promise<void>;

const DEBOUNCE_MS = parseInt(process.env.MSG_DEBOUNCE_MS || '2500', 10);

// Map: phone → pending entry (buffer + timer)
const pending = new Map<string, PendingEntry>();

/**
 * Encola un fragmento de mensaje para el teléfono dado. Si no llegan más
 * fragmentos en DEBOUNCE_MS, consolida todo y llama al callback.
 */
export function enqueueMessage(
  phone: string,
  message: PendingMessage,
  onReady: ConsolidatedCallback
): void {
  const entry = pending.get(phone);

  if (entry) {
    // Ya hay mensajes pendientes → agregar al buffer y reiniciar timer
    clearTimeout(entry.timer);
    entry.fragments.push(message);
    entry.timer = setTimeout(() => flush(phone, onReady), DEBOUNCE_MS);
  } else {
    // Primer mensaje → crear entrada nueva
    const timer = setTimeout(() => flush(phone, onReady), DEBOUNCE_MS);
    pending.set(phone, { fragments: [message], timer });
  }
}

async function flush(phone: string, onReady: ConsolidatedCallback): Promise<void> {
  const entry = pending.get(phone);
  if (!entry) return;
  pending.delete(phone);

  const fragments = entry.fragments;

  // Determinar tipo: si al menos un fragmento es audio, el consolidado es 'audio'
  const tipoMensaje = fragments.some(f => f.tipoMensaje === 'audio') ? 'audio' : 'texto';

  // Consolidar textos — cada fragmento separado por salto de línea
  const textoConsolidado = fragments
    .map(f => f.texto)
    .filter(t => t.length > 0)
    .join('\n');

  if (!textoConsolidado) return;

  try {
    await onReady({ textoConsolidado, tipoMensaje });
  } catch (err) {
    console.error('[msg-queue] Error procesando mensaje consolidado:', err);
  }
}

/**
 * Cantidad de usuarios con mensajes pendientes (útil para monitoring).
 */
export function pendingCount(): number {
  return pending.size;
}
