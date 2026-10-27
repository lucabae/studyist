import { Button, EmptyState } from "../../components";

export interface NotFoundStateProps {
  title: string;
  description: string;
  /** Ruta de vuelta; por defecto el listado de asignaturas. */
  backTo?: string;
  backLabel?: string;
}

/** 404 de las pantallas de asignaturas: mensaje claro y salida. */
export function NotFoundState({
  title,
  description,
  backTo = "/asignaturas",
  backLabel = "Volver a asignaturas",
}: NotFoundStateProps) {
  return (
    <EmptyState
      className="mt-6"
      title={title}
      description={description}
      icon={
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <circle cx="10" cy="10" r="6.5" />
          <path d="M10 6.5v4.5M10 13.5v.2" strokeLinecap="round" />
        </svg>
      }
      action={
        <Button to={backTo} variant="secondary">
          {backLabel}
        </Button>
      }
    />
  );
}
