import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Botones o filtros alineados a la derecha (envuelven en movil). */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[22px] font-medium leading-tight tracking-[-0.02em] text-onyx-ink sm:text-[26px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-onyx-inkMuted sm:text-[14px]">
            {description}
          </p>
        )}
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
