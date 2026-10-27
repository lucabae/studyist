import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  generateExerciseStudyExercisePost,
  type EjercicioRead,
  type EjercicioSummary,
  type FileRead,
  type TemaRead,
} from "../../api/generated";
import {
  Button,
  Chip,
  Field,
  Modal,
  Spinner,
  Textarea,
  useToast,
} from "../../components";
import { PdfModePicker, type PdfMode } from "../../components/PdfModePicker";
import { apiErrorMessage } from "../../lib/api";
import { formatRelative } from "../../lib/format";
import { FILE_DOC_KIND_LABELS, type FileDocKind } from "../files/fileUtils";
import { TopicSectionCard } from "./TopicSectionCard";

/** Tipos de documento que sirven de inspiración para un ejercicio. */
const SOURCE_KINDS: FileDocKind[] = ["ejercicio", "examen"];

type ExerciseKind = "texto" | "programacion";

const KIND_OPTIONS: { value: ExerciseKind; label: string; hint: string }[] = [
  {
    value: "texto",
    label: "Texto",
    hint: "Enunciado y solución escritos. Se lee y se compara con la respuesta.",
  },
  {
    value: "programacion",
    label: "Programación",
    hint: "Algoritmo en Python y 5 test cases que se ejecutan al corregir.",
  },
];

/** Mensaje segun el tiempo transcurrido (la peticion es una sola). */
function stageLabel(seconds: number): string {
  if (seconds < 3) return "Preparando los documentos…";
  if (seconds < 20) return "Leyendo los exámenes y ejercicios…";
  return "Escribiendo el ejercicio. Suele tardar entre uno y dos minutos.";
}

export interface TopicExerciseSectionProps {
  topic: TemaRead;
  /** Biblioteca completa: aquí se filtran los archivos del tema. */
  files: FileRead[];
  /** Ejercicios ya guardados de este tema. */
  exercises: EjercicioSummary[];
  /** Se llama con el ejercicio recién generado y guardado. */
  onCreated: (exercise: EjercicioRead) => void;
}

/**
 * Generación y listado de ejercicios del tema. Los ejercicios se guardan en la
 * BBDD: aquí solo se listan y se abren en /ejercicios/{id}.
 */
