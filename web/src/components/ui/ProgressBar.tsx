import { cn } from "../../lib/cn";

export interface ProgressBarProps {
  /**
   * Porcentaje 0–100. `null` (o ausente) pinta una barra indeterminada que
   * barre de izquierda a derecha.
   */
  value?: number | null;
  /** Texto encima de la barra; se anuncia con aria-live. */
  label?: string;
  /** Detalle secundario a la derecha del label. */
  hint?: string;
  className?: string;
}

/** Limita el porcentaje al rango visible y redondea a un decimal. */
function clampValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

/**
 * Barra de progreso del design system.
 *
 * La parte rellena lleva un degradado y un brillo que la recorre, para que la
 * espera se sienta viva sin distraer. Con `value` avanza con transición; sin
 * él, se mueve sola (indeterminada).
 */
export function ProgressBar({ value = null, label, hint, className }: ProgressBarProps) {
  const indeterminate = value === null;
  const percent = indeterminate ? 0 : clampValue(value);

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {(label || hint) && (
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          {label && (
            <p
              className="min-w-0 truncate text-[13px] text-onyx-inkMuted"
              role="status"
              aria-live="polite"
            >
              {label}
            </p>
          )}
          {hint && (
            <span className="shrink-0 text-[12px] tabular-nums text-onyx-inkFaint">
              {hint}
            </span>
          )}
        </div>
      )}

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : percent}
        aria-valuetext={indeterminate ? "En curso" : `${percent}%`}
        aria-label={label ?? "Progreso"}
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]"
      >
        {indeterminate ? (
          <span className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r from-white/10 via-white/70 to-white/10 progress-indeterminate" />
        ) : (
          <span
            className="relative block h-full rounded-full bg-gradient-to-r from-white/45 via-white/80 to-white transition-[width] duration-500 ease-out"
            style={{ width: `${percent}%` }}
          >
            <span className="absolute inset-0 overflow-hidden rounded-full">
              <span className="absolute inset-y-0 -left-full w-full bg-gradient-to-r from-transparent via-white/70 to-transparent progress-shine" />
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
