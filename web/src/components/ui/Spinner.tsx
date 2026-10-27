import { cn } from "../../lib/cn";

export interface SpinnerProps {
  size?: "sm" | "md";
  /** Texto accesible; por defecto "Cargando". */
  label?: string;
  className?: string;
}

const SIZES = { sm: "h-4 w-4", md: "h-5 w-5" } as const;

export function Spinner({ size = "md", label = "Cargando", className }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className={cn("inline-flex", className)}>
      <svg
        viewBox="0 0 24 24"
        className={cn("animate-spin text-current", SIZES[size])}
        fill="none"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
