import type { FileRead, TemaRead } from "../../api/generated";

/**
 * Calculos de progreso y tiempo restante de una asignatura.
 *
 * Reglas:
 * - Los PDFs de temario (todo menos `ejercicio`) cuentan 1 minuto por pagina.
 *   El avance sale del puntero `student_progress` del tema.
 * - Los PDFs de tipo ejercicio tienen su propia barra por archivo (una hoja
 *   cada uno) y cuentan media hora por hoja. Su avance sale de
 *   `file.student_progress`.
 * - El progreso general pesa por tiempo: minutos hechos / minutos totales.
 */

export const MINUTES_PER_TEMARIO_PAGE = 1;
export const MINUTES_PER_EXERCISE_SHEET = 30;

export interface ProgressStats {
  /** Minutos estimados de trabajo (temario + ejercicios). */
  totalMinutes: number;
  /** Minutos que quedan segun el avance guardado. */
  remainingMinutes: number;
  /** 0-100, redondeado a un decimal. */
  percent: number;
  temarioPages: number;
  temarioPagesDone: number;
  temarioRemainingMinutes: number;
  exerciseSheets: number;
  /** Hojas equivalentes completadas; puede ser fraccionario. */
  exerciseSheetsDone: number;
  exerciseRemainingMinutes: number;
}

export const EMPTY_PROGRESS: ProgressStats = {
  totalMinutes: 0,
  remainingMinutes: 0,
  percent: 0,
  temarioPages: 0,
  temarioPagesDone: 0,
  temarioRemainingMinutes: 0,
  exerciseSheets: 0,
  exerciseSheetsDone: 0,
  exerciseRemainingMinutes: 0,
};

/** PDF que forma parte del timeline lectivo del tema (no es un ejercicio). */
export function isTemarioPdf(file: FileRead): boolean {
  return (
    file.type === "application/pdf" &&
    file.kind !== "ejercicio" &&
    (file.page_count ?? 0) > 0
  );
}

/** PDF de ejercicio: tiene barra de progreso propia e independiente. */
export function isExercisePdf(file: FileRead): boolean {
  return (
    file.type === "application/pdf" &&
    file.kind === "ejercicio" &&
    (file.page_count ?? 0) > 0
  );
}

export function pdfPages(file: FileRead): number {
  return Math.max(file.page_count ?? 0, 0);
}

/** Paginas avanzadas en una hoja de ejercicios, sin pasarse del total. */
export function exercisePagesDone(file: FileRead): number {
  return Math.min(Math.max(file.student_progress ?? 0, 0), pdfPages(file));
}

/** Minutos restantes de una hoja de ejercicios, proporcional a sus paginas. */
export function exerciseRemainingMinutes(file: FileRead): number {
  const pages = pdfPages(file);
  if (pages === 0) return 0;
  const done = exercisePagesDone(file);
  return MINUTES_PER_EXERCISE_SHEET * ((pages - done) / pages);
}

/** Archivos del tema, en el orden en que se pintan sus barras. */
export function topicFiles(
  topic: TemaRead,
  filesById: Map<number, FileRead>,
): FileRead[] {
  const ids = topic.file_ids ?? [];
  const rows: FileRead[] = [];
  for (const id of ids) {
    const file = filesById.get(id);
    if (file) rows.push(file);
  }
  return rows;
}

export function topicTemarioFiles(
  topic: TemaRead,
  filesById: Map<number, FileRead>,
): FileRead[] {
  return topicFiles(topic, filesById).filter(isTemarioPdf);
}

export function topicExerciseFiles(
  topic: TemaRead,
  filesById: Map<number, FileRead>,
): FileRead[] {
  return topicFiles(topic, filesById)
    .filter(isExercisePdf)
    .sort((a, b) =>
      a.name.localeCompare(b.name, "es", { numeric: true, sensitivity: "base" }),
    );
}

/** Progreso de un tema con sus archivos de temario y sus hojas de ejercicios. */
export function topicProgress(
  topic: TemaRead,
  filesById: Map<number, FileRead>,
): ProgressStats {
  const temarioPages = topicTemarioFiles(topic, filesById).reduce(
    (sum, file) => sum + pdfPages(file),
    0,
  );
  const temarioPagesDone = Math.min(
    Math.max(topic.student_progress ?? 0, 0),
    temarioPages,
  );

  const exercises = topicExerciseFiles(topic, filesById);
  const exerciseSheets = exercises.length;
  let exerciseMinutes = 0;
  let exerciseMinutesDone = 0;
  for (const file of exercises) {
    exerciseMinutes += MINUTES_PER_EXERCISE_SHEET;
    exerciseMinutesDone +=
      MINUTES_PER_EXERCISE_SHEET - exerciseRemainingMinutes(file);
  }

  const totalMinutes =
    temarioPages * MINUTES_PER_TEMARIO_PAGE + exerciseMinutes;
  const remainingMinutes =
    (temarioPages - temarioPagesDone) * MINUTES_PER_TEMARIO_PAGE +
    (exerciseMinutes - exerciseMinutesDone);

  return {
    totalMinutes,
    remainingMinutes,
    percent: percentOf(totalMinutes, remainingMinutes),
    temarioPages,
    temarioPagesDone,
    temarioRemainingMinutes:
      (temarioPages - temarioPagesDone) * MINUTES_PER_TEMARIO_PAGE,
    exerciseSheets,
    exerciseSheetsDone:
      exerciseSheets === 0
        ? 0
        : exerciseMinutesDone / MINUTES_PER_EXERCISE_SHEET,
    exerciseRemainingMinutes: exerciseMinutes - exerciseMinutesDone,
  };
}

/** Suma el progreso de todos los temas de una asignatura. */
export function subjectProgress(
  topics: TemaRead[],
  filesById: Map<number, FileRead>,
): ProgressStats {
  let total = 0;
  let remaining = 0;
  let temarioPages = 0;
  let temarioPagesDone = 0;
  let exerciseSheets = 0;
  let exerciseSheetsDone = 0;

  for (const topic of topics) {
    const stats = topicProgress(topic, filesById);
    total += stats.totalMinutes;
    remaining += stats.remainingMinutes;
    temarioPages += stats.temarioPages;
    temarioPagesDone += stats.temarioPagesDone;
    exerciseSheets += stats.exerciseSheets;
    exerciseSheetsDone += stats.exerciseSheetsDone;
  }

  return {
    totalMinutes: total,
    remainingMinutes: remaining,
    percent: percentOf(total, remaining),
    temarioPages,
    temarioPagesDone,
    temarioRemainingMinutes:
      (temarioPages - temarioPagesDone) * MINUTES_PER_TEMARIO_PAGE,
    exerciseSheets,
    exerciseSheetsDone,
    exerciseRemainingMinutes:
      (exerciseSheets - exerciseSheetsDone) * MINUTES_PER_EXERCISE_SHEET,
  };
}

function percentOf(totalMinutes: number, remainingMinutes: number): number {
  if (totalMinutes <= 0) return 0;
  const done = Math.min(Math.max(totalMinutes - remainingMinutes, 0), totalMinutes);
  return Math.round((done / totalMinutes) * 1000) / 10;
}
