import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  className?: string;
  /** Borde de error; el mensaje lo pinta Field. */
  invalid?: boolean;
}

/** Input de 16px (evita el zoom de iOS) sobre superficie Onyx. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, type = "text", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        "focus-ring h-10 w-full rounded-lg border bg-onyx-surface px-3 text-[16px] text-onyx-ink transition-colors duration-150 placeholder:text-onyx-inkFaint disabled:cursor-not-allowed disabled:opacity-50 sm:text-[15px]",
        invalid ? "border-[#c97b74]" : "border-onyx-line",
        className,
      )}
      {...rest}
    />
  );
});
