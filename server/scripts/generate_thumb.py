"""Generacion de thumbnails de baja resolucion (100x60 px).

Los thumbnails se guardan en /files/thumb con el mismo nombre base que el
original.
"""

import logging
from pathlib import Path

from PIL import Image

THUMB_SIZE = (100, 60)

logger = logging.getLogger(__name__)


def generate_thumb(path: Path) -> str | None:
    """Genera el thumbnail de un archivo y devuelve su path relativo.

    Pasos: detectar el MIME type; si es imagen, abrirla con Pillow, aplicar
    thumbnail(THUMB_SIZE), guardar como PNG o JPEG en /files/thumb y devolver
    el path relativo a /files; si es PDF, renderizar la primera pagina con
    pypdfium2 a escala reducida, convertirla a imagen de Pillow y guardarla
    del mismo modo; para cualquier otro tipo, devolver None sin escribir nada.

    Salida siempre en PNG (decision): un unico formato, soporta transparencia y
    no hay que preocuparse por la calidad de compresion del original.
    Cualquier fallo al leer el original (imagen corrupta, PDF roto, libreria
    que falta) se loggea y devuelve None: quedarse sin thumbnail no debe
    impedir guardar el archivo.
    """
    # Import perezoso: files.py importa este modulo al guardar, y hacerlo
    # arriba crearia un ciclo.
    from server.scripts import files

    mime_type = files._detect_mime(path.name)
    image: Image.Image | None = None

    if mime_type.startswith("image/"):
        try:
            with Image.open(path) as original:
                if original.mode not in ("RGB", "RGBA", "L", "LA"):
                    image = original.convert("RGB")
                else:
                    image = original.copy()
        except Exception:
            logger.exception("No se pudo leer la imagen %s", path)
            return None
    elif mime_type == "application/pdf":
        try:
            import pypdfium2 as pdfium
        except ImportError:
            logger.warning(
                "pypdfium2 no esta instalado: los PDFs se quedan sin thumbnail"
            )
            return None
        try:
            pdf = pdfium.PdfDocument(str(path))
            # scale=1 renderiza a tamano real; Pillow reduce despues. Un scale
            # menor pierde legibilidad en el thumbnail.
            image = pdf[0].render(scale=1).to_pil()
        except Exception:
            logger.exception("No se pudo leer el PDF %s", path)
            return None
    else:
        return None

    files.THUMB_DIR.mkdir(parents=True, exist_ok=True)
    target = files.THUMB_DIR / f"{path.stem}.png"
    image.thumbnail(THUMB_SIZE)
    image.save(target, "PNG")
    return target.relative_to(files.FILES_ROOT).as_posix()
