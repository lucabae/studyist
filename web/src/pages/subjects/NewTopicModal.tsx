import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  createFileFilesPost,
  createTemaTemaPost,
  type TemaRead,
} from "../../api/generated";
import { Button, Field, FileDropZone, Input, Modal, Spinner } from "../../components";
import { apiErrorMessage } from "../../lib/api";
import { formatBytes } from "../../lib/format";
import { duplicateFileId } from "../files/fileUtils";
import { optionLabel, parentOptions } from "./topicTree";

export interface NewTopicModalProps {
  open: boolean;
  onClose: () => void;
  asignaturaId: number;
  asignaturaName: string;
  /** Temas que ya tiene la asignatura, para elegir el padre. */
  topics?: TemaRead[];
  /** Padre preseleccionado (por ejemplo, al crear un subtema desde un tema). */
  defaultParentId?: number | null;
  onCreated: (topic: TemaRead) => void;
}

/** Archivo del formulario: se sube al elegirlo y se enlaza al crear el tema. */
interface PendingFile {
  key: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  /** Id en la biblioteca; en un duplicado es el del archivo que ya existía. */
  fileId?: number;
  message?: string;
}

/** Alta de tema: nombre, padre y archivos, todo en un mismo formulario. */
export function NewTopicModal({
  open,
  onClose,
  asignaturaId,
  asignaturaName,
  topics = [],
  defaultParentId = null,
  onCreated,
}: NewTopicModalProps) {
  const formId = useId();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // La cola vive en refs: los archivos se suben de uno en uno mientras el
  // usuario sigue rellenando el formulario.
  const queue = useRef<{ key: string; file: File }[]>([]);
  const running = useRef(false);
  const counter = useRef(0);

  const options = useMemo(() => parentOptions(topics), [topics]);

  useEffect(() => {
    if (!open) return;
    setName("");
    setParentId(defaultParentId === null ? "" : String(defaultParentId));
    setFiles([]);
    setUploading(false);
    setNameError(null);
    setFormError(null);
    setSaving(false);
    queue.current = [];
    counter.current = 0;
  }, [open, defaultParentId]);

  const patch = useCallback((key: string, changes: Partial<PendingFile>) => {
    setFiles((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    );
  }, []);

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;

    try {
      while (queue.current.length > 0) {
        const entry = queue.current.shift();
        if (!entry) break;

        const { data, error, response } = await createFileFilesPost({
          body: { upload: entry.file },
        });

        if (!error && data) {
          patch(entry.key, { status: "done", fileId: data.id });
          continue;
        }

        // 409: el archivo ya estaba en la biblioteca. Se reutiliza su id en vez
        // de dejar la fila como error, porque el tema puede enlazarlo igual.
        const duplicateId =
          response?.status === 409 ? duplicateFileId(error) : null;

        patch(entry.key, {
          status: duplicateId === null ? "error" : "done",
          fileId: duplicateId ?? undefined,
          message: duplicateId !== null ? "Ya estaba en la biblioteca" : apiErrorMessage(error),
        });
      }
    } finally {
      running.current = false;
      setUploading(queue.current.length > 0);
    }
  }, [patch]);

  const enqueue = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;

      const entries = incoming.map((file) => {
        counter.current += 1;
        return { key: `archivo-${counter.current}`, file };
      });

      setFiles((current) => [
        ...current,
        ...entries.map((entry) => ({
          key: entry.key,
          name: entry.file.name,
          size: entry.file.size,
          status: "uploading" as const,
        })),
      ]);
      setUploading(true);
      queue.current.push(...entries);
      void drain();
    },
    [drain],
  );

  const removeFile = (key: string) => {
    setFiles((current) => current.filter((item) => item.key !== key));
  };

  const linkedFileIds = useMemo(() => {
    const ids = files
      .filter((item) => item.status === "done" && item.fileId !== undefined)
      .map((item) => item.fileId as number);
    return Array.from(new Set(ids));
  }, [files]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Ponle un nombre al tema.");
      return;
    }

    if (uploading) {
      setFormError("Espera a que terminen las subidas.");
      return;
    }

    setNameError(null);
    setFormError(null);
    setSaving(true);

    const { data, error } = await createTemaTemaPost({
      body: {
        asignatura_id: asignaturaId,
        name: trimmed,
        notes: "",
        parent_id: parentId ? Number(parentId) : null,
        file_ids: linkedFileIds,
      },
    });

    setSaving(false);

    if (error || !data) {
      setFormError(apiErrorMessage(error));
      return;
    }

    onCreated(data);
  }

  const errorFiles = files.filter((item) => item.status === "error");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo tema"
      description={`Se añadirá a ${asignaturaName}, con los archivos que elijas.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={saving || uploading}>
            {saving ? "Creando…" : "Crear tema"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nombre" error={nameError} hint="El orden de la asignatura es alfabético.">
          {({ id, invalid, "aria-describedby": describedBy }) => (
            <Input
              id={id}
              value={name}
              onChange={(event) => setName(event.target.value)}
              invalid={invalid}
              aria-describedby={describedBy}
              placeholder="Tema 4: Integrales"
              autoComplete="off"
              maxLength={160}
              disabled={saving}
            />
          )}
        </Field>

        <Field
          label="Tema padre"
          hint={
            options.length === 0
              ? "Todavía no hay otros temas; este será raíz."
              : "Opcional. Déjalo en «Sin padre» para un tema de primer nivel."
          }
        >
          {({ id, "aria-describedby": describedBy }) => (
            <select
              id={id}
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              aria-describedby={describedBy}
              disabled={saving}
              className="focus-ring h-10 w-full rounded-lg border border-onyx-line bg-onyx-surface px-3 text-[16px] text-onyx-ink outline-none"
            >
              <option value="">Sin padre (primer nivel)</option>
              {options.map((row) => (
                <option key={row.topic.id} value={row.topic.id}>
                  {optionLabel(row)}
                </option>
              ))}
            </select>
          )}
        </Field>

        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[13px] font-medium text-onyx-inkMuted">
            Archivos <span className="font-normal text-onyx-inkFaint">(opcional)</span>
          </p>

          {files.length === 0 ? (
            <FileDropZone
              onFiles={enqueue}
              disabled={saving}
              className="py-6"
              hint="Se suben ahora y quedan enlazados al tema al crearlo."
            />
          ) : (
            <>
              <ul className="flex flex-col gap-1">
                {files.map((item) => (
                  <li
                    key={item.key}
                    className="flex min-w-0 items-center gap-2 rounded-lg border border-onyx-line bg-onyx-surface px-3 py-2"
                  >
                    <span className="shrink-0 text-onyx-inkFaint" aria-hidden>
                      {item.status === "uploading" ? (
                        <Spinner size="sm" label="Subiendo" />
                      ) : item.status === "error" ? (
                        <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#f0a8a1]" fill="none" stroke="currentColor" strokeWidth="1.6">
                          <path d="M10 6.5v4.5M10 14h.01" strokeLinecap="round" />
                          <circle cx="10" cy="10" r="7" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="m5.5 10.5 3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-onyx-ink">
                        {item.name}
                      </span>
                      <span
                        className={
                          item.status === "error"
                            ? "mt-0.5 block truncate text-[12px] text-[#f0a8a1]"
                            : "mt-0.5 block truncate text-[12px] text-onyx-inkFaint"
                        }
                      >
                        {item.status === "uploading"
                          ? "Subiendo…"
                          : item.message ?? formatBytes(item.size)}
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() => removeFile(item.key)}
                      disabled={saving}
                      aria-label={`Quitar ${item.name}`}
                      className="focus-ring shrink-0 rounded px-1.5 text-[12px] text-onyx-inkMuted transition-colors duration-150 hover:text-onyx-ink disabled:opacity-50"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>

              <FileDropZone
                onFiles={enqueue}
                disabled={saving}
                className="px-3 py-3"
                hint="Añade más archivos."
              />
            </>
          )}

          {errorFiles.length > 0 && (
            <p className="text-[12px] leading-relaxed text-onyx-inkFaint">
              Los archivos con error no se enlazarán. Puedes quitarlos o volver a
              elegirlos.
            </p>
          )}
        </div>

        {formError && (
          <p role="alert" className="text-[13px] leading-relaxed text-[#f0a8a1]">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  );
}
