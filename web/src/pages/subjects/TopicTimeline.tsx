import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { TemaRead } from "../../api/generated";
import { IconButton } from "../../components";
import { flattenTopics } from "./topicTree";

export interface TopicTimelineProps {
  topics: TemaRead[];
  onDelete: (topic: TemaRead) => void;
}

/** Sangria por nivel, acotada para que a 360px el nombre siga leyendose. */
const MAX_INDENT_DEPTH = 4;
const INDENT_PX = 14;

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Timeline vertical de temas con sus subtemas. En movil se apila sin scroll
 * horizontal: una linea a la izquierda, un punto por tema y la tarjeta
 * clicable al lado. Los temas con hijos se pueden plegar.
 */
export function TopicTimeline({ topics, onDelete }: TopicTimelineProps) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const rows = useMemo(() => flattenTopics(topics, collapsed), [topics, collapsed]);

  function toggle(topicId: number) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  }

  return (
    <ol className="ml-[5px] border-l border-onyx-line">
      {rows.map(({ topic, depth }, position) => {
        const files = topic.file_ids?.length ?? 0;
        const sets = topic.flashcard_set_ids?.length ?? 0;
        const children = topic.child_ids?.length ?? 0;
        const isCollapsed = collapsed.has(topic.id);
        const indent = Math.min(depth, MAX_INDENT_DEPTH) * INDENT_PX;

        return (
          <li
            key={topic.id}
            className="relative pb-3 last:pb-0"
            style={{ paddingLeft: 20 + indent }}
          >
            <span
              aria-hidden
              className="absolute -left-[5px] top-4 h-2.5 w-2.5 rounded-full border-2 border-onyx-bg bg-onyx-inkFaint"
            />

            <div className="relative rounded-xl border border-onyx-line bg-onyx-surface p-3 transition-colors duration-150 hover:border-onyx-inkFaint/50 hover:bg-onyx-surfaceHover">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    {children > 0 ? (
                      <button
                        type="button"
                        onClick={() => toggle(topic.id)}
                        aria-expanded={!isCollapsed}
                        className="focus-ring relative z-10 -ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-onyx-inkFaint transition-colors duration-150 hover:text-onyx-ink"
                      >
                        <span className="sr-only">
                          {isCollapsed ? "Desplegar" : "Plegar"} los subtemas de{" "}
                          {topic.name}
                        </span>
                        <svg
                          viewBox="0 0 20 20"
                          className={`h-3.5 w-3.5 transition-transform duration-150 ${
                            isCollapsed ? "" : "rotate-90"
                          }`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          aria-hidden
                        >
                          <path
                            d="M8 5.5 12.5 10 8 14.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    ) : (
                      <span aria-hidden className="w-5 shrink-0" />
                    )}

                    <span className="shrink-0 text-[12px] tabular-nums text-onyx-inkFaint">
                      {String(position + 1).padStart(2, "0")}
                    </span>
                    <h3 className="min-w-0 truncate text-[14px] font-medium text-onyx-ink">
                      <Link
                        to={`/temas/${topic.id}`}
                        className="focus-ring after:absolute after:inset-0 after:content-['']"
                      >
                        {topic.name}
                      </Link>
                    </h3>
                  </div>
                  <p className="mt-1 pl-7 text-[12px] text-onyx-inkFaint">
                    {plural(files, "archivo", "archivos")} · {plural(sets, "set", "sets")}
                    {children > 0 &&
                      ` · ${plural(children, "subtema", "subtemas")}${
                        isCollapsed ? " (plegado)" : ""
                      }`}
                  </p>
                </div>

                <IconButton
                  aria-label={`Borrar ${topic.name}`}
                  size="sm"
                  tone="danger"
                  onClick={() => onDelete(topic)}
                  className="relative z-10 shrink-0"
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                    <path d="M4.5 6.5h11M8 6.5V4.5h4v2M6.5 6.5l.7 9h5.6l.7-9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </IconButton>
              </div>
            </div>

            {children > 0 && isCollapsed && (
              <p className="mt-1.5 pl-7 text-[12px] text-onyx-inkFaint">
                {plural(children, "subtema oculto", "subtemas ocultos")}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
