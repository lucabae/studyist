/**
 * Configuracion del cliente HTTP y traduccion de errores.
 *
 * src/api/client.ts ya apunta el cliente a VITE_API_URL al importarse; initApi()
 * lo vuelve a fijar de forma idempotente para los sitios donde el bootstrap no
 * se ejecuta (tests, imports directos del SDK).
 */
import { client } from "../api/client";

export const API_BASE_URL: string = (
  import.meta.env.VITE_API_URL ?? "http://localhost:8080"
).replace(/\/+$/, "");

let initialized = false;

/** Fija baseUrl una sola vez. Se puede llamar en cada arranque sin coste. */
export function initApi(): void {
  if (initialized) return;
  client.setConfig({ baseUrl: API_BASE_URL });
  initialized = true;
}

const FALLBACK = "No se pudo completar la operación. Inténtalo de nuevo.";

/** Normaliza `detail` de FastAPI: string, lista de validacion u objeto. */
function detailToMessage(detail: unknown): string | null {
  if (typeof detail === "string") {
    const text = detail.trim();
    return text || null;
  }

  // 422: [{ loc, msg, type }]
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          const msg = (item as { msg: unknown }).msg;
          return typeof msg === "string" ? msg : null;
        }
        return null;
      })
      .filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join(". ") : null;
  }

  // 409 de files: { message, file_id }
  if (detail && typeof detail === "object") {
    const { message, file_id: fileId } = detail as {
      message?: unknown;
      file_id?: unknown;
    };
    const base = typeof message === "string" ? message : null;
    if (base && typeof fileId === "number") return `${base} (archivo #${fileId})`;
    if (base) return base;
    if (typeof fileId === "number") {
      return `Ese archivo ya existe (archivo #${fileId}).`;
    }
  }

  return null;
}

/**
 * Mensaje legible para cualquier error del SDK.
 * El cliente lanza el cuerpo JSON ya parseado, no un Error.
 */
export function apiErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error.trim() || FALLBACK;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;

    if ("detail" in record) {
      const message = detailToMessage(record.detail);
      if (message) return message;
    }

    // SDK con throwOnError: false devuelve { error: <cuerpo> }.
    if (record.error) {
      const nested = apiErrorMessage(record.error);
      if (nested !== FALLBACK) return nested;
    }

    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return FALLBACK;
}
