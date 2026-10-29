/**
 * Guardado de los tokens de sesión y utilidades para leerlos o caducarlos.
 *
 * Los tokens viven en localStorage para que la sesión sobreviva a un recargado
 * de la pestaña. La app es de un solo usuario, así que no hay nada más que
 * guardar: ni usuario ni permisos.
 *
 * Los accesos a localStorage van envueltos en try/catch porque Safari en modo
 * privado (y algunos navegadores con almacenamiento desactivado) lanzan al
 * leer o escribir. Si falla, la sesión simplemente dura lo que dure la pestaña.
 */

/** Respuesta de `/auth/login` y `/auth/refresh`. */
export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_expires_in?: number;
}

/** Claims que se leen del JWT. El resto no se usa en el cliente. */
export interface JwtPayload {
  exp?: number;
  [claim: string]: unknown;
}

const ACCESS_KEY = "studyist.access";
const REFRESH_KEY = "studyist.refresh";

type Listener = () => void;

const listeners = new Set<Listener>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento: la sesión queda solo en memoria del componente.
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ídem: no hay nada que borrar.
  }
}

export function getAccessToken(): string | null {
  return read(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return read(REFRESH_KEY);
}

export function setTokens(pair: TokenPair): void {
  write(ACCESS_KEY, pair.access_token);
  write(REFRESH_KEY, pair.refresh_token);
}

export function clearTokens(): void {
  remove(ACCESS_KEY);
  remove(REFRESH_KEY);
}

/**
 * Decodifica el payload de un JWT sin dependencias.
 *
 * Base64url: se cambian `-` y `_` por `+` y `/`, se rellena con `=` hasta
 * múltiplo de 4 y se decodifica como UTF-8. Devuelve null si el token no tiene
 * la forma esperada o el payload no es un objeto JSON.
 */
export function decodeJwtPayload(token: string): JwtPayload | null {
  const part = token.split(".")[1];
  if (!part) return null;

  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));

    if (!payload || typeof payload !== "object") return null;
    return payload as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * ¿Está caducado el token?
 *
 * `skewSeconds` adelanta la caducidad para no usar un token que va a expirar
 * durante la petición. Un token ilegible cuenta como caducado.
 */
export function isExpired(token: string, skewSeconds = 60): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return true;
  return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
}

/**
 * Suscribe un listener a los cambios de sesión (logout forzado, por ejemplo).
 * Devuelve la función para darse de baja.
 */
export function onAuthChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Avisa a los suscriptores de que la sesión ha cambiado sin pasar por login. */
export function emitAuthChange(): void {
  for (const listener of listeners) listener();
}
