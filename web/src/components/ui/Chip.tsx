import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Filtro seleccionado: fondo de superficie y texto blanco. */
  active?: boolean;
  children?: ReactNode;
}

/** Chip de 999px; se usa como filtro o sugerencia. */
export function Chip({
  active = false,
  className,
  type = "button",
  children,
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={active || undefined}
      className={cn(
        "focus-ring inline-flex h-8 max-w-full select-none items-center gap-1.5 truncate rounded-full border px-3.5 text-[13px] transition-colors duration-150",
        active
          ? "border-onyx-line bg-onyx-surface text-onyx-ink"
          : "border-onyx-line bg-transparent text-onyx-inkMuted hover:bg-onyx-surface hover:text-onyx-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
