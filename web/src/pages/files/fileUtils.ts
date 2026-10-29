/**
 * Helpers compartidos por las paginas de Archivos.
 *
 * El backend guarda en File.type el MIME completo (application/pdf, image/png,
 * text/plain...), asi que aqui se traduce a las familias que pinta la UI y a
 * las URLs publicas del mount /files.
 */
import { API_BASE_URL, withAccessToken } from "../../lib/api";

/** Familia de archivo: decide el preview y el filtro. */
export type FileKind = "image" | "pdf" | "text" | "other";

/** Tipo de documento (columna file.kind), independiente del MIME. */
export type FileDocKind = "teoria" | "examen" | "ejercicio" | "otros";

export const FILE_DOC_KIND_LABELS: Record<FileDocKind, string> = {
  teoria: "Teoría",
  examen: "Examen",
  ejercicio: "Ejercicio",
  otros: "Otros",
};

export const FILE_DOC_KIND_OPTIONS: { value: FileDocKind; label: string }[] = [
  { value: "teoria", label: FILE_DOC_KIND_LABELS.teoria },
  { value: "examen", label: FILE_DOC_KIND_LABELS.examen },
  { value: "ejercicio", label: FILE_DOC_KIND_LABELS.ejercicio },
  { value: "otros", label: FILE_DOC_KIND_LABELS.otros },
];

/** Clasifica un MIME en la familia que le toca. */
export function fileKind(type: string): FileKind {
  const mime = type.toLowerCase();

  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  return "other";
}

/** Etiqueta legible para la cabecera del archivo. */
export function fileTypeLabel(type: string): string {
  switch (fileKind(type)) {
    case "pdf":
      return "PDF";
    case "image":
      return "Imagen";
    case "text":
      return "Texto";
    default:
      return type || "Archivo";
  }
}

/** Subtipos de text/* que tienen una extension mas reconocible que el MIME. */
const TEXT_EXTENSIONS: Record<string, string> = {
  plain: "txt",
  markdown: "md",
  "x-markdown": "md",
  csv: "csv",
  html: "html",
};

/**
 * Tipo corto para FileRow, que lo pinta en mayusculas junto al tamano.
 * "application/pdf" -> "pdf", "image/jpeg" -> "jpg".
 */
export function shortFileType(type: string): string {
  const mime = type.toLowerCase();
  if (mime === "application/pdf") return "pdf";

  const [family, subtype = ""] = mime.split("/");
  const base = subtype.split("+")[0];

  if (family === "image") return base === "jpeg" ? "jpg" : base || "img";
  if (family === "text") return TEXT_EXTENSIONS[base] ?? (base || "txt");

  return type || "archivo";
}

/** URL pública de un path relativo a /files (o de un thumbnail). */
export function fileUrl(relativePath: string): string {
  // Se codifica segmento a segmento para no romper las barras del path.
  const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
  // El mount estático exige sesión y `<img>` no manda cabeceras: token en la
  // query (ver withAccessToken).
  return withAccessToken(`${API_BASE_URL}/files/${encoded}`);
}

/** URL del thumbnail, o null si el archivo no tiene. */
export function thumbnailUrl(thumbnail: string | null): string | null {
  return thumbnail ? fileUrl(thumbnail) : null;
}

/**
 * Id del archivo que ya existia, a partir del 409 del backend:
 * { detail: { message, file_id } }. Null si el error no lo trae.
 */
export function duplicateFileId(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;

  const detail = (error as { detail?: unknown }).detail;
  if (!detail || typeof detail !== "object") return null;

  const id = (detail as { file_id?: unknown }).file_id;
  return typeof id === "number" ? id : null;
}

/** "1 archivo" / "12 archivos". */
export function fileCountLabel(count: number): string {
  return count === 1 ? "1 archivo" : `${count} archivos`;
}
