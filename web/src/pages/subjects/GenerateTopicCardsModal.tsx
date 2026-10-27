import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import {
  createFlashcardSetFromFilesFlashcardSetFromFilesPost,
  updateTemaTemaTemaIdPut,
  type FileRead,
  type TemaRead,
} from "../../api/generated";
import {
  Button,
  Chip,
  Field,
  Input,
  Modal,
  ProgressBar,
  Textarea,
  useToast,
} from "../../components";
import { PdfModePicker, type PdfMode } from "../../components/PdfModePicker";
import { apiErrorMessage } from "../../lib/api";
import { formatBytes } from "../../lib/format";

/** Estimacion cualitativa o numero exacto (1..50), como espera el backend. */
type AmountMode = "pocas" | "medio" | "muchas" | "exact";

const AMOUNT_OPTIONS: { mode: AmountMode; label: string }[] = [
  { mode: "pocas", label: "Pocas (5)" },
  { mode: "medio", label: "Medio (15)" },
  { mode: "muchas", label: "Muchas (30)" },
];

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 50;

/** Texto del input -> entero dentro del rango; vacio o basura -> 15. */
function clampAmount(raw: string): number {
  const parsed = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(parsed)) return 15;
  return Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, Math.round(parsed)));
}

/** Etapa que se muestra segun el tiempo transcurrido (la peticion es una sola). */
function stageLabel(elapsedMs: number): string {
  if (elapsedMs < 1500) return "Preparando los documentos…";
  if (elapsedMs < 7000) return "Leyendo los documentos…";
  return "Escribiendo las tarjetas…";
}

export interface GenerateTopicCardsModalProps {
  open: boolean;
  onClose: () => void;
  topic: TemaRead;
  /** Biblioteca completa: aquí se filtran los archivos del tema. */
  files: FileRead[];
  /** Se llama al terminar, con el set ya vinculado al tema. */
  onCreated: (setId: number) => void;
}

/**
 * Generacion de flashcards desde la pagina de un tema.
 *
 * Solo deja elegir entre los archivos ya vinculados al tema. La peticion es
 * una sola llamada larga al modelo, así que el progreso es una estimacion
 * animada con etapas honestas; al responder salta al 100%.
 */
