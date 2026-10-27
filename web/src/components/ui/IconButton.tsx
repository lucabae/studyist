import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "className"> {
  /** Obligatorio: el boton solo tiene icono. */
  "aria-label": string;
  /** md = 36px (por defecto), sm = 32px (filas densas en movil). */
  size?: "sm" | "md";
  /** El icono se tine de rojo apagado sin salir de la paleta neutra. */
  tone?: "default" | "danger";
  className?: string;
}

const BASE =
  "focus-ring inline-flex shrink-0 items-center justify-center rounded-lg text-onyx-inkMuted transition-colors duration-150 hover:bg-onyx-surface hover:text-onyx-ink disabled:pointer-events-none disabled:opacity-40";

const SIZES = { sm: "h-8 w-8", md: "h-9 w-9" } as const;

const TONES = {
  default: "",
  danger: "hover:text-[#f0a8a1]",
} as const;

export function IconButton({
  size = "md",
  tone = "default",
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(BASE, SIZES[size], TONES[tone], className)}
      {...rest}
    />
  );
}
