/**
 * Puerta de las rutas privadas: nada de la app se monta sin sesión.
 *
 * Mientras se comprueba el token se pinta solo un fondo con el spinner, para
 * que no aparezca contenido que luego haya que retirar.
 */
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "./AuthContext";

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-onyx-bg text-onyx-inkMuted">
        <Spinner label="Comprobando sesión" />
      </div>
    );
  }

  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export default RequireAuth;
