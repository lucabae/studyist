import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  updateTemaTemaTemaIdPut,
  type FileRead,
  type TemaRead,
} from "../../api/generated";
import { Button, FileRow, useToast } from "../../components";
import { apiErrorMessage, API_BASE_URL } from "../../lib/api";
import { formatBytes } from "../../lib/format";
import { EntityPickerModal } from "./EntityPickerModal";
import { TopicSectionCard } from "./TopicSectionCard";

export interface TopicFilesSectionProps {
  topic: TemaRead;
  files: FileRead[];
  onSaved: (topic: TemaRead) => void;
}

/** Archivos vinculados al tema, añadidos y quitados desde un selector modal. */
export function TopicFilesSection({ topic, files, onSaved }: TopicFilesSectionProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);

  const fileIds = topic.file_ids ?? [];
  const filesById = useMemo(() => new Map(files.map((file) => [file.id, file])), [files]);

  const pickerItems = useMemo(
    () =>
      files.map((file) => ({
        id: file.id,
        name: file.name,
        meta: formatBytes(file.size),
        group: file.type,
      })),
    [files],
  );

  async function handleSave(ids: number[]) {
    const { data, error } = await updateTemaTemaTemaIdPut({
      path: { tema_id: topic.id },
      body: { file_ids: ids },
    });

    if (error || !data) {
      toast(apiErrorMessage(error), "error");
      throw error ?? new Error("No se pudieron guardar los archivos");
    }

    onSaved(data);
    setPickerOpen(false);
    toast("Archivos actualizados", "success");
  }

  return (
    <TopicSectionCard
      title="Archivos"
      count={fileIds.length}
      action={
        <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
          Gestionar
        </Button>
      }
    >
      {fileIds.length === 0 ? (
        <p className="px-1 py-2 text-[13px] text-onyx-inkFaint">
          Este tema todavía no tiene archivos.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {fileIds.map((fileId) => {
            const file = filesById.get(fileId);

            return (
              <li key={fileId} className="min-w-0">
                {file ? (
                  <FileRow
                    file={{
                      id: file.id,
                      name: file.name,
                      type: file.type,
                      size: file.size,
                      thumbnail: file.thumbnail
                        ? `${API_BASE_URL}/files/${file.thumbnail
                            .split("/")
                            .map(encodeURIComponent)
                            .join("/")}`
                        : null,
                    }}
                    onOpen={() => navigate(`/archivos/${file.id}`)}
                  />
                ) : (
                  <Link
                    to={`/archivos/${fileId}`}
                    className="focus-ring flex items-center rounded-lg px-2 py-2 text-[14px] text-onyx-inkMuted transition-colors duration-150 hover:bg-onyx-surfaceHover hover:text-onyx-ink"
                  >
                    Archivo #{fileId}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <EntityPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Archivos del tema"
        description="Marca los archivos que pertenecen a este tema."
        items={pickerItems}
        initialIds={fileIds}
        emptyLabel="No hay archivos que coincidan con la búsqueda."
        searchLabel="Buscar archivo"
        onSave={handleSave}
      />
    </TopicSectionCard>
  );
}
