import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> {
  className?: string;
  invalid?: boolean;
}

/** Textarea de 16px, resize vertical y foco comun. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, invalid = false, rows = 4, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        aria-invalid={invalid || undefined}
        className={cn(
          "focus-ring block min-h-[96px] w-full resize-y rounded-lg border bg-onyx-surface px-3 py-2 text-[16px] leading-relaxed text-onyx-ink transition-colors duration-150 placeholder:text-onyx-inkFaint disabled:cursor-not-allowed disabled:opacity-50 sm:text-[15px]",
          invalid ? "border-[#c97b74]" : "border-onyx-line",
          className,
        )}
        {...rest}
      />
    );
  },
);
