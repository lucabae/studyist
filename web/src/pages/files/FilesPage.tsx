/**
 * /archivos — biblioteca de archivos.
 *
 * Busqueda con debounce sobre la FTS del backend, filtros por familia y
 * subida multiple con una fila de estado por archivo. La lista siempre se
 * refresca al terminar una tanda de subidas.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Chip,
  EmptyState,
  FileDropZone,
  FileRow,
  Input,
  Spinner,
  useToast,
} from "../../components";
import { PageHeader } from "../../layout/PageHeader";
import { listFilesFilesGet, type FileRead } from "../../api/generated";
import { apiErrorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { AddFilesToTemaModal } from "./AddFilesToTemaModal";
import { DeleteFileModal } from "./DeleteFileModal";
import { RenameFileModal } from "./RenameFileModal";
import { UploadQueue } from "./UploadQueue";
import {
  FILE_DOC_KIND_LABELS,
  FILE_DOC_KIND_OPTIONS,
  fileCountLabel,
  fileKind,
  shortFileType,
  thumbnailUrl,
  type FileDocKind,
  type FileKind,
} from "./fileUtils";
import { useFileUpload } from "./useFileUpload";

type FileFilterKey = "all" | FileKind;

const FILTERS: { key: FileFilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "pdf", label: "PDF" },
  { key: "image", label: "Imagen" },
  { key: "text", label: "Texto" },
  { key: "other", label: "Otro" },
];

/** Valor de `type` que entiende el backend; "application/pdf" es exacto. */
const FILTER_TYPE: Record<FileFilterKey, string | undefined> = {
  all: undefined,
  pdf: "application/pdf",
  image: "image",
  text: "text",
  other: undefined,
};

const RESULT_LIMIT = 100;
/** "Otro" no se puede pedir al backend: se trae un lote amplio y se criba. */
const OTHER_LIMIT = 500;
/** Espera del buscador para no lanzar una peticion por tecla. */
const SEARCH_DEBOUNCE_MS = 300;

