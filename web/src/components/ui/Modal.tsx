import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { IconButton } from "./IconButton";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  /** Zona de acciones, alineada a la derecha. */
  footer?: ReactNode;
  size?: "sm" | "md";
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Contador por si hay modales anidados: solo el primero bloquea el scroll. */
let scrollLocks = 0;

/**
 * Dialogo modal: Escape y backdrop cierran, el scroll del body se bloquea y el
 * foco entra en el primer control. En movil sube como hoja inferior.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // El padre suele pasar un onClose inline: se guarda en ref para que el
  // efecto de apertura no se reejecute (y no robe el foco al escribir).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement as HTMLElement | null;

    if (scrollLocks === 0) {
      document.body.style.overflow = "hidden";
    }
    scrollLocks += 1;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    // Foco inicial en el primer control; si no hay, en el panel.
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      scrollLocks -= 1;
      if (scrollLocks === 0) {
        document.body.style.overflow = "";
      }
      previousFocus?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        className={cn(
          "focus-ring max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-onyx-line bg-onyx-surface p-4 shadow-[0_10px_40px_rgba(0,0,0,0.5)] sm:rounded-xl sm:p-5",
          size === "sm" ? "sm:max-w-sm" : "sm:max-w-md",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 id={titleId} className="truncate text-[16px] font-medium text-onyx-ink">
                {title}
              </h2>
            )}
            {description && (
              <p id={descriptionId} className="mt-1 text-[13px] leading-relaxed text-onyx-inkMuted">
                {description}
              </p>
            )}
          </div>
          <IconButton aria-label="Cerrar" onClick={onClose} className="-mr-1 -mt-1">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
            </svg>
          </IconButton>
        </div>

        <div className="mt-4">{children}</div>

        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
