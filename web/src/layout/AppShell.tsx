import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import logoMark from "../../media/logo_no_text.png";
import { useAuth } from "../auth/AuthContext";
import { cn } from "../lib/cn";

interface NavItem {
  to: string;
  label: string;
  path: string;
}

/** Iconos inline de 20px, trazo 1.5, mismo peso optico que la home. */
const NAV_ITEMS: NavItem[] = [
  {
    to: "/",
    label: "Principal",
    path: "M3.5 10.5 10 4l6.5 6.5v6a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z",
  },
  {
    to: "/archivos",
    label: "Archivos",
    path: "M4 5.5h5l2 2h5v7.5H4z",
  },
  {
    to: "/asignaturas",
    label: "Asignaturas",
    // Birrete: el icono de calendario se ha movido a Eventos, que es su sitio.
    path: "M10 4.2 3.6 7.2 10 10.2l6.4-3zM6 9.6v3.3c0 1.3 1.8 2.1 4 2.1s4-.8 4-2.1V9.6",
  },
  {
    to: "/eventos",
    label: "Eventos",
    path: "M4 5.5h12v11H4zM7 3.5v4M13 3.5v4",
  },
  {
    to: "/flashcards",
    label: "Flashcards",
    path: "M6 5.5h8a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 14V7A1.5 1.5 0 0 1 6 5.5zM7.5 4h7",
  },
];

/** Puerta con la flecha de salida: cerrar sesión. */
const LOGOUT_PATH =
  "M8 4.5H5.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H8M11.5 7l3 3-3 3M14.5 10h-6";

function NavIcon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Estructura de la app: raíl de 52px en escritorio, barra de 56px en movil.
 * El contenido de cada ruta entra por <Outlet />.
 */
export function AppShell() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-[100dvh] bg-onyx-bg text-onyx-ink">
      <a
        href="#contenido"
        className="focus-ring sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-black"
      >
        Saltar al contenido
      </a>

      <nav
        aria-label="Navegación principal"
        className="sticky top-0 hidden h-[100dvh] w-[52px] shrink-0 flex-col items-center gap-1 bg-onyx-rail py-3 sm:flex"
      >
        <Link
          to="/"
          aria-label="Studyist, ir al inicio"
          className="focus-ring mb-3 flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg"
        >
          <img
            src={logoMark}
            alt=""
            className="h-8 w-8 scale-[1.6] object-contain"
          />
        </Link>

        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            aria-label={item.label}
            title={item.label}
            className={({ isActive }) =>
              cn(
                "focus-ring flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150",
                isActive
                  ? "bg-onyx-surface text-onyx-ink"
                  : "text-onyx-inkFaint hover:bg-[#2a2a2a] hover:text-onyx-inkMuted",
              )
            }
          >
            <NavIcon path={item.path} />
          </NavLink>
        ))}

        <button
          type="button"
          onClick={() => void handleLogout()}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          className="focus-ring mt-auto flex h-9 w-9 items-center justify-center rounded-lg text-onyx-inkFaint transition-colors duration-150 hover:bg-[#2a2a2a] hover:text-onyx-inkMuted"
        >
          <NavIcon path={LOGOUT_PATH} />
        </button>
      </nav>

      <main id="contenido" className="min-w-0 flex-1 pb-14 sm:pb-0">
        <Outlet />
      </main>

      {/* En movil el raíl desaparece y los destinos bajan a la barra fija. */}
      <nav
        aria-label="Navegación principal móvil"
        className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-onyx-line bg-onyx-rail sm:hidden"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            aria-label={item.label}
            className={({ isActive }) =>
              cn(
                "focus-ring flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150",
                isActive ? "text-onyx-ink" : "text-onyx-inkFaint",
              )
            }
          >
            <NavIcon path={item.path} />
            <span className="max-w-full truncate px-0.5 text-[10px] leading-none">
              {item.label}
            </span>
          </NavLink>
        ))}

        <button
          type="button"
          onClick={() => void handleLogout()}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          className="focus-ring flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-onyx-inkFaint transition-colors duration-150 hover:text-onyx-inkMuted"
        >
          <NavIcon path={LOGOUT_PATH} />
          <span className="max-w-full truncate px-0.5 text-[10px] leading-none">
            Salir
          </span>
        </button>
      </nav>
    </div>
  );
}

export default AppShell;
