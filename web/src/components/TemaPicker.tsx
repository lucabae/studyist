/**
 * Selector de tema con busqueda por nombre y filtro por asignatura.
 *
 * Se usa donde haya que vincular un tema a otra entidad (por ejemplo, un
 * evento). Es opcional: el valor puede ser null y se puede quitar.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { listAsignaturasAsignaturaGet, listTemasTemaGet, type TemaRead } from "../api/generated";
import { cn } from "../lib/cn";
import { Field } from "./ui/Field";
import { Spinner } from "./ui/Spinner";
import { useToast } from "./ui/Toast";

export interface TemaPickerProps {
  value: number | null;
  onChange: (temaId: number | null) => void;
  /** Asignatura por la que se filtra al abrir; null = sin filtro inicial. */
  asignaturaId?: number | null;
  disabled?: boolean;
  label?: string;
  hint?: string;
  error?: string | null;
}

const MAX_RESULTS = 8;

/** Orden natural por nombre, igual que el del backend. */
function byName(a: TemaRead, b: TemaRead): number {
  return a.name.localeCompare(b.name, "es", { numeric: true });
}

/** Selector con busqueda y filtro por asignatura. */
export function TemaPicker({
  value,
  onChange,
  asignaturaId = null,
  disabled = false,
  label = "Tema",
  hint = "Opcional. Busca por nombre o elige uno de la lista.",
  error = null,
}: TemaPickerProps) {
  const { toast } = useToast();
  const [temas, setTemas] = useState<TemaRead[] | null>(null);
  const [asignaturas, setAsignaturas] = useState<Map<number, string>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [allSubjects, setAllSubjects] = useState(asignaturaId === null);
  const [highlight, setHighlight] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Los temas y las asignaturas se cargan una vez al montar: el catalogo es
  // pequeno y asi el filtro por nombre es instantaneo.
  useEffect(() => {
    let active = true;

    Promise.all([listTemasTemaGet(), listAsignaturasAsignaturaGet()])
      .then(([temasResult, subjectsResult]) => {
        if (!active) return;
        if (temasResult.error) {
          const message = "No se pudieron cargar los temas.";
          setLoadError(message);
          toast(message, "error");
          return;
        }
        setTemas(temasResult.data ?? []);
        setAsignaturas(
          new Map((subjectsResult.data ?? []).map((subject) => [subject.id, subject.name])),
        );
      })
      .catch(() => {
        if (!active) return;
        setLoadError("No se pudieron cargar los temas.");
      });

    return () => {
      active = false;
    };
  }, [toast]);

  // Al cambiar la asignatura del formulario se vuelve a su filtro natural.
  useEffect(() => {
    setAllSubjects(asignaturaId === null);
  }, [asignaturaId]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const selected = temas?.find((tema) => tema.id === value) ?? null;

  const results = useMemo(() => {
    if (!temas) return [];
    const needle = query.trim().toLocaleLowerCase("es");
    return temas
      .filter((tema) => allSubjects || asignaturaId === null || tema.asignatura_id === asignaturaId)
      .filter((tema) => !needle || tema.name.toLocaleLowerCase("es").includes(needle))
      .sort(byName)
      .slice(0, MAX_RESULTS);
  }, [temas, query, allSubjects, asignaturaId]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  function select(tema: TemaRead | null) {
    onChange(tema ? tema.id : null);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      if (!open) return;
      event.preventDefault();
      const picked = results[highlight];
      if (picked) select(picked);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const hasFilter = asignaturaId !== null;

  return (
    <Field label={label} hint={hint} error={error ?? loadError}>
      {({ id, "aria-describedby": describedBy, invalid }) => (
        <div ref={containerRef} className="flex min-w-0 flex-col gap-2">
          {selected && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-onyx-line bg-onyx-surface px-3 py-2">
              <span className="min-w-0 truncate text-[14px] text-onyx-ink">
                {selected.name}
                {allSubjects && (
                  <span className="ml-2 text-[12px] text-onyx-inkFaint">
                    {asignaturas.get(selected.asignatura_id) ?? ""}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => select(null)}
                disabled={disabled}
                className="focus-ring shrink-0 rounded px-1.5 text-[12px] text-onyx-inkMuted transition-colors duration-150 hover:text-onyx-ink disabled:opacity-50"
              >
                Quitar
              </button>
            </div>
          )}

          <div className="relative">
            <input
              id={id}
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls={`${id}-list`}
              aria-autocomplete="list"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              autoComplete="off"
              value={query}
              disabled={disabled || temas === null}
              placeholder={selected ? "Buscar otro tema" : "Buscar tema por nombre"}
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onKeyDown={handleKeyDown}
              className="focus-ring h-10 w-full rounded-lg border border-onyx-line bg-onyx-surface px-3 text-[16px] text-onyx-ink outline-none placeholder:text-onyx-inkFaint disabled:cursor-not-allowed disabled:opacity-50 sm:text-[15px]"
            />

            {temas === null && !loadError && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-onyx-inkFaint">
                <Spinner size="sm" label="Cargando temas" />
              </span>
            )}

            {open && temas !== null && (
              <div className="mt-1 overflow-hidden rounded-lg border border-onyx-line bg-onyx-surface shadow-lg">
                {hasFilter && (
                  <div className="flex items-center justify-between gap-2 border-b border-onyx-line px-3 py-2">
                    <span className="truncate text-[12px] text-onyx-inkFaint">
                      {allSubjects
                        ? "Todas las asignaturas"
                        : `Solo ${asignaturas.get(asignaturaId) ?? "esta asignatura"}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAllSubjects((current) => !current)}
                      className="focus-ring shrink-0 rounded px-1.5 text-[12px] text-onyx-inkMuted underline-offset-2 transition-colors duration-150 hover:text-onyx-ink hover:underline"
                    >
                      {allSubjects ? "Filtrar por asignatura" : "Ver todas"}
                    </button>
                  </div>
                )}

                <ul id={`${id}-list`} role="listbox" className="max-h-56 overflow-y-auto py-1">
                  {results.length === 0 && (
                    <li className="px-3 py-2 text-[13px] text-onyx-inkFaint">
                      Ningún tema coincide.
                    </li>
                  )}

                  {results.map((tema, index) => (
                    <li key={tema.id} role="option" aria-selected={tema.id === value}>
                      <button
                        type="button"
                        onMouseEnter={() => setHighlight(index)}
                        onClick={() => select(tema)}
                        className={cn(
                          "flex w-full min-w-0 flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors duration-150",
                          index === highlight ? "bg-onyx-surfaceHover" : "bg-transparent",
                        )}
                      >
                        <span className="w-full truncate text-[14px] text-onyx-ink">
                          {tema.name}
                        </span>
                        <span className="w-full truncate text-[12px] text-onyx-inkFaint">
                          {asignaturas.get(tema.asignatura_id) ?? "Asignatura"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                {selected && (
                  <button
                    type="button"
                    onClick={() => select(null)}
                    className="w-full border-t border-onyx-line px-3 py-2 text-left text-[13px] text-onyx-inkMuted transition-colors duration-150 hover:bg-onyx-surfaceHover hover:text-onyx-ink"
                  >
                    Dejar sin tema
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Field>
  );
}

export default TemaPicker;
