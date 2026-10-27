/**
 * Formateo de fechas y tamanos en es-ES / Europe/Madrid.
 *
 * El backend devuelve ISO (con o sin zona). Aqui siempre se pinta en hora de
 * Madrid. Sin dependencias: Intl ya viene en el navegador.
 */

const TIME_ZONE = "Europe/Madrid";
const LOCALE = "es-ES";

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const shortDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
});

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 27/10/2026 */
export function formatDate(value: string | number | Date): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : "—";
}

/** 27/10/2026, 18:30 */
export function formatDateTime(value: string | number | Date): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : "—";
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** 1536 -> "1,5 KB". Base 1024, coma decimal espanola. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const digits = value < 10 ? 1 : 0;
  return `${value.toLocaleString(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })} ${BYTE_UNITS[unit]}`;
}

/** "hace 2 h", "ayer", "hace 3 días" o fecha corta a partir de una semana. */
export function formatRelative(value: string | number | Date): string {
  const date = toDate(value);
  if (!date) return "—";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 1) return "ahora";
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return "ayer";
  if (diffDays < 7) return `hace ${diffDays} días`;

  // Mas alla de una semana, fecha corta (dd/mm).
  return shortDateFormatter.format(date);
}
