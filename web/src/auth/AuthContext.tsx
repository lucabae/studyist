/**
 * Estado de sesión de la aplicación.
 *
 * Hay tres estados: se está comprobando la sesión (`loading`), hay tokens
 * válidos (`authenticated`) o no hay nada (`anonymous`). El access dura dos
 * días, así que se renueva solo cinco minutos antes de caducar para que el uso
 * normal no se tope nunca con un 401.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { login as loginRequest, logoutRemote, refreshTokens } from "./authClient";
import {
  clearTokens,
  decodeJwtPayload,
  getRefreshToken,
  isExpired,
  onAuthChange,
  setTokens,
  type TokenPair,
} from "./tokenStore";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthContextValue {
  status: AuthStatus;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

/** Margen con el que se renueva el access antes de que caduque. */
const RENEW_BEFORE_MS = 5 * 60 * 1000;

/** Renovación mínima: si el token caduca antes, no se reintenta en bucle. */
const MIN_RENEW_DELAY_MS = 10 * 1000;

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Arranque de sesión compartido entre montajes.
 *
 * En desarrollo React monta dos veces el provider (StrictMode). Sin esta
 * promesa única se pedirían dos refrescos a la vez y el segundo llegaría con un
 * refresh ya rotado, cerrando la sesión. El refresh se llama una sola vez.
 */
let sessionPromise: Promise<TokenPair | null> | null = null;

function startSession(): Promise<TokenPair | null> {
  if (sessionPromise) return sessionPromise;

  const refreshToken = getRefreshToken();
  if (!refreshToken || isExpired(refreshToken, 0)) {
    clearTokens();
    sessionPromise = Promise.resolve(null);
    return sessionPromise;
  }

  sessionPromise = refreshTokens(refreshToken)
    .then((pair) => {
      setTokens(pair);
      return pair;
    })
    .catch(() => {
      clearTokens();
      return null;
    });

  return sessionPromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const timerRef = useRef<number | null>(null);

  function stopTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  /** Cierra la sesión sin llamar al backend (token caducado o revocado). */
  function markAnonymous() {
    stopTimer();
    clearTokens();
    setStatus("anonymous");
  }

  /** Renueva con el refresh guardado y reprograma el siguiente aviso. */
  async function renew() {
    const refreshToken = getRefreshToken();
    if (!refreshToken || isExpired(refreshToken, 0)) {
      markAnonymous();
      return;
    }

    try {
      const pair = await refreshTokens(refreshToken);
      setTokens(pair);
      setStatus("authenticated");
      schedule(pair.access_token);
    } catch {
      markAnonymous();
    }
  }

  /** Programa la renovación a exp - 5 min, con un mínimo de 10 s. */
  function schedule(accessToken: string) {
    stopTimer();

    const payload = decodeJwtPayload(accessToken);
    if (!payload || typeof payload.exp !== "number") return;

    const untilExpiry = payload.exp * 1000 - Date.now();
    const delay = Math.max(untilExpiry - RENEW_BEFORE_MS, MIN_RENEW_DELAY_MS);

    timerRef.current = window.setTimeout(() => {
      void renew();
    }, delay);
  }

  useEffect(() => {
    let active = true;

    void startSession().then((pair) => {
      if (!active) return;
      if (!pair) {
        setStatus("anonymous");
        return;
      }
      setStatus("authenticated");
      schedule(pair.access_token);
    });

    // El interceptor del SDK avisa aquí cuando un refresco falla y fuerza el
    // logout: el provider solo tiene que reflejarlo.
    const unsubscribe = onAuthChange(() => {
      stopTimer();
      setStatus("anonymous");
    });

    return () => {
      active = false;
      unsubscribe();
      stopTimer();
    };
  }, []);

  async function login(password: string) {
    const pair = await loginRequest(password);
    setTokens(pair);
    setStatus("authenticated");
    schedule(pair.access_token);
  }

  async function logout() {
    stopTimer();
    await logoutRemote();
    clearTokens();
    setStatus("anonymous");
  }

  return (
    <AuthContext.Provider value={{ status, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Estado de sesión desde cualquier componente. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de <AuthProvider>.");
  return context;
}
