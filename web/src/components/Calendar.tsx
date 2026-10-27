import { useMemo } from "react";
import { cn } from "../lib/cn";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";

export interface CalendarEvent {
  id: number;
  name: string;
  /** ISO del backend, ya normalizado a Madrid ("2026-10-27T09:00" o con zona). */
  fecha: string;
  type: "Examen" | "Tarea";
  asignatura?: string;
}

export interface CalendarProps {
  month: Date;
  events: CalendarEvent[];
  onMonthChange: (month: Date) => void;
  onEventClick: (id: number) => void;
}

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const WEEKDAYS_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const pad = (value: number) => String(value).padStart(2, "0");

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  // Lunes primero: getDay() devuelve 0 para domingo.
  const offset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - offset);

  return Array.from(
    { length: 42 },
    (_, index) =>
      new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index),
  );
}

/** Calendario mensual propio: 7 columnas, lunes primero, sin dependencias. */
export function Calendar({ month, events, onMonthChange, onEventClick }: CalendarProps) {
  const grid = useMemo(() => buildGrid(month), [month]);
  const monthNumber = month.getMonth();
  const today = new Date();
  const todayKey = dayKey(today);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      // El backend entrega la fecha en hora de Madrid; el dia es el prefijo.
      const key = event.fecha.slice(0, 10);
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.fecha.localeCompare(b.fecha));
    }
    return map;
  }, [events]);

  return (
    <section aria-label="Calendario mensual" className="min-w-0">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 aria-live="polite" className="text-[15px] font-medium capitalize text-onyx-ink">
          {MONTHS[monthNumber]} de {month.getFullYear()}
        </h2>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onMonthChange(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Hoy
          </Button>
          <IconButton
            aria-label="Mes anterior"
            onClick={() => onMonthChange(new Date(month.getFullYear(), monthNumber - 1, 1))}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M12.5 5 7.5 10l5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
          <IconButton
            aria-label="Mes siguiente"
            onClick={() => onMonthChange(new Date(month.getFullYear(), monthNumber + 1, 1))}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M7.5 5 12.5 10l-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
        </div>
      </header>

      <div className="overflow-hidden rounded-xl border-l border-t border-onyx-line">
        <div className="grid grid-cols-7">
          {WEEKDAYS.map((full, index) => (
            <div
              key={full}
              className="border-b border-r border-onyx-line bg-onyx-bg/40 py-1.5 text-center text-[11px] text-onyx-inkFaint"
            >
              <span className="sm:hidden" aria-hidden>
                {WEEKDAYS_SHORT[index].charAt(0)}
              </span>
              <abbr title={full} className="hidden no-underline sm:inline">
                {WEEKDAYS_SHORT[index]}
              </abbr>
            </div>
          ))}

          {grid.map((day) => {
            const key = dayKey(day);
            const isCurrentMonth = day.getMonth() === monthNumber;
            const isToday = key === todayKey;
            const dayEvents = isCurrentMonth ? (eventsByDay.get(key) ?? []) : [];
            const visible = dayEvents.slice(0, 2);
            const overflow = dayEvents.length - visible.length;

            return (
              <div
                key={key}
                className={cn(
                  "min-h-[52px] min-w-0 border-b border-r border-onyx-line p-1 sm:min-h-[92px] sm:p-1.5",
                  !isCurrentMonth && "bg-onyx-bg/40",
                  isToday && "bg-onyx-surface",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    aria-current={isToday ? "date" : undefined}
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-[12px]",
                      isToday
                        ? "bg-white font-semibold text-black"
                        : isCurrentMonth
                          ? "text-onyx-inkMuted"
                          : "text-onyx-inkFaint/50",
                    )}
                  >
                    {day.getDate()}
                  </span>
                </div>

                {/* Escritorio: hasta 2 eventos y "+N". */}
                <div className="mt-1 hidden flex-col gap-0.5 sm:flex">
                  {visible.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onEventClick(event.id)}
                      title={`${event.name} · ${event.type}${event.asignatura ? ` · ${event.asignatura}` : ""}`}
                      className={cn(
                        "focus-ring flex w-full min-w-0 items-center rounded px-1 py-0.5 text-left text-[11px] leading-tight transition-colors duration-150",
                        event.type === "Examen"
                          ? "bg-white/15 font-medium text-onyx-ink hover:bg-white/25"
                          : "border border-onyx-line text-onyx-inkMuted hover:bg-onyx-surfaceHover hover:text-onyx-ink",
                      )}
                    >
                      <span className="truncate">{event.name}</span>
                    </button>
                  ))}
                  {overflow > 0 && (
                    <span className="px-1 text-[10px] text-onyx-inkFaint">+{overflow}</span>
                  )}
                </div>

                {/* Movil: solo puntos, con los nombres para lectores de pantalla. */}
                <div className="mt-1.5 flex flex-wrap items-center gap-0.5 sm:hidden">
                  {dayEvents.slice(0, 3).map((event) => (
                    <span key={event.id} className="h-1 w-1 rounded-full bg-onyx-inkMuted" aria-hidden />
                  ))}
                  {dayEvents.length > 0 && (
                    <span className="sr-only">
                      {dayEvents
                        .map((event) => `${event.name} (${event.type})`)
                        .join(", ")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
