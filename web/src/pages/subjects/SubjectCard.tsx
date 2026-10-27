import { Link } from "react-router-dom";
import type { AsignaturaRead } from "../../api/generated";
import { Card, IconButton } from "../../components";
import { colorToHex } from "./subjectColor";

export interface SubjectCardProps {
  subject: AsignaturaRead;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Tarjeta del listado. El enlace al detalle se estira con `after:absolute`
 * para que toda la superficie sea clicable sin anidar botones dentro del
 * enlace (las acciones quedan por encima con `z-10`).
 */
export function SubjectCard({ subject, onEdit, onDelete }: SubjectCardProps) {
  const temas = subject.tema_count ?? 0;

  return (
    <Card className="relative overflow-hidden transition-colors duration-150 hover:border-onyx-inkFaint/50 hover:bg-onyx-surfaceHover">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: colorToHex(subject.color) }}
      />

      <div className="flex items-start justify-between gap-2 p-4 pl-5">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-medium text-onyx-ink">
            <Link
              to={`/asignaturas/${subject.id}`}
              className="focus-ring after:absolute after:inset-0 after:content-['']"
            >
              {subject.name}
            </Link>
          </h2>
          <p className="mt-1 text-[13px] text-onyx-inkMuted">
            {subject.year}º año · Semestre {subject.semester}
          </p>
          <p className="mt-1 text-[12px] text-onyx-inkFaint">
            {temas} {temas === 1 ? "tema" : "temas"}
          </p>
        </div>

        <div className="relative z-10 flex shrink-0 items-center gap-0.5">
          <IconButton
            aria-label={`Editar ${subject.name}`}
            size="sm"
            onClick={onEdit}
            className="sm:h-8 sm:w-8"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M4.5 15.5h3l7-7-3-3-7 7zM11 5.5l3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
          <IconButton
            aria-label={`Borrar ${subject.name}`}
            size="sm"
            tone="danger"
            onClick={onDelete}
            className="sm:h-8 sm:w-8"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M4.5 6.5h11M8 6.5V4.5h4v2M6.5 6.5l.7 9h5.6l.7-9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
        </div>
      </div>
    </Card>
  );
}
