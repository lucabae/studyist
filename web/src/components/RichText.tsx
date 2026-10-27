import katex from "katex";
import { Fragment, useMemo, type ReactNode } from "react";
import { cn } from "../lib/cn";

interface Segment {
  type: "text" | "math";
  value: string;
  display: boolean;
}

/**
 * Separa texto plano de formulas. Acepta `$...$`, `$$...$$`, `\(...\)` y
 * `\[...\]`; el resto se deja tal cual para conservar saltos y espacios.
 */
function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g;
  let lastIndex = 0;

  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        value: text.slice(lastIndex, match.index),
        display: false,
      });
    }

    const display = match[1] !== undefined || match[2] !== undefined;
    segments.push({
      type: "math",
      value: (match[1] ?? match[2] ?? match[3] ?? match[4]).trim(),
      display,
    });
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex), display: false });
  }

  return segments;
}

function renderMath(value: string, display: boolean): string {
  return katex.renderToString(value, {
    displayMode: display,
    throwOnError: false,
    strict: "ignore",
    trust: false,
  });
}

export interface RichTextProps {
  text: string;
  /** Se aplica al contenedor; el texto conserva saltos y espacios. */
  className?: string;
}

/**
 * Texto de tarjeta con formulas LaTeX. Sin delimitadores se pinta igual que
 * antes: texto plano con `whitespace-pre-wrap`.
 */
export function RichText({ text, className }: RichTextProps) {
  const segments = useMemo(() => parseSegments(text), [text]);

  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {segments.map((segment, index): ReactNode => {
        if (segment.type === "text") {
          return <Fragment key={index}>{segment.value}</Fragment>;
        }

        return (
          <span
            key={index}
            className={cn(
              "max-w-full overflow-x-auto align-middle",
              segment.display ? "my-2 block" : "inline-block",
            )}
            dangerouslySetInnerHTML={{ __html: renderMath(segment.value, segment.display) }}
          />
        );
      })}
    </span>
  );
}
