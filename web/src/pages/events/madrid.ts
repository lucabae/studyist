/**
 * Fechas de la pagina de Eventos en hora de Madrid, sin dependencias.
 *
 * El backend guarda y devuelve la fecha normalizada a Europe/Madrid. Aqui se
 * construye el rango del mes visible y se convierte el valor del
 * `<input type="datetime-local">` (hora de pared de Madrid) a ISO con el offset
 * real de la zona: `-01:00` en invierno y `-02:00` en horario de verano.
 */

const TIME_ZONE = "Europe/Madrid";
const LOCALE = "es-ES";

const pad = (value: number) => String(value).padStart(2, "0");

/** Offset de Madrid en minutos (+60 o +120) para un instante concreto. */
function madridOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? "0");

  // Lo que marca el reloj de Madrid, leido como si fuera UTC.
  const wallClock = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );

  return Math.round((wallClock - instant.getTime()) / 60_000);
}

function offsetSuffix(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

/**
 * ISO con offset de Madrid para una hora de pared (mes 0-11).
 *
 * Se calcula el offset dos veces: la primera con el instante "ingenuo" como si
 * la hora de pared fuera UTC y la segunda con el instante ya corregido. Asi el
 * offset es el que toca tambien el dia del cambio de hora.
 */
export function madridIso(
  year: number,
  monthIndex: number,
  day: number,
  hours: number,
  minutes: number,
  seconds: number,
): string {
  const wallClock = Date.UTC(year, monthIndex, day, hours, minutes, seconds);
  const firstOffset = madridOffsetMinutes(new Date(wallClock));
  const offset = madridOffsetMinutes(new Date(wallClock - firstOffset * 60_000));

  return (
    `${year}-${pad(monthIndex + 1)}-${pad(day)}` +
    `T${pad(hours)}:${pad(minutes)}:${pad(seconds)}${offsetSuffix(offset)}`
  );
}

export interface MonthRange {
  /** Primer dia del mes a las 00:00:00, hora de Madrid. */
  from: string;
  /** Ultimo dia del mes a las 23:59:59, hora de Madrid. */
  to: string;
}

/** Rango [from, to] del mes visible, listo para `GET /evento`. */
export function monthRange(month: Date): MonthRange {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();

  return {
    from: madridIso(year, monthIndex, 1, 0, 0, 0),
    to: madridIso(year, monthIndex, lastDay, 23, 59, 59),
  };
}

/** Primer dia del mes a medianoche local, que es lo que espera `Calendar`. */
export function firstOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** "2026-10-27T09:00" (datetime-local) -> ISO con offset de Madrid. */
export function datetimeLocalToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day, hours, minutes] = match;
  const iso = madridIso(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    0,
  );

  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/** Valor inicial del formulario: hoy a las 09:00 o el dia 1 del mes visible. */
export function defaultDatetimeLocal(month: Date): string {
  const today = new Date();
  const day = isSameMonth(today, month) ? today.getDate() : 1;
  return `${month.getFullYear()}-${pad(month.getMonth() + 1)}-${pad(day)}T09:00`;
}

/** Clave de dia (`YYYY-MM-DD`) de la fecha que devuelve el backend. */
export function eventDayKey(fecha: string): string {
  return fecha.slice(0, 10);
}

/** Mes del evento como primer dia, para saltar al mes al crearlo. */
export function monthOfIso(fecha: string): Date | null {
  const match = /^(\d{4})-(\d{2})/.exec(fecha);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

/** Hora de pared de Madrid ("09:00"); `null` si la fecha no trae hora. */
export function eventTime(fecha: string): string | null {
  const match = /T(\d{2}:\d{2})/.exec(fecha);
  return match ? match[1] : null;
}

/** "2026-10-27T09:00:00+01:00" -> "2026-10-27T09:00" (para el input). */
export function toDatetimeLocalValue(fecha: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(fecha);
  return match ? `${match[1]}T${match[2]}` : "";
}

const dayFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const monthFormatter = new Intl.DateTimeFormat(LOCALE, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "martes, 27 de octubre" a partir de la clave `YYYY-MM-DD`. */
export function formatDayLabel(dayKey: string): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? dayKey : dayFormatter.format(date);
}

/** "octubre de 2026" para el vacio del mes. */
export function formatMonthLabel(month: Date): string {
  return monthFormatter.format(new Date(Date.UTC(month.getFullYear(), month.getMonth(), 1)));
}