export function TopicExerciseSection({
  topic,
  files,
  exercises,
  onCreated,
}: TopicExerciseSectionProps) {
  const { toast } = useToast();
  const formId = useId();

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ExerciseKind>("texto");
  const [instructions, setInstructions] = useState("");
  const [pdfMode, setPdfMode] = useState<PdfMode>("text");
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reloj visible mientras el modelo escribe: estas generaciones tardan uno o
  // dos minutos y sin contador parece que se ha colgado.
  useEffect(() => {
    if (!generating) return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [generating]);

  const sourceFiles = useMemo(() => {
    const ids = new Set(topic.file_ids ?? []);
    return files.filter(
      (file) => ids.has(file.id) && SOURCE_KINDS.includes(file.kind as FileDocKind),
    );
  }, [files, topic.file_ids]);

  const activeKind = KIND_OPTIONS.find((option) => option.value === kind) ?? KIND_OPTIONS[0];
  const canSubmit = !generating && sourceFiles.length > 0;

  const openModal = () => {
    setKind("texto");
    setInstructions("");
    setPdfMode("text");
    setError(null);
    setOpen(true);
  };

  /** Cierra el modal. Si el modelo esta escribiendo, corta la peticion. */
  const closeModal = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setGenerating(false);
    setOpen(false);
  };

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!canSubmit) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setGenerating(true);
    setError(null);
    try {
      const { data } = await generateExerciseStudyExercisePost({
        body: {
          tema_id: topic.id,
          kind,
          instructions: instructions.trim() || null,
          file_mode: pdfMode,
        },
        signal: controller.signal,
        throwOnError: true,
      });

      onCreated(data.exercise);
      setOpen(false);
      toast("Ejercicio generado y guardado.", "success");
    } catch (cause) {
      const name = (cause as { name?: string } | null)?.name;
      if (name === "AbortError") {
        toast("Generación cancelada.", "info");
        return;
      }
      setError(apiErrorMessage(cause));
    } finally {
      abortRef.current = null;
      setGenerating(false);
    }
  };

  return (
    <TopicSectionCard
      title="Ejercicios"
      count={exercises.length}
      action={
        <Button
          size="sm"
          onClick={openModal}
          disabled={sourceFiles.length === 0}
          title={
            sourceFiles.length === 0
              ? "Clasifica algún archivo como Ejercicio o Examen y vincúlalo al tema"
              : undefined
          }
        >
          Generar ejercicio
        </Button>
      }
    >
      <div className="flex min-w-0 flex-col gap-3">
        {sourceFiles.length === 0 ? (
          <p className="px-1 text-[13px] leading-relaxed text-onyx-inkFaint">
            Este tema no tiene archivos de tipo Ejercicio o Examen. Clasifícalos
            en Archivos y vincúlalos al tema para poder generar un ejercicio.
          </p>
        ) : (
          <p className="px-1 text-[12px] leading-relaxed text-onyx-inkFaint">
            Se inspira en {sourceFiles.length === 1 ? "1 archivo" : `${sourceFiles.length} archivos`}:{" "}
            {sourceFiles
              .map(
                (file) =>
                  `${file.name} (${FILE_DOC_KIND_LABELS[file.kind as FileDocKind].toLowerCase()})`,
              )
              .join(", ")}
            .
          </p>
        )}

        {exercises.length === 0 ? (
          <p className="px-1 py-2 text-[13px] text-onyx-inkFaint">
            Todavía no hay ejercicios guardados de este tema.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {exercises.map((exercise) => (
              <li key={exercise.id} className="min-w-0">
                <Link
                  to={`/ejercicios/${exercise.id}`}
                  className="focus-ring flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-onyx-surfaceHover"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] text-onyx-ink">
                      {exercise.statement}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-onyx-inkFaint">
                      <span className="rounded-full border border-onyx-line px-2 py-0.5">
                        {exercise.kind === "programacion" ? "Programación" : "Texto"}
                      </span>
                      {exercise.kind === "programacion" && (
                        <span>
                          {exercise.test_case_count}{" "}
                          {exercise.test_case_count === 1 ? "test case" : "test cases"}
                        </span>
                      )}
                      <time dateTime={exercise.created_at}>
                        {formatRelative(exercise.created_at)}
                      </time>
                    </span>
                  </span>
                  <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-onyx-inkFaint" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                    <path d="M7.5 5 12.5 10l-5 5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={open}
        onClose={closeModal}
        title="Generar ejercicio"
        description={`A partir de los exámenes y ejercicios de ${topic.name}. Se guarda en el tema.`}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>
              {generating ? "Cancelar" : "Cerrar"}
            </Button>
            <Button type="submit" form={formId} disabled={!canSubmit}>
              {generating && <Spinner size="sm" label="Generando" />}
              {generating ? "Generando…" : "Generar"}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={submit}
          className="flex min-w-0 flex-col gap-4"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-onyx-inkMuted">Documentos</p>
            <ul className="mt-1.5 rounded-lg border border-onyx-line">
              {sourceFiles.map((file) => (
                <li
                  key={file.id}
                  className="min-w-0 border-b border-onyx-line px-3 py-2 last:border-b-0"
                >
                  <span className="block truncate text-[13px] text-onyx-ink">
                    {file.name}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-onyx-inkFaint">
                    {FILE_DOC_KIND_LABELS[file.kind as FileDocKind]}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-[13px] font-medium text-onyx-inkMuted">Tipo</p>
            <div className="flex flex-wrap gap-2">
              {KIND_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  active={kind === option.value}
                  onClick={() => setKind(option.value)}
                  disabled={generating}
                >
                  {option.label}
                </Chip>
              ))}
            </div>
            <p className="text-[12px] leading-relaxed text-onyx-inkFaint">
              {activeKind.hint}
            </p>
          </div>

          <Field
            label="Comentario para la IA"
            hint="Opcional. Por ejemplo: «que salga un problema de optimización» o «con dos apartados»."
          >
            {({ id, "aria-describedby": describedBy }) => (
              <Textarea
                id={id}
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                aria-describedby={describedBy}
                maxLength={2000}
                rows={3}
                disabled={generating}
                placeholder="¿Cómo quieres el ejercicio?"
              />
            )}
          </Field>

          <PdfModePicker
            value={pdfMode}
            onChange={setPdfMode}
            disabled={generating}
          />

          {generating && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-lg border border-onyx-line px-3 py-2 text-[13px] text-onyx-inkMuted"
            >
              <Spinner size="sm" label="Generando el ejercicio" />
              <span className="min-w-0">
                {stageLabel(elapsed)}{" "}
                <span className="tabular-nums text-onyx-inkFaint">({elapsed} s)</span>
              </span>
            </p>
          )}

          {error && (
            <p role="alert" className="text-[13px] leading-relaxed text-[#f0a8a1]">
              {error}
            </p>
          )}
        </form>
      </Modal>
    </TopicSectionCard>
  );
}

export default TopicExerciseSection;
