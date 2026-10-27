import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ComponentProps,
  ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

type Shared = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children?: ReactNode;
};

type AsButton = Shared &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    to?: never;
    href?: never;
  };

type AsLink = Shared &
  Omit<ComponentProps<typeof Link>, "className" | "children" | "to"> & {
    to: string;
    href?: never;
  };

type AsAnchor = Shared &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children"> & {
    href: string;
    to?: never;
  };

export type ButtonProps = AsButton | AsLink | AsAnchor;

const BASE =
  "focus-ring inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45";

const VARIANTS: Record<Variant, string> = {
  // Unico blanco puro de la interfaz.
  primary: "bg-white text-black hover:bg-white/90",
  secondary:
    "border border-onyx-line bg-onyx-surface text-onyx-ink hover:bg-onyx-surfaceHover",
  ghost: "text-onyx-inkMuted hover:bg-onyx-surface hover:text-onyx-ink",
  // Destructivo sin color de marca: solo el texto se tine.
  danger:
    "border border-onyx-line bg-onyx-surface text-[#f0a8a1] hover:bg-onyx-surfaceHover",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-[14px]",
};

/**
 * Boton unico de la app. Con `to` navega (Link) y con `href` abre un enlace;
 * en ambos casos conserva el mismo estilo y el foco visible.
 */
export function Button(props: ButtonProps) {
  const classes = cn(
    BASE,
    VARIANTS[props.variant ?? "primary"],
    SIZES[props.size ?? "md"],
    props.className,
  );

  if (props.to !== undefined) {
    const { to, variant: _variant, size: _size, className: _cn, ...rest } = props;
    return <Link to={to} className={classes} {...rest} />;
  }

  if (props.href !== undefined) {
    const { href, variant: _variant, size: _size, className: _cn, ...rest } = props;
    return <a href={href} className={classes} {...rest} />;
  }

  const { to: _to, href: _href, variant: _variant, size: _size, className: _cn, ...rest } =
    props;
  return <button type="button" className={classes} {...rest} />;
}
