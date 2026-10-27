import { useId, useMemo, useState, type FormEvent } from "react";
import {
  generateExerciseStudyExercisePost,
  type FileRead,
  type GenerateExerciseResponse,
  type TemaRead,
} from "../../api/generated";
import {
  Button,
  Field,
  Modal,
  Spinner,
  Textarea,
  useToast,
} from "../../components";
import { PdfModePicker, type PdfMode } from "../../components/PdfModePicker";
import { RichText } from "../../components/RichText";
import { apiErrorMessage } from "../../lib/api";
import { FILE_DOC_KIND_LABELS, type FileDocKind } from "../files/fileUtils";
import { TopicSectionCard } from "./TopicSectionCard";

/** Tipos de documento que sirven de inspiración para un ejercicio. */
const SOURCE_KINDS: FileDocKind[] = ["ejercicio", "examen"];

export interface TopicExerciseSectionProps {
  topic: TemaRead;
  /** Biblioteca completa: aquí se filtran los archivos del tema. */
  files: FileRead[];
}

/**
 * Generación de un ejercicio a partir de los exámenes y ejercicios vinculados
 * al tema. El ejercicio no se guarda: se muestra con la solución oculta hasta
 * que el usuario la pide.
 */
export function TopicExerciseSection({ topic, files }: TopicExerciseSectionProps) {
  const { toast } = useToast();
  const formId = useId();

  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [pdfMode, setPdfMode] = useState<PdfMode>("text");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateExerciseResponse | null>(null);
  const [solutionOpen, setSolutionOpen] = useState(false);

  const sourceFiles = useMemo(() => {
    const ids = new Set(topic.file_ids ?? []);
    return files.filter(
      (file) => ids.has(file.id) && SOURCE_KINDS.includes(file.kind as FileDocKind),
    );
  }, [files, topic.file_ids]);

  const canSubmit = !generating && sourceFiles.length > 0;

  const openModal = () => {
    setInstructions("");
    setPdfMode("text");
    setError(null);
    setOpen(true);
  };

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!canSubmit) return;

    setGenerating(true);
    setError(null);
    try {
      const { data } = await generateExerciseStudyExercisePost({
        body: {
          tema_id: topic.id,
          instructions: instructions.trim() || null,
          file_mode: pdfMode,
        },
        throwOnError: true,
      });

      setResult(data);
      setSolutionOpen(false);
      setOpen(false);
      toast("Ejercicio generado.", "success");
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <TopicSectionCard
      title="Ejercicio"
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

        {result && (
          <article className="min-w-0 rounded-xl border border-onyx-line bg-onyx-bg/40 p-4">
            <p className="text-[11px] uppercase tracking-wide text-onyx-inkFaint">
              Ejercicio
            </p>
            <RichText
              text={result.exercise}
              className="mt-2 block text-[15px] leading-relaxed text-onyx-ink"
            />

            <div className="mt-4 border-t border-onyx-line pt-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSolutionOpen((current) => !current)}
                aria-expanded={solutionOpen}
              >
                {solutionOpen ? "Ocultar solución" : "Ver solución"}
              </Button>

              {solutionOpen && (
                <div className="mt-3">
                  <p className="text-[11px] uppercase tracking-wide text-onyx-inkFaint">
                    Solución
                  </p>
                  <RichText
                    text={result.solution}
                    className="mt-2 block text-[15px] leading-relaxed text-onyx-ink"
                  />
                </div>
              )}
            </div>
          </article>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => {
          if (!generating) setOpen(false);
        }}
        title="Generar ejercicio"
        description={`A partir de los exámenes y ejercicios de ${topic.name}.`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={generating}
            >
              Cancelar
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
              Escribiendo el ejercicio y su solución. Puede tardar un poco.
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
