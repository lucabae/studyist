/**
 * Modal de edicion del archivo, compartido por la lista y la pagina del
 * archivo. Cambia File.name y File.kind: el path en disco y el contenido no
 * se tocan.
 */
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button, Chip, Field, Input, Modal } from "../../components";
import { updateFileFilesFileIdPut, type FileRead } from "../../api/generated";
import { apiErrorMessage } from "../../lib/api";
import {
  FILE_DOC_KIND_OPTIONS,
  type FileDocKind,
} from "./fileUtils";

export interface RenameFileModalProps {
  /** Archivo a editar; null cierra el modal. */
  file: FileRead | null;
  onClose: () => void;
  onRenamed: (file: FileRead) => void;
}

export function RenameFileModal({ file, onClose, onRenamed }: RenameFileModalProps) {
  const formId = useId();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<FileDocKind>("otros");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al abrir (o cambiar de archivo) se parte siempre de los valores actuales.
  useEffect(() => {
    setName(file?.name ?? "");
    setKind(file?.kind ?? "otros");
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
    if (next === file.name && kind === file.kind) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);

    const { data, error: updateError } = await updateFileFilesFileIdPut({
      path: { file_id: file.id },
      body: { name: next, kind },
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
      title="Editar archivo"
      description="Cambia el nombre visible o el tipo de documento. El archivo no se mueve ni se vuelve a subir."
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
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
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

        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[13px] font-medium text-onyx-inkMuted">
            Tipo de documento
          </p>
          <div className="flex flex-wrap gap-2">
            {FILE_DOC_KIND_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                active={kind === option.value}
                onClick={() => setKind(option.value)}
                disabled={saving}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
