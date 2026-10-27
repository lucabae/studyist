/**
 * Lista de subidas en curso y terminadas. Presentacional: la red y el estado
 * viven en useFileUpload.
 */
import { Link } from "react-router-dom";
import { Button, IconButton, Spinner } from "../../components";
import { cn } from "../../lib/cn";
import type { UploadItem } from "./useFileUpload";

export interface UploadQueueProps {
  items: UploadItem[];
  uploading: boolean;
  onDismiss: (id: string) => void;
  onClearFinished: () => void;
}

function StatusLabel({ item }: { item: UploadItem }) {
  if (item.status === "uploading") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-onyx-inkMuted">
        <Spinner size="sm" label="Subiendo" />
        Subiendo…
      </span>
    );
  }

  if (item.status === "done") {
    return <span className="shrink-0 text-[12px] text-onyx-inkMuted">Listo</span>;
  }

  return (
    <span
      className={cn(
        "shrink-0 text-[12px]",
        item.duplicateId !== undefined ? "text-onyx-inkMuted" : "text-[#f0a8a1]",
      )}
    >
      {item.duplicateId !== undefined ? "Duplicado" : "Error"}
    </span>
  );
}

export function UploadQueue({
  items,
  uploading,
  onDismiss,
  onClearFinished,
}: UploadQueueProps) {
  if (items.length === 0) return null;

  const finished = items.some((item) => item.status !== "uploading");

  return (
    <section
      aria-label="Subidas"
      aria-busy={uploading}
      className="mt-3 overflow-hidden rounded-xl border border-onyx-line bg-onyx-surface"
    >
      <div className="flex items-center justify-between gap-2 border-b border-onyx-line px-3 py-2">
        <p className="text-[12px] font-medium text-onyx-inkMuted">
          {uploading ? "Subiendo archivos…" : "Subidas"}
        </p>
        {finished && (
          <Button size="sm" variant="ghost" onClick={onClearFinished}>
            Limpiar
          </Button>
        )}
      </div>

      <ul className="divide-y divide-onyx-line">
        {items.map((item) => (
          <li key={item.id} className="px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-[13px] text-onyx-ink">
                {item.name}
              </p>
              <StatusLabel item={item} />
              <IconButton
                aria-label={`Quitar ${item.name} de la lista`}
                size="sm"
                onClick={() => onDismiss(item.id)}
                className="-mr-1"
              >
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
                </svg>
              </IconButton>
            </div>

            {item.status === "error" && item.message && (
              <p className="mt-1 break-words text-[12px] leading-relaxed text-onyx-inkFaint">
                {item.message}
              </p>
            )}

            {item.duplicateId !== undefined && (
              <Link
                to={`/archivos/${item.duplicateId}`}
                className="focus-ring mt-1 inline-block rounded text-[12px] text-onyx-ink underline decoration-onyx-inkFaint underline-offset-2 hover:decoration-onyx-ink"
              >
                Abrir el que ya existe
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
