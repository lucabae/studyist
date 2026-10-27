/**
 * Confirmacion de borrado de un archivo.
 *
 * Borrar un archivo NO borra las flashcards que lo usan: solo pierden la
 * imagen (ON DELETE SET NULL en el backend). El aviso lo dice explicitamente.
 */
import { useEffect, useState } from "react";
import { Button, Modal, Spinner } from "../../components";
import { deleteFileFilesFileIdDelete, type FileRead } from "../../api/generated";
import { apiErrorMessage } from "../../lib/api";

export interface DeleteFileModalProps {
  /** Archivo a borrar; null cierra el modal. */
  file: FileRead | null;
  onClose: () => void;
  onDeleted: (id: number) => void;
}

export function DeleteFileModal({ file, onClose, onDeleted }: DeleteFileModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDeleting(false);
    setError(null);
  }, [file]);

  const confirm = async () => {
    if (!file || deleting) return;

    setDeleting(true);
    setError(null);

    const { error: deleteError } = await deleteFileFilesFileIdDelete({
      path: { file_id: file.id },
    });

    setDeleting(false);

    if (deleteError) {
      setError(apiErrorMessage(deleteError));
      return;
    }

    onDeleted(file.id);
  };

  return (
    <Modal
      open={file !== null}
      onClose={onClose}
      title="Borrar archivo"
      description={
        file ? `Se borrará “${file.name}” de la biblioteca y del disco.` : undefined
      }
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirm} disabled={deleting}>
            {deleting ? (
              <>
                <Spinner size="sm" label="Borrando" />
                Borrando…
              </>
            ) : (
              "Borrar"
            )}
          </Button>
        </>
      }
    >
      <p className="rounded-lg border border-onyx-line bg-onyx-bg/40 px-3 py-2 text-[13px] leading-relaxed text-onyx-inkMuted">
        Las tarjetas que lo usen{" "}
        <strong className="font-medium text-onyx-ink">no se borran</strong>: solo
        pierden la imagen.
      </p>

      {error && (
        <p role="alert" className="mt-3 break-words text-[12px] text-[#f0a8a1]">
          {error}
        </p>
      )}
    </Modal>
  );
}
