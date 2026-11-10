import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  updateFileProgressFilesFileIdProgressPut,
  type FileRead,
} from "../../api/generated";
import { useToast } from "../../components";
import { apiErrorMessage } from "../../lib/api";
import { formatMinutes } from "../../lib/format";
import {
  exercisePagesDone,
  MINUTES_PER_EXERCISE_SHEET,
  pdfPages,
} from "./subjectProgress";

export interface ExerciseProgressRowProps {
  file: FileRead;
  onSaved: (file: FileRead) => void;
}

/**
 * Barra de progreso independiente de una hoja de ejercicios.
 *
 * El slider va de 0 al numero de paginas del PDF y se guarda solo, medio
 * segundo despues del ultimo cambio (o al levantar el dedo/tecla). No toca el
 * progreso del tema: los ejercicios tienen su propio puntero.
 */
export function ExerciseProgressRow({ file, onSaved }: ExerciseProgressRowProps) {
  const { toast } = useToast();
  const pages = pdfPages(file);
  const [value, setValue] = useState(() => exercisePagesDone(file));
  const [saving, setSaving] = useState(false);
  const timer = useRef<number | null>(null);
  const latest = useRef(value);
  const requestId = useRef(0);

  useEffect(() => {
    setValue(exercisePagesDone(file));
    latest.current = exercisePagesDone(file);
  }, [file.id, file.student_progress]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const remaining =
    pages === 0 ? 0 : MINUTES_PER_EXERCISE_SHEET * ((pages - value) / pages);
  const percent = pages === 0 ? 0 : Math.round((value / pages) * 1000) / 10;

  function schedule(next: number) {
    setValue(next);
    latest.current = next;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(next), 500);
  }

  function flush() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (latest.current !== exercisePagesDone(file)) void save(latest.current);
  }

  async function save(next: number) {
    const currentRequest = ++requestId.current;
    setSaving(true);
    const { data, error } = await updateFileProgressFilesFileIdProgressPut({
      path: { file_id: file.id },
      body: { student_progress: next },
    });
    if (currentRequest !== requestId.current) return;
    setSaving(false);

    if (error || !data) {
      toast(apiErrorMessage(error), "error");
      setValue(exercisePagesDone(file));
      latest.current = exercisePagesDone(file);
      return;
    }

    onSaved(data);
  }

  return (
    <div className="min-w-0 rounded-lg border border-onyx-line/70 bg-onyx-bg/40 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <Link
          to={`/archivos/${file.id}`}
          className="focus-ring min-w-0 truncate rounded text-[13px] text-onyx-ink transition-colors duration-150 hover:text-white"
        >
          {file.name}
        </Link>
        <span className="shrink-0 text-[12px] tabular-nums text-onyx-inkMuted">
          {saving ? "Guardando…" : `${value}/${pages} págs`}
        </span>
      </div>

      <label className="mt-1.5 flex flex-col gap-1">
        <input
          type="range"
          min={0}
          max={pages}
          step={1}
          value={value}
          onChange={(event) => schedule(Number(event.target.value))}
          onPointerUp={flush}
          onTouchEnd={flush}
          onKeyUp={flush}
          aria-label={`Páginas avanzadas de ${file.name}`}
          className="accent-sky-300"
        />
        <span className="flex justify-between text-[11px] text-onyx-inkFaint">
          <span>{percent}%</span>
          <span>Quedan ≈ {formatMinutes(remaining)}</span>
        </span>
      </label>
    </div>
  );
}
