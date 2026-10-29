/**
 * Configuracion del cliente HTTP y traduccion de errores.
 *
 * src/api/client.ts ya apunta el cliente a VITE_API_URL al importarse; initApi()
 * lo vuelve a fijar de forma idempotente para los sitios donde el bootstrap no
 * se ejecuta (tests, imports directos del SDK).
 */
import { client } from "../api/client";
import { refreshTokens } from "../auth/authClient";
import {
  clearTokens,
  emitAuthChange,
  getAccessToken,
  getRefreshToken,
  setTokens,
  type TokenPair,
} from "../auth/tokenStore";

// Hay un ciclo de imports con auth/authClient (este fichero importa el
// refresco y authClient importa API_BASE_URL). Es seguro porque authClient no
// usa la constante hasta que se llaman sus funciones, y para entonces este
// modulo ya se ha evaluado.

export const API_BASE_URL: string = (
  import.meta.env.VITE_API_URL ?? "http://localhost:8080"
).replace(/\/+$/, "");

let initialized = false;

/** Rutas que no llevan Authorization: son las que emiten los tokens. */
const PUBLIC_AUTH_PATHS = new Set(["/auth/login", "/auth/refresh"]);

function pathnameOf(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "";
  }
}

let refreshInFlight: Promise<TokenPair | null> | null = null;

/**
 * Refresca los tokens una sola vez.
 *
 * Si varias peticiones reciben 401 a la vez, todas esperan la misma promesa y
 * el refresh (que se rota en cada uso) no se pide dos veces. Devuelve null si
 * no hay refresh guardado o si el backend lo rechaza.
 */
function refreshOnce(): Promise<TokenPair | null> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve(null);

  refreshInFlight = refreshTokens(refreshToken)
    .then((pair) => {
      setTokens(pair);
      return pair;
    })
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

/**
 * Repite la petición con el access nuevo.
 *
 * `request.clone()` falla si el cuerpo ya se envió (POST con body) porque el
 * stream está consumido: en ese caso no se puede reintentar y se deja que el
 * error llegue a quien llamó. Las lecturas (GET, la mayoría) sí se reintentan.
 */
async function retryWithToken(request: Request, token: string): Promise<Response | null> {
  let copy: Request;
  try {
    copy = request.clone();
  } catch {
    return null;
  }

  const headers = new Headers(copy.headers);
  headers.set("Authorization", `Bearer ${token}`);

  try {
    return await fetch(new Request(copy, { headers }));
  } catch {
    return null;
  }
}

/** Fuerza el logout local cuando el refresh ya no vale. */
function forceAnonymous(): void {
  clearTokens();
  emitAuthChange();
  if (window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

/**
 * Añade el access token a una URL de `/files` como `?token=`.
 *
 * Un `<img src>` o un `<a download>` no pueden mandar la cabecera
 * Authorization: el backend acepta el token en la query para los GET/HEAD del
 * mount estático. Sin sesión devuelve la URL tal cual (el backend dará 401).
 */
export function withAccessToken(url: string): string {
  const token = getAccessToken();
  if (!token) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

/** Fija baseUrl una sola vez y engancha los interceptores de sesión. */
export function initApi(): void {
  if (initialized) return;
  client.setConfig({ baseUrl: API_BASE_URL });

  // Petición: añade el access salvo a login y refresh.
  client.interceptors.request.use((request) => {
    if (PUBLIC_AUTH_PATHS.has(pathnameOf(request))) return request;

    const token = getAccessToken();
    if (!token) return request;

    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return new Request(request, { headers });
  });

  // Respuesta: ante un 401 reintenta una vez con un access recién refrescado.
  client.interceptors.response.use(async (response, request) => {
    if (response.status !== 401) return response;

    const path = pathnameOf(request);
    // Un 401 de /auth/login o /auth/refresh lo gestiona su formulario.
    if (path.startsWith("/auth/")) return response;

    const pair = await refreshOnce();
    if (!pair) {
      forceAnonymous();
      return response;
    }

    return (await retryWithToken(request, pair.access_token)) ?? response;
  });

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
