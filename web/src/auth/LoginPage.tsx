/**
 * Pantalla de acceso (`/login`).
 *
 * Única puerta a la app: no hay usuario ni registro, solo la contraseña del
 * dueño. Si ya hay sesión, redirige a donde el usuario intentaba ir.
 */
import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import logoMark from "../../media/logo_no_text.png";
import { Spinner } from "../components/ui/Spinner";
import { apiErrorMessage } from "../lib/api";
import { useAuth } from "./AuthContext";

/** Solo rutas internas: `//otro-sitio` sería una URL externa. */
function safeFrom(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default function LoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const from = safeFrom((location.state as { from?: unknown } | null)?.from);

  if (status === "authenticated") {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || password.length === 0) return;

    setPending(true);
    setError(null);

    try {
      await login(password);
      // Al pasar a "authenticated", el <Navigate> de arriba se encarga.
    } catch (requestError) {
      setError(apiErrorMessage(requestError));
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-onyx-bg px-5 py-10 text-onyx-ink">
      {status === "loading" ? (
        <Spinner label="Comprobando sesión" />
      ) : (
        <main className="w-full max-w-sm rounded-xl border border-onyx-line bg-onyx-surface p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg">
              <img
                src={logoMark}
                alt=""
                className="h-10 w-10 scale-[1.6] object-contain"
              />
            </span>
            <h1 className="text-xl font-medium tracking-tight">Studyist</h1>
          </div>

          <p className="mt-4 text-[14px] text-onyx-inkMuted">
            Escribe la contraseña para entrar.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-[13px] font-medium text-onyx-inkMuted"
              >
                Contraseña
              </label>

              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "password-error" : undefined}
                className="focus-ring h-11 w-full rounded-lg border border-onyx-line bg-onyx-bg px-3 text-[16px] text-onyx-ink transition-colors duration-150 placeholder:text-onyx-inkFaint disabled:cursor-not-allowed disabled:opacity-50 sm:text-[15px]"
              />

              {error && (
                <p id="password-error" role="alert" className="text-[13px] text-[#f0a8a1]">
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={pending || password.length === 0}
              className="focus-ring inline-flex h-11 w-full select-none items-center justify-center rounded-lg bg-white px-4 text-[14px] font-medium text-black transition-colors duration-150 hover:bg-white/90 disabled:pointer-events-none disabled:opacity-45"
            >
              {pending ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </main>
      )}
    </div>
  );
}
