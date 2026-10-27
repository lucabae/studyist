import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type CardProps = HTMLAttributes<HTMLDivElement>;

/** Superficie base: 12px de radio, borde de 1px y fondo #303030. */
export function Card({ className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border border-onyx-line bg-onyx-surface",
        className,
      )}
      {...rest}
    />
  );
}
