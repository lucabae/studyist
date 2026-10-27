import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Icono o ilustracion de 24-32px. */
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-onyx-line px-5 py-10 text-center",
        className,
      )}
    >
      {icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-onyx-surface text-onyx-inkMuted" aria-hidden>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-onyx-ink">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-[42ch] text-[13px] leading-relaxed text-onyx-inkFaint">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
