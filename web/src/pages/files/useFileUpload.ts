/**
 * Cola de subidas de la pagina Archivos.
 *
 * Los archivos se suben de uno en uno (no en paralelo) para no saturar al
 * backend y para que el estado de cada fila sea fiable. Cada elemento de la
 * cola se queda en pantalla con su resultado: Listo, Error o Duplicado.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileFilesPost } from "../../api/generated";
import { useToast } from "../../components";
import { apiErrorMessage } from "../../lib/api";
import { duplicateFileId, type FileDocKind } from "./fileUtils";

export interface UploadItem {
  /** Clave local, no es el id del archivo (que aun no existe). */
  id: string;
  name: string;
  status: "uploading" | "done" | "error";
  /** Mensaje del backend cuando falla. */
  message?: string;
  /** Id del archivo identico que ya estaba en la biblioteca. */
  duplicateId?: number;
}

interface QueuedFile {
  key: string;
  file: File;
  kind: FileDocKind;
}

/** El backend solo guarda imagenes raster y PDF (nada de HTML/SVG/texto). */
function isAllowedUpload(file: File): boolean {
  if (file.type === "application/pdf") return true;
  return file.type.startsWith("image/") && file.type !== "image/svg+xml";
}

/**
 * Devuelve la cola y una funcion para encolarla. `onBatchDone` se llama una
 * vez por tanda, solo si al menos un archivo se subio bien.
 */
export function useFileUpload(onBatchDone: () => void) {
  const { toast } = useToast();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);

  const queue = useRef<QueuedFile[]>([]);
  const running = useRef(false);
  const counter = useRef(0);

  // El callback se guarda en ref: la cola no debe reiniciarse si la pagina
  // vuelve a crear la funcion (refresco de la lista).
  const onDone = useRef(onBatchDone);
  useEffect(() => {
    onDone.current = onBatchDone;
  }, [onBatchDone]);

  const patch = useCallback((key: string, changes: Partial<UploadItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === key ? { ...item, ...changes } : item)),
    );
  }, []);

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setUploading(true);

    let anyUploaded = false;

    try {
      while (queue.current.length > 0) {
        const entry = queue.current.shift();
        if (!entry) break;

        const { error: uploadError, response } = await createFileFilesPost({
          body: { upload: entry.file, kind: entry.kind },
        });

        if (!uploadError) {
          anyUploaded = true;
          patch(entry.key, { status: "done" });
          continue;
        }

        // 409: el hash coincide con un archivo que ya existe. Se enlaza a el
        // en la propia fila, para no perder la referencia.
        const duplicateId =
          response?.status === 409 ? duplicateFileId(uploadError) ?? undefined : undefined;

        patch(entry.key, {
          status: "error",
          message: apiErrorMessage(uploadError),
          duplicateId,
        });

        if (duplicateId !== undefined) {
          toast(
            `Ese archivo ya está en la biblioteca con el id #${duplicateId}. No se ha subido otra copia.`,
            "info",
          );
        }
      }
    } finally {
      running.current = false;
      setUploading(false);
    }

    if (anyUploaded) onDone.current();
  }, [patch, toast]);

  const enqueue = useCallback(
    (files: File[], kind: FileDocKind = "otros") => {
      if (files.length === 0) return;

      const allowed = files.filter(isAllowedUpload);
      if (allowed.length < files.length) {
        toast("Solo se admiten imágenes o PDF.", "error");
      }
      if (allowed.length === 0) return;

      const entries = allowed.map((file) => {
        counter.current += 1;
        return { key: `subida-${counter.current}`, file, kind };
      });

      setItems((current) => [
        ...current,
        ...entries.map((entry) => ({
          id: entry.key,
          name: entry.file.name,
          status: "uploading" as const,
        })),
      ]);

      queue.current.push(...entries);
      void drain();
    },
    [drain],
  );

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  /** Quita de la vista todo lo que ya termino, dejando las subidas en curso. */
  const clearFinished = useCallback(() => {
    setItems((current) => current.filter((item) => item.status === "uploading"));
  }, []);

  return { items, uploading, enqueue, dismiss, clearFinished };
}
