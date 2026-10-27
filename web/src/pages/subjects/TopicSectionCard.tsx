import type { ReactNode } from "react";
import { Card } from "../../components";

export interface TopicSectionCardProps {
  title: string;
  /** Número de elementos a la derecha del título; se omite si no aplica. */
  count?: number;
  /** Acción alineada a la derecha de la cabecera. */
  action?: ReactNode;
  children: ReactNode;
}

/** Tarjeta con cabecera fija para las secciones de la página de tema. */
export function TopicSectionCard({ title, count, action, children }: TopicSectionCardProps) {
  return (
    <Card className="overflow-hidden">
      <div className="flex min-h-[52px] items-center justify-between gap-2 border-b border-onyx-line px-4 py-2">
        <h2 className="min-w-0 truncate text-[15px] font-medium text-onyx-ink">
          {title}
          {typeof count === "number" && (
            <span className="ml-2 text-[12px] font-normal tabular-nums text-onyx-inkFaint">
              {count}
            </span>
          )}
        </h2>
        {action}
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </Card>
  );
}
