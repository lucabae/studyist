/**
 * Preview del archivo en la pagina Archivo.
 *
 * Imagen: inline. PDF: miniatura (si el backend la genero) + abrir en pestaña
 * nueva. Texto y otros: descarga, porque no hay endpoint de contenido.
 * Nada de iframes: en movil son pesados y se comen el scroll.
 */
import { Button } from "../../components";
import type { FileRead } from "../../api/generated";
import { fileKind, fileUrl, thumbnailUrl } from "./fileUtils";

export function FilePreview({ file }: { file: FileRead }) {
  const kind = fileKind(file.type);
  const url = fileUrl(file.path);

  if (kind === "image") {
    return (
      <img
        src={url}
        alt={file.name}
        loading="lazy"
        className="mx-auto max-h-[60vh] w-full bg-onyx-bg object-contain"
      />
    );
  }

  if (kind === "pdf") {
    const thumb = thumbnailUrl(file.thumbnail);

    return (
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        {thumb ? (
          <img
            src={thumb}
            alt={`Primera página de ${file.name}`}
            loading="lazy"
            className="w-full max-w-[220px] rounded-lg border border-onyx-line"
          />
        ) : (
          <div className="flex h-[120px] w-full max-w-[220px] items-center justify-center rounded-lg border border-onyx-line bg-onyx-bg px-3 text-center text-[12px] text-onyx-inkFaint">
            Sin miniatura
          </div>
        )}

        <div className="min-w-0">
          <p className="text-[13px] leading-relaxed text-onyx-inkMuted">
            El PDF se abre en una pestaña nueva.
          </p>
          <Button
            href={url}
            target="_blank"
            rel="noreferrer"
            size="sm"
            variant="secondary"
            className="mt-3"
          >
            Abrir PDF
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3 p-4">
      <p className="text-[13px] leading-relaxed text-onyx-inkMuted">
        {kind === "text"
          ? "Este texto no se puede mostrar aquí."
          : "Este tipo de archivo no tiene vista previa."}{" "}
        Descárgalo para abrirlo.
      </p>
      <Button href={url} download={file.name} size="sm" variant="secondary">
        Descargar
      </Button>
    </div>
  );
}
