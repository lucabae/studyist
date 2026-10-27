"""Guardado, recuperacion y borrado de archivos bajo /files.

Cada archivo va a una subcarpeta segun su MIME type:
images, pdfs, texts u others (fallback).
"""

import hashlib
import logging
import mimetypes
import re
from pathlib import Path

logger = logging.getLogger(__name__)

FILES_ROOT = Path(__file__).resolve().parents[2] / "files"
THUMB_DIR = FILES_ROOT / "thumb"

# Tope de subida: 30 MB. Se comprueba antes de escribir en disco para no
# dejar archivos a medias.
MAX_UPLOAD_BYTES = 30 * 1024 * 1024

# Tope del texto que se indexa en file_fts: una fila FTS enorme no aporta nada
# a la busqueda y encarece el indice.
MAX_TEXT_CHARS = 200_000

# Subcarpeta destino por MIME type principal.
SUBDIR_BY_MIME: dict[str, str] = {
    "image": "images",
    "application/pdf": "pdfs",
    "text": "texts",
}


def save(upload_filename: str, content: bytes) -> dict:
    """Guarda un archivo en disco y devuelve los datos para crear la fila.

    Pasos: si len(content) supera MAX_UPLOAD_BYTES, lanzar ValueError antes de
    tocar disco; calcular el sha256 con compute_hash; detectar el MIME type a
    partir de la extension con _detect_mime; elegir la subcarpeta con
    _detect_subdir; sanitizar el nombre (_sanitize); si ya existe un archivo
    con ese nombre en la carpeta destino, anadir un sufijo numerico antes de la
    extension; escribir los bytes; generar el thumbnail si el tipo lo permite
    llamando a generate_thumb; devolver un dict con name, type, path relativo a
    FILES_ROOT, size, thumbnail y hash.

    Nota: la escritura en DB la hace la view, no esta funcion.
    """
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValueError(
            f"El archivo supera el tope de {MAX_UPLOAD_BYTES // (1024 * 1024)} MB"
        )

    digest = compute_hash(content)
    mime_type = _detect_mime(upload_filename)
    subdir = _detect_subdir(mime_type)
    name = _sanitize(upload_filename)

    # Import perezoso: generate_thumb importa este modulo, y hacerlo arriba
    # crearia un ciclo.
    from server.scripts.generate_thumb import generate_thumb

    target_dir = FILES_ROOT / subdir
    target_dir.mkdir(parents=True, exist_ok=True)

    # Nombre libre: si ya existe, sufijo _1, _2... antes de la extension.
    candidate = target_dir / name
    if candidate.exists():
        stem = Path(name).stem
        suffix = Path(name).suffix
        counter = 1
        while candidate.exists():
            candidate = target_dir / f"{stem}_{counter}{suffix}"
            counter += 1
    name = candidate.name

    candidate.write_bytes(content)
    logger.info("Archivo guardado en %s (%s bytes)", candidate, len(content))

    thumbnail = generate_thumb(candidate)

    return {
        "name": name,
        "type": mime_type,
        "path": candidate.relative_to(FILES_ROOT).as_posix(),
        "size": len(content),
        "thumbnail": thumbnail,
        "hash": digest,
    }


def extract_text(relative_path: str, mime_type: str) -> str:
    """Devuelve el texto indexable de un archivo ya guardado en /files.

    Pasos: si el MIME empieza por "text/", leer el archivo en utf-8 con
    errors="replace"; si es "application/pdf", abrirlo con pypdfium2 y
    concatenar el texto de cada pagina; para cualquier otro tipo, devolver ""
    sin abrir el archivo. Recortar el resultado a MAX_TEXT_CHARS para no
    reventar la fila de file_fts.

    Cualquier excepcion se loggea y devuelve "": quedarse sin texto indexado no
    debe impedir guardar el archivo, solo se podra buscar por nombre.
    """
    if mime_type.startswith("text/"):
        try:
            content = resolve(relative_path).read_text(
                encoding="utf-8", errors="replace"
            )
        except Exception:
            logger.exception("No se pudo extraer el texto de %s", relative_path)
            return ""
        return content[:MAX_TEXT_CHARS]

    if mime_type != "application/pdf":
        return ""

    try:
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(str(resolve(relative_path)))
        try:
            pages = [
                pdf[index].get_textpage().get_text_range()
                for index in range(len(pdf))
            ]
        finally:
            pdf.close()
    except Exception:
        logger.exception("No se pudo extraer el texto del PDF %s", relative_path)
        return ""

    return "\n".join(pages)[:MAX_TEXT_CHARS]


