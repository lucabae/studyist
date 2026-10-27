import { useId, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  invalid: boolean;
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
  /** Recibe el id y los aria-* ya calculados para el control. */
  children: (control: FieldControlProps) => ReactNode;
}

/** Label + hint + error con ids generados, sin acoplar el control. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-onyx-inkMuted">
        {label}
      </label>

      {children({ id, "aria-describedby": describedBy, invalid: Boolean(error) })}

      {hint && !error && (
        <p id={hintId} className="text-[12px] text-onyx-inkFaint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-[12px] text-[#f0a8a1]">
          {error}
        </p>
      )}
    </div>
  );
}
