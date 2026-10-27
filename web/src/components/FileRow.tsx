import { cn } from "../lib/cn";
import { formatBytes } from "../lib/format";
import { IconButton } from "./ui/IconButton";

export interface FileRowFile {
  id: number;
  name: string;
  /** Extension del backend: pdf, png, txt... */
  type: string;
  size: number;
  /** URL ya resuelta del thumbnail; null si no tiene. */
  thumbnail?: string | null;
}

export interface FileRowProps {
  file: FileRowFile;
  onOpen?: (id: number) => void;
  onRename?: (id: number) => void;
  onDelete?: (id: number) => void;
  className?: string;
}

/** Icono de 20px segun el tipo de archivo, para cuando no hay thumbnail. */
function TypeIcon({ type }: { type: string }) {
  const normalized = type.toLowerCase();
  const isImage = /^(png|jpe?g|gif|webp|avif|svg|heic)$/.test(normalized);
  const isPdf = normalized === "pdf";
  const isText = /^(txt|md|markdown|csv|json|html?)$/.test(normalized);

  return (
    <svg
      viewBox="0 0 20 20"
      className="h-5 w-5 text-onyx-inkFaint"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      {isImage ? (
        <>
          <rect x="3.5" y="4.5" width="13" height="11" rx="1.5" />
          <path d="m4.5 13 3.5-3.5 2.5 2.5 2-2 3 3" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : isPdf || isText ? (
        <>
          <path d="M6 3.5h6l2.5 2.5v10.5H6z" strokeLinejoin="round" />
          {isPdf ? (
            <path d="M8 9.5h4M8 12h4" strokeLinecap="round" />
          ) : (
            <path d="M8 8.5h4M8 11h4M8 13.5h2.5" strokeLinecap="round" />
          )}
        </>
      ) : (
        <>
          <path d="M5.5 5.5h9v9h-9z" strokeLinejoin="round" />
          <path d="M8 9.5h4M8 12h4" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/**
 * Fila reutilizable de archivo: thumbnail, nombre y meta + acciones.
 * No consulta la API: usa las URLs que le pasa la pagina.
 */
export function FileRow({ file, onOpen, onRename, onDelete, className }: FileRowProps) {
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-onyx-line bg-onyx-bg">
        {file.thumbnail ? (
          <img
            src={file.thumbnail}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <TypeIcon type={file.type} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-onyx-ink">
          {file.name}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-onyx-inkFaint">
          {formatBytes(file.size)} · {file.type.toUpperCase()}
        </span>
      </span>
    </>
  );

  return (
    <div
      className={cn(
        "group flex min-w-0 items-center gap-1 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-onyx-surface",
        className,
      )}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(file.id)}
          aria-label={`Abrir ${file.name}`}
          className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left"
        >
          {content}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{content}</div>
      )}

      <div className="flex shrink-0 items-center gap-0.5">
        {onOpen && (
          <IconButton
            aria-label={`Abrir ${file.name}`}
            size="sm"
            onClick={() => onOpen(file.id)}
            className="sm:h-9 sm:w-9"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M7.5 5 12.5 10l-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
        )}

        {onRename && (
          <IconButton
            aria-label={`Renombrar ${file.name}`}
            size="sm"
            onClick={() => onRename(file.id)}
            className="sm:h-9 sm:w-9"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M4.5 15.5h3l7-7-3-3-7 7zM11 5.5l3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
        )}

        {onDelete && (
          <IconButton
            aria-label={`Borrar ${file.name}`}
            size="sm"
            tone="danger"
            onClick={() => onDelete(file.id)}
            className="sm:h-9 sm:w-9"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M4.5 6.5h11M8 6.5V4.5h4v2M6.5 6.5l.7 9h5.6l.7-9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
        )}
      </div>
    </div>
  );
}