def resolve(relative_path: str) -> Path:
    """Convierte un path relativo (tal como esta en la DB) en path absoluto.

    Pasos: construir FILES_ROOT / relative_path; resolverlo con Path.resolve;
    comprobar que el resultado sigue estando dentro de FILES_ROOT y, si no,
    lanzar ValueError (proteccion contra path traversal); comprobar que existe
    y lanzar FileNotFoundError si no.
    """
    root = FILES_ROOT.resolve()
    candidate = (root / relative_path).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError(f"Ruta fuera de /files: {relative_path!r}")
    if not candidate.exists():
        raise FileNotFoundError(f"No existe el archivo: {candidate}")
    return candidate


def compute_hash(content: bytes) -> str:
    """Devuelve el sha256 en hexadecimal del contenido.

    Pasos: hashlib.sha256(content).hexdigest().
    """
    return hashlib.sha256(content).hexdigest()


def delete(relative_path: str, thumbnail: str | None = None) -> None:
    """Borra el archivo y su thumbnail del disco.

    Pasos: intentar resolve(relative_path) capturando FileNotFoundError; si
    existe, unlink; si thumbnail no es None, resolve(thumbnail) y unlink dentro
    de un try/except para que un fallo del thumbnail no impida borrar el
    original.

    Nota: el borrado de la fila y de sus referencias lo hace la view dentro de
    la misma transaccion.
    """
    try:
        resolve(relative_path).unlink()
        logger.info("Archivo borrado del disco: %s", relative_path)
    except FileNotFoundError:
        logger.warning("Se intento borrar un archivo que no existe: %s", relative_path)

    if thumbnail is not None:
        try:
            resolve(thumbnail).unlink()
        except (FileNotFoundError, ValueError, OSError):
            pass


def _detect_mime(filename: str) -> str:
    """Devuelve el MIME type a partir de la extension.

    Pasos: usar mimetypes.guess_type; si devuelve None, devolver
    "application/octet-stream".
    """
    mime_type, _ = mimetypes.guess_type(filename)
    return mime_type or "application/octet-stream"


def _detect_subdir(mime_type: str) -> str:
    """Devuelve la subcarpeta destino para un MIME type.

    Pasos: si el MIME empieza por "image/", devolver "images"; si es
    "application/pdf", "pdfs"; si empieza por "text/", "texts"; en cualquier
    otro caso, "others".
    """
    if mime_type.startswith("image/"):
        return "images"
    if mime_type == "application/pdf":
        return "pdfs"
    if mime_type.startswith("text/"):
        return "texts"
    return "others"


def _sanitize(filename: str) -> str:
    """Normaliza el nombre del archivo.

    Pasos: quedarse solo con el nombre base (Path.name); sustituir cualquier
    caracter que no sea letra, numero, punto, guion o guion bajo por "_";
    pasar a minusculas; si el resultado queda vacio, devolver "file".

    Los acentos se conservan (\\w en Python es Unicode); el objetivo es evitar
    separadores de ruta y caracteres raros, no perder informacion del nombre.
    """
    base = Path(filename).name
    cleaned = re.sub(r"[^\w.\-]", "_", base)
    cleaned = cleaned.lower()
    if cleaned in ("", ".", ".."):
        return "file"
    return cleaned
