import { useEffect, useMemo, useState } from "react";
import {
  getTemaTemaTemaIdGet,
  updateTemaTemaTemaIdPut,
  type FileRead,
} from "../../api/generated";
import { Button, Input, Modal, Spinner, TemaPicker, useToast } from "../../components";
import { apiErrorMessage } from "../../lib/api";
import { formatBytes } from "../../lib/format";

export interface AddFilesToTemaModalProps {
  open: boolean;
  onClose: () => void;
  /** Biblioteca ya cargada en la página. */
  files: FileRead[];
  onSaved: () => void;
}

/**
 * Enlaza archivos de la biblioteca a un tema sin salir de /archivos.
 *
 * El tema se busca por nombre (TemaPicker) y los archivos se marcan en la
 * lista. Al guardar se suman a los que ya tuviera el tema, nunca se quitan.
 */
export function AddFilesToTemaModal({
  open,
  onClose,
  files,
  onSaved,
}: AddFilesToTemaModalProps) {
  const { toast } = useToast();

  const [temaId, setTemaId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTemaId(null);
    setSelected([]);
    setQuery("");
    setSaving(false);
    setError(null);
  }, [open]);

  const visibleFiles = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("es");
    if (!needle) return files;
    return files.filter((file) => file.name.toLocaleLowerCase("es").includes(needle));
  }, [files, query]);

  const toggle = (fileId: number) => {
    setSelected((current) =>
      current.includes(fileId)
        ? current.filter((id) => id !== fileId)
        : [...current, fileId],
    );
  };

  const canSave = temaId !== null && selected.length > 0 && !saving;

  const save = async () => {
    if (!canSave || temaId === null) return;

    setSaving(true);
    setError(null);

    const { data: tema, error: loadError } = await getTemaTemaTemaIdGet({
      path: { tema_id: temaId },
    });
    if (loadError || !tema) {
      setSaving(false);
      setError(apiErrorMessage(loadError));
      return;
    }

    // Union con lo que ya tenia: este flujo solo anade.
    const merged = Array.from(new Set([...(tema.file_ids ?? []), ...selected]));
    const { error: saveError } = await updateTemaTemaTemaIdPut({
      path: { tema_id: temaId },
      body: { file_ids: merged },
    });

    setSaving(false);

    if (saveError) {
      setError(apiErrorMessage(saveError));
      return;
    }

    toast(
      selected.length === 1
        ? "1 archivo añadido al tema."
        : `${selected.length} archivos añadidos al tema.`,
      "success",
    );
    onSaved();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Añadir archivos a un tema"
      description="Se suman a los que ya tenga el tema; no se quita ninguno."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={!canSave}>
            {saving ? "Añadiendo…" : "Añadir archivos"}
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        <TemaPicker
          value={temaId}
          onChange={setTemaId}
          label="Tema"
          hint="Busca por nombre. Puedes cambiar el filtro de asignatura."
          disabled={saving}
        />

        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-[13px] font-medium text-onyx-inkMuted">
            Archivos
            <span className="ml-2 font-normal text-onyx-inkFaint">
              {selected.length} seleccionados
            </span>
          </p>

          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar archivo por nombre"
            autoComplete="off"
            disabled={saving}
          />

          <div className="max-h-56 min-w-0 overflow-y-auto rounded-lg border border-onyx-line">
            {files.length === 0 && (
              <p className="px-3 py-3 text-[13px] text-onyx-inkFaint">
                Todavía no hay archivos en la biblioteca.
              </p>
            )}

            {files.length > 0 && visibleFiles.length === 0 && (
              <p className="px-3 py-3 text-[13px] text-onyx-inkFaint">
                Ningún archivo coincide con la búsqueda.
              </p>
            )}

            {visibleFiles.length > 0 && (
              <ul>
                {visibleFiles.map((file) => (
                  <li key={file.id} className="border-b border-onyx-line last:border-b-0">
                    <label className="flex min-w-0 cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors duration-150 hover:bg-onyx-surfaceHover">
                      <input
                        type="checkbox"
                        checked={selected.includes(file.id)}
                        onChange={() => toggle(file.id)}
                        disabled={saving}
                        className="focus-ring h-4 w-4 shrink-0 accent-white"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-onyx-ink">
                          {file.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-onyx-inkFaint">
                          {formatBytes(file.size)}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {saving && (
          <p className="flex items-center gap-2 text-[13px] text-onyx-inkMuted">
            <Spinner size="sm" label="Añadiendo archivos" />
            Añadiendo al tema…
          </p>
        )}

        {error && (
          <p role="alert" className="text-[13px] leading-relaxed text-[#f0a8a1]">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
