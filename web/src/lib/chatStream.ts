/**
 * Cliente del endpoint de chat en streaming (`POST /chat/messages/stream`).
 *
 * El backend responde `text/event-stream` con eventos `meta`, `delta`, `done`
 * y `error`. Aqui se parsean y se entregan por callbacks, sin depender del SDK
 * generado (que no cubre respuestas SSE).
 */
import type { ChatMessageRead } from "../api/generated";
import { API_BASE_URL } from "./api";

export interface ChatStreamHandlers {
  /** Nombre del modelo que va a responder. */
  onModel?: (model: string) => void;
  /** Trozo de texto nuevo de la respuesta. */
  onDelta: (text: string) => void;
}

export interface ChatStreamResult {
  user: ChatMessageRead;
  assistant: ChatMessageRead;
}

interface StreamEvent {
  event: string;
  data: string;
}

/** Parte el buffer de SSE en eventos completos (separados por linea en blanco). */
function takeEvents(buffer: string): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = [];
  let rest = buffer;

  while (true) {
    const separator = rest.indexOf("\n\n");
    if (separator === -1) break;

    const block = rest.slice(0, separator);
    rest = rest.slice(separator + 2);

    let name = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length > 0) events.push({ event: name, data: dataLines.join("\n") });
  }

  return { events, rest };
}

/** Lee el `detail` de un error de FastAPI sin depender del SDK. */
async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string" && body.detail.trim()) return body.detail;
  } catch {
    // Sin cuerpo JSON: se usa el mensaje generico de abajo.
  }
  return `No se pudo enviar el mensaje (${response.status}).`;
}

/**
 * Envia un mensaje y va emitiendo la respuesta del modelo segun llega.
 *
 * Pasos: POST con el cuerpo {content, file_id}; si el status no es 2xx, leer
 * el detalle y lanzar; leer el cuerpo con un reader; por cada bloque SSE
 * completo, emitir "delta" por el callback y resolver al recibir "done" (con
 * los dos mensajes guardados) o lanzar al recibir "error".
 */
export async function streamChatMessage(
  input: {
    content: string;
    fileId?: number | null;
    fileMode?: "text" | "file";
    signal?: AbortSignal;
  },
  handlers: ChatStreamHandlers,
): Promise<ChatStreamResult> {
  const response = await fetch(`${API_BASE_URL}/chat/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      content: input.content,
      file_id: input.fileId ?? null,
      file_mode: input.fileMode ?? "text",
    }),
    signal: input.signal,
  });

  if (!response.ok) throw new Error(await readError(response));
  if (!response.body) throw new Error("El navegador no soporta respuestas en streaming.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = takeEvents(buffer);
      buffer = rest;

      for (const item of events) {
        if (item.event === "delta") {
          const payload = JSON.parse(item.data) as { text?: string };
          if (payload.text) handlers.onDelta(payload.text);
        } else if (item.event === "meta") {
          const payload = JSON.parse(item.data) as { model?: string };
          if (payload.model) handlers.onModel?.(payload.model);
        } else if (item.event === "done") {
          return JSON.parse(item.data) as ChatStreamResult;
        } else if (item.event === "error") {
          const payload = JSON.parse(item.data) as { detail?: string };
          throw new Error(payload.detail ?? "No se pudo completar la respuesta.");
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  throw new Error("La respuesta se cortó antes de terminar. Inténtalo de nuevo.");
}