export function GenerateTopicCardsModal({
  open,
  onClose,
  topic,
  files,
  onCreated,
}: GenerateTopicCardsModalProps) {
  const { toast } = useToast();
  const formId = useId();

  const [name, setName] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [comment, setComment] = useState("");
  const [mode, setMode] = useState<AmountMode>("medio");
  const [exact, setExact] = useState("15");
  const [pdfMode, setPdfMode] = useState<PdfMode>("text");
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const relatedFiles = useMemo(() => {
    const ids = new Set(topic.file_ids ?? []);
    return files.filter((file) => ids.has(file.id));
  }, [files, topic.file_ids]);

  // Cada apertura parte de cero y preselecciona todo lo que hay.
  useEffect(() => {
    if (!open) return;
    setName(`${topic.name} — tarjetas`);
    setSelected(relatedFiles.map((file) => file.id));
    setComment("");
    setMode("medio");
    setExact("15");
    setPdfMode("text");
    setGenerating(false);
    setProgress(0);
    setStage("");
    setFormError(null);
    setNameError(null);
    // relatedFiles cambia de identidad con cada lista: basta al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, topic.id]);

  // Progreso estimado: avanza rapido al principio y se frena cerca del 92%,
  // para no prometer un 99% que no llega.
  useEffect(() => {
    if (!generating) return;

    const startedAt = Date.now();
    setProgress(4);
    setStage(stageLabel(0));

    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setStage(stageLabel(elapsed));
      setProgress((current) => {
        if (current >= 92) return 92;
        return current + (92 - current) * 0.08;
      });
    }, 350);

    return () => window.clearInterval(timer);
  }, [generating]);

  const toggleFile = (fileId: number) => {
    setSelected((current) =>
      current.includes(fileId)
        ? current.filter((id) => id !== fileId)
        : [...current, fileId],
    );
  };

  const amount = mode === "exact" ? clampAmount(exact) : mode;
  const canSubmit =
    !generating && name.trim().length > 0 && selected.length > 0 && relatedFiles.length > 0;

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!canSubmit) return;

    if (!name.trim()) {
      setNameError("Ponle un nombre al set.");
      return;
    }

    setNameError(null);
    setFormError(null);
    setGenerating(true);
    setProgress(4);
    setStage(stageLabel(0));

    try {
      const { data } = await createFlashcardSetFromFilesFlashcardSetFromFilesPost({
        body: {
          name: name.trim(),
          file_ids: selected,
          amount,
          instructions: comment.trim() || null,
          file_mode: pdfMode,
        },
        throwOnError: true,
      });

      setProgress(100);
      setStage(
        data.created.length === 1
          ? "Listo: 1 tarjeta creada."
          : `Listo: ${data.created.length} tarjetas creadas.`,
      );

      // El set recien generado se vincula al tema en el que estamos.
      const setIds = Array.from(new Set([...(topic.flashcard_set_ids ?? []), data.set.id]));
      const { error } = await updateTemaTemaTemaIdPut({
        path: { tema_id: topic.id },
        body: { flashcard_set_ids: setIds },
      });
      if (error) {
        toast(
          "El set se creó, pero no se pudo vincular al tema. Añádelo desde «Gestionar».",
          "error",
        );
      } else {
        const base =
          data.created.length === 1
            ? "Set creado con 1 tarjeta."
            : `Set creado con ${data.created.length} tarjetas.`;
        toast(
          data.discarded > 0
            ? `${base} ${data.discarded} descartada${data.discarded === 1 ? "" : "s"} por pasar de 2000 caracteres.`
            : base,
          data.discarded > 0 ? "info" : "success",
        );
      }

      // Se deja ver la barra llena un instante antes de cerrar: si no, el
      // salto al 100% no se llega a percibir.
      await new Promise((resolve) => window.setTimeout(resolve, 600));
      onCreated(data.set.id);
    } catch (cause) {
      setProgress(0);
      setStage("");
      setFormError(apiErrorMessage(cause));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!generating) onClose();
      }}
      title="Crear flashcards"
      description={`Se generan a partir de los archivos de ${topic.name}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={generating}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={!canSubmit}>
            {generating ? "Generando…" : "Generar tarjetas"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex min-w-0 flex-col gap-4">
        <Field label="Nombre del set" error={nameError}>
          {({ id, invalid, ...aria }) => (
            <Input
              id={id}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Tema 3 — Derivadas"
              maxLength={120}
              invalid={invalid}
              autoComplete="off"
              disabled={generating}
              {...aria}
            />
          )}
        </Field>

        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-[13px] font-medium text-onyx-inkMuted">
            Archivos del tema
            <span className="ml-2 font-normal text-onyx-inkFaint">
              {selected.length} de {relatedFiles.length}
            </span>
          </p>

          {relatedFiles.length === 0 ? (
            <p className="rounded-lg border border-onyx-line px-3 py-3 text-[13px] leading-relaxed text-onyx-inkMuted">
              Este tema aún no tiene archivos. Añádelos en la sección «Archivos» y
              vuelve aquí.
            </p>
          ) : (
            <ul className="max-h-56 overflow-y-auto rounded-lg border border-onyx-line">
              {relatedFiles.map((file) => {
                const checked = selected.includes(file.id);
                return (
                  <li key={file.id} className="border-b border-onyx-line last:border-b-0">
                    <label className="flex min-w-0 cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors duration-150 hover:bg-onyx-surfaceHover">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFile(file.id)}
                        disabled={generating}
                        className="focus-ring h-4 w-4 shrink-0 accent-white"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-onyx-ink">
                          {file.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-onyx-inkFaint">
                          {file.type.toUpperCase()} · {formatBytes(file.size)}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Field
          label="Comentario para la IA"
          hint="Opcional. Por ejemplo: «céntrate en los teoremas» o «nada de fórmulas»."
        >
          {({ id, "aria-describedby": describedBy }) => (
            <Textarea
              id={id}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              aria-describedby={describedBy}
              maxLength={2000}
              rows={3}
              disabled={generating}
              placeholder="¿Algo que deba tener en cuenta al escribir las tarjetas?"
            />
          )}
        </Field>

        <PdfModePicker
          value={pdfMode}
          onChange={setPdfMode}
          disabled={generating}
        />

        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[13px] font-medium text-onyx-inkMuted">Cuántas tarjetas</p>
          <div className="flex flex-wrap gap-2">
            {AMOUNT_OPTIONS.map((option) => (
              <Chip
                key={option.mode}
                active={mode === option.mode}
                onClick={() => setMode(option.mode)}
                disabled={generating}
              >
                {option.label}
              </Chip>
            ))}
          </div>

          <Field
            label="Cantidad exacta (1–50)"
            hint="Escribe un número para pedir una cantidad concreta."
          >
            {({ id, invalid, ...aria }) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
                value={exact}
                onChange={(event) => {
                  setExact(event.target.value);
                  setMode("exact");
                }}
                onBlur={() => setExact(String(clampAmount(exact)))}
                disabled={generating}
                invalid={invalid}
                className="max-w-[120px]"
                {...aria}
              />
            )}
          </Field>
        </div>

        {generating && (
          <ProgressBar
            value={progress}
            label={stage || "Generando las tarjetas…"}
            hint={`${Math.round(progress)}%`}
            className="pt-1"
          />
        )}

        {!generating && progress === 100 && (
          <ProgressBar value={100} label={stage} hint="100%" />
        )}

        {formError && (
          <p role="alert" className="text-[13px] leading-relaxed text-[#f0a8a1]">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  );
}

export default GenerateTopicCardsModal;
