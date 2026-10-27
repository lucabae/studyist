/**
 * /archivos/:id — detalle de un archivo.
 *
 * Cabecera con nombre editable y datos, preview segun el tipo y el chat de ese
 * archivo. En movil todo va en una columna: preview y despues el chat, que
 * termina antes de la barra de navegacion inferior.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Button,
  Card,
  EmptyState,
  Spinner,
  useToast,
} from "../../components";
import { PageHeader } from "../../layout/PageHeader";
import { getFileFilesFileIdGet, type FileRead } from "../../api/generated";
import { apiErrorMessage } from "../../lib/api";
import { formatBytes } from "../../lib/format";
import { FileChat } from "./FileChat";
import { FilePreview } from "./FilePreview";
import { RenameFileModal } from "./RenameFileModal";
import { FILE_DOC_KIND_LABELS, fileKind, fileTypeLabel, fileUrl } from "./fileUtils";

export default function FilePage() {
  const { id } = useParams();
  const fileId = Number(id);
  const isValidId = Number.isInteger(fileId) && fileId > 0;

  const { toast } = useToast();

  const [file, setFile] = useState<FileRead | null>(null);
  const [loading, setLoading] = useState(isValidId);
  const [notFound, setNotFound] = useState(!isValidId);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (!isValidId) return;

    let cancelled = false;

    setLoading(true);
    setNotFound(false);
    setError(null);

    void (async () => {
      const result = await getFileFilesFileIdGet({ path: { file_id: fileId } });
      if (cancelled) return;

      if (result.response?.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      if (result.error || !result.data) {
        setError(apiErrorMessage(result.error));
        setLoading(false);
        return;
      }

      setFile(result.data);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, isValidId, reloadKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-[13px] text-onyx-inkMuted">
        <Spinner size="sm" label="Cargando archivo" />
        Cargando archivo…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-[880px] px-4 py-10 sm:px-6">
        <EmptyState
          title="Este archivo no existe"
          description="Puede que se haya borrado o que el enlace esté mal."
          action={
            <Button to="/archivos" variant="secondary" size="sm">
              Volver a Archivos
            </Button>
          }
        />
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="mx-auto w-full max-w-[880px] px-4 py-10 sm:px-6">
        <div role="alert" className="rounded-xl border border-[#5a3636] px-4 py-3">
          <p className="break-words text-[13px] leading-relaxed text-[#f0a8a1]">
            {error ?? "No se pudo cargar el archivo."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Reintentar
            </Button>
            <Button to="/archivos" size="sm" variant="ghost">
              Volver a Archivos
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const kind = fileKind(file.type);
  const canDownload = kind === "text" || kind === "other";

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4 px-4 py-5 sm:px-6 sm:py-8">
      <Link
        to="/archivos"
        className="focus-ring inline-flex w-fit items-center gap-1 rounded-md text-[13px] text-onyx-inkMuted transition-colors hover:text-onyx-ink"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M12.5 5 7.5 10l5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Archivos
      </Link>

      <PageHeader
        title={file.name}
        description={`${fileTypeLabel(file.type)} · ${formatBytes(file.size)} · ${FILE_DOC_KIND_LABELS[file.kind]}`}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRenaming(true)}
            >
              Editar
            </Button>
            <Button
              href={fileUrl(file.path)}
              target="_blank"
              rel="noreferrer"
              download={canDownload ? file.name : undefined}
              size="sm"
            >
              {canDownload ? "Descargar" : "Abrir original"}
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <FilePreview file={file} />
      </Card>

      <Card className="h-[70dvh] min-h-[420px] overflow-hidden lg:h-[640px]">
        <FileChat fileId={file.id} fileName={file.name} />
      </Card>

      <RenameFileModal
        file={renaming ? file : null}
        onClose={() => setRenaming(false)}
        onRenamed={(updated) => {
          setFile(updated);
          setRenaming(false);
          toast("Archivo actualizado.", "success");
        }}
      />
    </div>
  );
}
