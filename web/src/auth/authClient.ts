/**
 * Llamadas HTTP de autenticación con `fetch` directo.
 *
 * Se usa fetch a pelo (no el SDK generado) porque el cliente generado se
 * ocupa de las rutas de datos y aquí solo hay cuatro endpoints fijos que no
 * necesitan autenticación previa ni tipos generados.
 */
import { apiErrorMessage, API_BASE_URL } from "../lib/api";
import { getAccessToken, type TokenPair } from "./tokenStore";

export type { TokenPair };

/** Respuesta de `/auth/me`: quién está dentro y hasta cuándo. */
export interface AuthMe {
  subject: string;
  expires_at: number | string;
}

/**
 * Error de una llamada de autenticación.
 *
 * Lleva el status HTTP para que el formulario pueda reaccionar al código, pero
 * el backend no distingue un dispositivo bloqueado de una contraseña mala: los
 * dos llegan como 401 con el mismo mensaje.
 */
export class AuthRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthRequestError";
    this.status = status;
  }
}

/** Hace la petición, lee el JSON y convierte los errores en AuthRequestError. */
async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new AuthRequestError("No se pudo conectar con el servidor.", 0);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new AuthRequestError(apiErrorMessage(body), response.status);
  }

  return body as T;
}

export function login(password: string): Promise<TokenPair> {
  return requestJson<TokenPair>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function refreshTokens(refreshToken: string): Promise<TokenPair> {
  return requestJson<TokenPair>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

/**
 * Cierra la sesión en el servidor. Es best-effort: si falla la red o el token
 * ya no vale, el cliente limpia igualmente sus tokens.
 */
export async function logoutRemote(): Promise<void> {
  const token = getAccessToken();
  if (!token) return;

  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    // Sin conexión: el logout local ya se ha hecho.
  }
}

export async function fetchMe(): Promise<AuthMe> {
  const token = getAccessToken();
  return requestJson<AuthMe>("/auth/me", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}
