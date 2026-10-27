import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import {
  createFlashcardSetFromFilesFlashcardSetFromFilesPost,
  listFilesFilesGet,
} from "../../api/generated/sdk.gen";
import type { FileRead } from "../../api/generated/types.gen";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../components/ui/Toast";
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

export interface GenerateSetModalProps {
  open: boolean;
  onClose: () => void;
  /** Se llama con el id del set recien generado. */
  onCreated: (setId: number) => void;
}

/**
 * Generacion de un set a partir de documentos. La peticion puede tardar: el
 * modal queda bloqueado con un spinner hasta que responde.
 */
export function GenerateSetModal({ open, onClose, onCreated }: GenerateSetModalProps) {
  const { toast } = useToast();
  const formId = useId();
  const searchId = useId();

  const [name, setName] = useState("");
  const [files, setFiles] = useState<FileRead[] | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [mode, setMode] = useState<AmountMode>("medio");
  const [exact, setExact] = useState("15");
  const [pdfMode, setPdfMode] = useState<PdfMode>("text");
  const [generating, setGenerating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Cada apertura parte de cero y recarga la lista de archivos.
  useEffect(() => {
    if (!open) return;

    setName("");
    setQuery("");
    setSelected([]);
    setMode("medio");
    setExact("15");
    setPdfMode("text");
    setFormError(null);
    setFiles(null);
    setFilesError(null);

    let active = true;
    listFilesFilesGet({ query: { limit: 200 }, throwOnError: true })
      .then(({ data }) => {
        if (active) setFiles(data ?? []);
      })
      .catch((error: unknown) => {
        if (active) setFilesError(apiErrorMessage(error));
      });

    return () => {
      active = false;
    };
  }, [open]);

  const visibleFiles = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!files) return [];
    if (!term) return files;
    return files.filter((file) => file.name.toLowerCase().includes(term));
  }, [files, query]);

  const toggleFile = (fileId: number) => {
    setSelected((current) =>
      current.includes(fileId)
        ? current.filter((id) => id !== fileId)
        : [...current, fileId],
    );
  };

  const amount = mode === "exact" ? clampAmount(exact) : mode;

  const canSubmit =
    !generating && name.trim().length > 0 && selected.length > 0;

  const submit = async () => {
    if (!canSubmit) return;

    setGenerating(true);
    setFormError(null);
    try {
      const { data } = await createFlashcardSetFromFilesFlashcardSetFromFilesPost({
        body: {
          name: name.trim(),
          file_ids: selected,
          amount,
          file_mode: pdfMode,
        },
        throwOnError: true,
      });

      const created = data.created.length;
      const base =
        created === 1
          ? "Set generado con 1 tarjeta."
          : `Set generado con ${created} tarjetas.`;
      toast(
        data.discarded > 0
          ? `${base} ${data.discarded} descartada${data.discarded === 1 ? "" : "s"} por pasar de 2000 caracteres.`
          : base,
        data.discarded > 0 ? "info" : "success",
      );
      onCreated(data.set.id);
    } catch (error) {
      setFormError(apiErrorMessage(error));
    } finally {
      setGenerating(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit();
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!generating) onClose();
      }}
      title="Generar set desde documentos"
      description="La IA lee los archivos elegidos y escribe las tarjetas."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={generating}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={!canSubmit}>
            {generating && <Spinner size="sm" label="Generando" />}
            {generating ? "Generando…" : "Generar set"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex min-w-0 flex-col gap-4">
        <Field label="Nombre del set">
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
          <label htmlFor={searchId} className="text-[13px] font-medium text-onyx-inkMuted">
            Documentos
          </label>
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Enter en el buscador no debe lanzar la generacion.
              if (event.key === "Enter") event.preventDefault();
            }}
            placeholder="Buscar por nombre"
            autoComplete="off"
            disabled={generating}
          />
          <p className="text-[12px] text-onyx-inkFaint" aria-live="polite">
            {selected.length === 0
              ? "Ningún archivo seleccionado"
              : `${selected.length} ${selected.length === 1 ? "archivo seleccionado" : "archivos seleccionados"}`}
          </p>
        </div>

        <div className="min-w-0 overflow-y-auto rounded-lg border border-onyx-line" style={{ maxHeight: 224 }}>
          {filesError && (
            <p role="alert" className="px-3 py-3 text-[13px] text-[#f0a8a1]">
              {filesError}
            </p>
          )}

          {!filesError && files === null && (
            <p className="flex items-center gap-2 px-3 py-3 text-[13px] text-onyx-inkMuted">
              <Spinner size="sm" label="Cargando archivos" />
              Cargando archivos…
            </p>
          )}

          {!filesError && files !== null && visibleFiles.length === 0 && (
            <p className="px-3 py-3 text-[13px] text-onyx-inkMuted">
              {files.length === 0
                ? "Todavía no hay archivos. Sube uno en Archivos."
                : "Ningún archivo coincide con la búsqueda."}
            </p>
          )}

          {visibleFiles.length > 0 && (
            <ul>
              {visibleFiles.map((file) => {
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
          <p
            role="status"
            className="flex items-center gap-2 rounded-lg border border-onyx-line px-3 py-2 text-[13px] text-onyx-inkMuted"
          >
            <Spinner size="sm" label="Generando tarjetas" />
            Generando las tarjetas. Puede tardar un poco.
          </p>
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

export default GenerateSetModal;
