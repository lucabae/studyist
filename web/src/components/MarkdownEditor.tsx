import { useId, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../lib/cn";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
  placeholder?: string;
}

/**
 * Estilos de prosa oscuros hechos a mano (sin @tailwindcss/typography).
 * Todo en superficies Onyx y con el mismo interlineado que el resto.
 */
const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-5 text-[20px] font-medium text-onyx-ink first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-[17px] font-medium text-onyx-ink first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-3 text-[15px] font-medium text-onyx-ink first:mt-0">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="my-2 text-[15px] leading-relaxed text-onyx-ink first:mt-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-onyx-ink">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 text-[15px] leading-relaxed text-onyx-ink">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1 marker:text-onyx-inkFaint">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-onyx-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-onyx-ink underline decoration-onyx-inkFaint underline-offset-2 hover:decoration-onyx-ink"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-onyx-line pl-3 italic text-onyx-inkMuted">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-onyx-line" />,
  code: ({ className, children }) => (
    <code
      className={cn(
        "rounded bg-onyx-bg px-1.5 py-0.5 font-mono text-[13px] text-onyx-ink",
        className,
      )}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-onyx-line bg-onyx-bg p-3 text-[13px] leading-relaxed text-onyx-ink">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-onyx-line bg-onyx-bg px-2 py-1 text-left font-medium text-onyx-ink">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-onyx-line px-2 py-1 align-top text-onyx-inkMuted">
      {children}
    </td>
  ),
  img: ({ src, alt }) =>
    src ? (
      <img
        src={src}
        alt={alt ?? ""}
        className="my-3 max-h-80 w-full rounded-lg border border-onyx-line object-contain"
      />
    ) : null,
};

type Mode = "write" | "preview";

/** Editor Markdown con pestanas Escribir / Vista previa. */
export function MarkdownEditor({
  value,
  onChange,
  label = "Contenido",
  className,
  placeholder = "Escribe en Markdown…",
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<Mode>("write");
  const id = useId();
  const tabId = (target: Mode) => `${id}-tab-${target}`;
  const panelId = `${id}-panel`;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={`${id}-input`} className="text-[13px] font-medium text-onyx-inkMuted">
        {label}
      </label>

      <div className="min-w-0 overflow-hidden rounded-lg border border-onyx-line bg-onyx-surface">
        <div
          role="tablist"
          aria-label="Modo del editor"
          className="flex items-center gap-1 border-b border-onyx-line px-1"
        >
          {(["write", "preview"] as const).map((target) => (
            <button
              key={target}
              type="button"
              role="tab"
              id={tabId(target)}
              aria-selected={mode === target}
              aria-controls={panelId}
              onClick={() => setMode(target)}
              className={cn(
                "focus-ring -mb-px rounded-t-md border-b-2 px-3 py-2 text-[13px] transition-colors duration-150",
                mode === target
                  ? "border-white text-onyx-ink"
                  : "border-transparent text-onyx-inkFaint hover:text-onyx-inkMuted",
              )}
            >
              {target === "write" ? "Escribir" : "Vista previa"}
            </button>
          ))}
        </div>

        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={tabId(mode)}
          className="min-h-[220px]"
        >
          {mode === "write" ? (
            <textarea
              id={`${id}-input`}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={placeholder}
              className="focus-ring block min-h-[220px] w-full resize-y bg-transparent p-3 text-[16px] leading-relaxed text-onyx-ink placeholder:text-onyx-inkFaint"
            />
          ) : value.trim() ? (
            <div className="px-3 py-2">
              <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {value}
              </Markdown>
            </div>
          ) : (
            <p className="px-3 py-4 text-[13px] text-onyx-inkFaint">
              Nada que previsualizar todavía.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