export default function FilesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState<FileFilterKey>("all");

  const [files, setFiles] = useState<FileRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [renaming, setRenaming] = useState<FileRead | null>(null);
  const [deleting, setDeleting] = useState<FileRead | null>(null);
  const [addingToTema, setAddingToTema] = useState(false);
  // Tipo que se aplica a los archivos que se suban a continuacion.
  const [uploadKind, setUploadKind] = useState<FileDocKind>("otros");

  const dropZoneRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);
  const upload = useFileUpload(refresh);

  // Debounce del texto: el estado que dispara la peticion va 300 ms por detras.
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedQuery(query.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const onlyOther = filter === "other";

    setLoading(true);
    setError(null);

    void (async () => {
      const { data, error: listError } = await listFilesFilesGet({
        query: {
          q: debouncedQuery || undefined,
          type: FILTER_TYPE[filter],
          limit: onlyOther ? OTHER_LIMIT : RESULT_LIMIT,
        },
      });

      if (cancelled) return;

      if (listError || !data) {
        setFiles([]);
        setError(apiErrorMessage(listError));
        setLoading(false);
        return;
      }

      // El backend no sabe excluir tipos: "Otro" se filtra aqui.
      setFiles(onlyOther ? data.filter((file) => fileKind(file.type) === "other") : data);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, filter, reloadKey]);

  /** Abre el selector nativo desde los CTA sin duplicar el input de la zona. */
  const openPicker = () => {
    dropZoneRef.current?.querySelector<HTMLInputElement>('input[type="file"]')?.click();
  };

  const resetFilters = () => {
    setQuery("");
    setDebouncedQuery("");
    setFilter("all");
  };

  const isPristine = filter === "all" && debouncedQuery === "";

  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-5 sm:px-6 sm:py-8">
      <PageHeader
        title="Archivos"
        description="Tu biblioteca: busca, filtra y sube documentos para estudiarlos o preguntarles."
        actions={
          <Button
            variant="secondary"
            onClick={() => setAddingToTema(true)}
            disabled={files.length === 0}
          >
            Añadir a un tema
          </Button>
        }
      />

      <div className="mt-5 flex flex-col gap-3">
        <div className="relative min-w-0">
          <svg
            viewBox="0 0 20 20"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-onyx-inkFaint"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden
          >
            <circle cx="9" cy="9" r="5" />
            <path d="m12.8 12.8 3.2 3.2" strokeLinecap="round" />
          </svg>
          <label htmlFor="file-search" className="sr-only">
            Buscar archivos
          </label>
          <Input
            id="file-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o contenido…"
            autoComplete="off"
            className="pl-9"
          />
        </div>

        <div
          role="group"
          aria-label="Filtrar por tipo"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          {FILTERS.map((option) => (
            <Chip
              key={option.key}
              active={filter === option.key}
              onClick={() => setFilter(option.key)}
              className="shrink-0"
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </div>

      <div ref={dropZoneRef} className="mt-4">
        <div
          role="group"
          aria-label="Tipo de los archivos que vas a subir"
          className="mb-2 flex flex-wrap items-center gap-2"
        >
          <span className="text-[13px] font-medium text-onyx-inkMuted">
            Tipo del documento
          </span>
          {FILE_DOC_KIND_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              active={uploadKind === option.value}
              onClick={() => setUploadKind(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
        <FileDropZone
          onFiles={(incoming) => upload.enqueue(incoming, uploadKind)}
          hint={`Se guardarán como ${FILE_DOC_KIND_LABELS[uploadKind].toLowerCase()} · hasta 30 MB por archivo · también puedes pegarlos`}
        />
      </div>

      <UploadQueue
        items={upload.items}
        uploading={upload.uploading}
        onDismiss={upload.dismiss}
        onClearFinished={upload.clearFinished}
      />

      <p
        aria-live="polite"
        className={cn(
          "mt-4 text-[12px] text-onyx-inkFaint",
          loading && "invisible",
        )}
      >
        {fileCountLabel(files.length)}
        {debouncedQuery ? ` para “${debouncedQuery}”` : ""}
      </p>

      <div className="mt-2">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-onyx-inkMuted">
            <Spinner size="sm" label="Cargando archivos" />
            Cargando archivos…
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded-xl border border-[#5a3636] px-4 py-3"
          >
            <p className="break-words text-[13px] leading-relaxed text-[#f0a8a1]">
              {error}
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={refresh}
              className="mt-3"
            >
              Reintentar
            </Button>
          </div>
        ) : files.length === 0 ? (
          isPristine ? (
            <EmptyState
              title="Aún no hay archivos"
              description="Sube apuntes, PDFs o imágenes. Se indexan para que puedas buscarlos por su contenido."
              icon={
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <path d="M6 5.5h6l4 4v9H6z" strokeLinejoin="round" />
                  <path d="M12 5.5v4h4" strokeLinejoin="round" />
                </svg>
              }
              action={
                <Button onClick={openPicker} size="sm">
                  Subir archivo
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Sin resultados"
              description={
                debouncedQuery
                  ? `No hay archivos que coincidan con “${debouncedQuery}”.`
                  : "No hay archivos de este tipo."
              }
              action={
                <Button onClick={resetFilters} size="sm" variant="secondary">
                  Quitar búsqueda y filtros
                </Button>
              }
            />
          )
        ) : (
          <ul className="overflow-hidden rounded-xl border border-onyx-line">
            {files.map((file) => (
              <li
                key={file.id}
                className="border-b border-onyx-line last:border-b-0"
              >
                <FileRow
                  file={{
                    id: file.id,
                    name: file.name,
                    type: shortFileType(file.type),
                    kindLabel: FILE_DOC_KIND_LABELS[file.kind],
                    size: file.size,
                    thumbnail: thumbnailUrl(file.thumbnail),
                  }}
                  onOpen={(id) => navigate(`/archivos/${id}`)}
                  onRename={() => setRenaming(file)}
                  onDelete={() => setDeleting(file)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <RenameFileModal
        file={renaming}
        onClose={() => setRenaming(null)}
        onRenamed={(updated) => {
          setFiles((current) =>
            current.map((item) => (item.id === updated.id ? updated : item)),
          );
          setRenaming(null);
          toast("Nombre actualizado.", "success");
        }}
      />

      <AddFilesToTemaModal
        open={addingToTema}
        onClose={() => setAddingToTema(false)}
        files={files}
        onSaved={refresh}
      />

      <DeleteFileModal
        file={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(id) => {
          setFiles((current) => current.filter((item) => item.id !== id));
          setDeleting(null);
          toast("Archivo borrado.", "success");
        }}
      />
    </div>
  );
}
