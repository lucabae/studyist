/**
 * Modal de renombrado, compartido por la lista y la pagina del archivo.
 * Solo cambia File.name: el path en disco y el contenido no se tocan.
 */
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button, Field, Input, Modal } from "../../components";
import { updateFileFilesFileIdPut, type FileRead } from "../../api/generated";
import { apiErrorMessage } from "../../lib/api";

export interface RenameFileModalProps {
  /** Archivo a renombrar; null cierra el modal. */
  file: FileRead | null;
  onClose: () => void;
  onRenamed: (file: FileRead) => void;
}

export function RenameFileModal({ file, onClose, onRenamed }: RenameFileModalProps) {
  const formId = useId();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al abrir (o cambiar de archivo) se parte siempre del nombre actual.
  useEffect(() => {
    setName(file?.name ?? "");
    setError(null);
    setSaving(false);
  }, [file]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || saving) return;

    const next = name.trim();
    if (!next) {
      setError("El nombre no puede estar vacío.");
      return;
    }
    if (next === file.name) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);

    const { data, error: updateError } = await updateFileFilesFileIdPut({
      path: { file_id: file.id },
      body: { name: next },
    });

    setSaving(false);

    if (updateError || !data) {
      setError(apiErrorMessage(updateError));
      return;
    }

    onRenamed(data);
  };

  return (
    <Modal
      open={file !== null}
      onClose={onClose}
      title="Renombrar archivo"
      description="Solo cambia el nombre visible. El archivo no se mueve ni se vuelve a subir."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <Field label="Nombre" error={error}>
          {(control) => (
            <Input
              {...control}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
              maxLength={200}
              disabled={saving}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}
