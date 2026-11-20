"""Interfaz minima sobre la API de OpenRouter.

La configuracion (API key) se lee de .env con python-dotenv.
Los prompts viven en /prompts/<nombre>.txt y se referencian por nombre, sin
extension.
"""

import base64
import logging
import mimetypes
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

from server.models import FileMode
from server.scripts import files as files_script

load_dotenv()

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
TIMEOUT_SECONDS = 180.0

# OpenRouter pide identificar la app; no es auth, solo estadisticas.
HTTP_REFERER = "http://localhost:5173"
APP_TITLE = "Studyist"

# Mapa model_type -> identificador de modelo de OpenRouter.
MODEL_BY_TYPE: dict[str, str] = {
    "pdf": "openai/gpt-6-luna",
    "general": "openai/gpt-6-luna",
    "exercise": "openai/gpt-6-luna",
}


async def send(
    message: str,
    model_type: str,
    system_prompt: str,
    files: list[str] | None = None,
    file_mode: FileMode = "text",
    model_override: str | None = None,
) -> tuple[str, str]:
    """Envia un mensaje a OpenRouter y devuelve (texto, modelo usado).

    Pasos: resolver el modelo con _resolve_model; cargar el prompt de sistema
    con _load_system_prompt; montar los mensajes (uno de rol system y otro de
    rol user); si files no es None, anadir las partes de contenido que devuelve
    _encode_files al mensaje de user (con file_mode: texto extraido o PDF
    original); enviar el payload con _post (que monta las
    cabeceras y valida el status); extraer choices[0].message.content con
    _extract_content; devolver el contenido y el modelo resuelto.
    """
    model = _resolve_model(model_type, model_override)
    system = _load_system_prompt(system_prompt)

    user_content: str | list[dict] = message
    if files:
        parts = _encode_files(files, file_mode)
        # El texto va primero: algunos modelos ignoran el mensaje si el primer
        # bloque de contenido es un archivo.
        user_content = [{"type": "text", "text": message}, *parts]

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
    }

    data = await _post(payload)
    return _extract_content(data), model


def _headers() -> dict:
    """Cabeceras comunes de OpenRouter (auth y identificacion de la app)."""
    return {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
        "HTTP-Referer": HTTP_REFERER,
        "X-Title": APP_TITLE,
    }


async def _post(payload: dict) -> dict:
    """Hace el POST a OpenRouter y devuelve la respuesta ya parseada como dict.

    Pasos: montar las cabeceras (Authorization con _api_key, Content-Type,
    HTTP-Referer y X-Title); abrir un httpx.AsyncClient con TIMEOUT_SECONDS y
    hacer POST a OPENROUTER_URL; si el status no es 2xx, loggear y lanzar
    RuntimeError con el cuerpo del error recortado a 500 caracteres; devolver
    response.json().
    """
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.post(OPENROUTER_URL, json=payload, headers=_headers())

    if not response.is_success:
        logger.error(
            "OpenRouter devolvio %s: %s", response.status_code, response.text[:500]
        )
        raise RuntimeError(
            f"OpenRouter devolvio {response.status_code}: {response.text[:500]}"
        )

    return response.json()


def _extract_content(data: dict) -> str:
    """Saca el texto de choices[0].message.content de la respuesta.

    Pasos: leer data["choices"][0]["message"]["content"]; si la forma no
    encaja, loggear y lanzar RuntimeError con la respuesta recortada a 500
    caracteres; si el contenido esta vacio, lanzar RuntimeError; devolverlo.
    """
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:
        logger.error("Respuesta inesperada de OpenRouter: %s", str(data)[:500])
        raise RuntimeError(f"Respuesta inesperada de OpenRouter: {str(data)[:500]}") from exc

    if not content:
        logger.error("OpenRouter devolvio una respuesta vacia")
        raise RuntimeError("OpenRouter devolvio una respuesta vacia")

    return content


def _resolve_model(model_type: str, model_override: str | None) -> str:
    """Devuelve el identificador de modelo a usar.

    Pasos: si model_override no es None, devolverlo tal cual; si no, buscar
    model_type en MODEL_BY_TYPE y lanzar ValueError si la clave no existe.
    """
    if model_override:
        return model_override
    if model_type not in MODEL_BY_TYPE:
        raise ValueError(f"model_type desconocido: {model_type!r}")
    return MODEL_BY_TYPE[model_type]


def _load_system_prompt(system_prompt: str) -> str:
    """Lee el prompt de sistema desde /prompts.

    Pasos: construir la ruta PROMPTS_DIR / (system_prompt + ".txt"); validar
    que el nombre no contiene "/" ni ".." (evitar salir de /prompts); si el
    archivo no existe, lanzar FileNotFoundError con la ruta esperada dentro
    del mensaje; devolver el contenido completo en utf-8.
    """
    if "/" in system_prompt or ".." in system_prompt:
        raise ValueError(f"Nombre de prompt invalido: {system_prompt!r}")

    path = PROMPTS_DIR / f"{system_prompt}.txt"
    if not path.is_file():
        raise FileNotFoundError(f"No existe el prompt de sistema en {path}")

    return path.read_text(encoding="utf-8")


def _encode_files(files: list[str], file_mode: FileMode = "text") -> list[dict]:
    """Convierte paths locales en partes de contenido para el mensaje.

    Con file_mode "text" (por defecto) los PDF se extraen con pypdfium2 y se
    mandan como texto plano: no hay coste de procesado de archivo en OpenRouter.
    Con "file" se manda el PDF en base64 y OpenRouter lo parsea (cobrado por
    pagina). Las imagenes siempre viajan inline como image_url.

    Pasos: bucle for sobre files; por cada path, resolverlo con
    files_script.resolve (que rechaza rutas fuera de /files); comprobar que su
    tamano no supera files_script.MAX_UPLOAD_BYTES y lanzar ValueError si lo
    supera; leer los bytes y codificarlos en base64; detectar el MIME type por
    extension con mimetypes; si es PDF, en modo "text" anadirlo como
    {"type": "text", "text": ...} con el texto extraido y, si no hay texto
    (PDF escaneado), avisar en el log y caer al modo "file", que anade
    {"type": "file", "file": {"filename": ..., "file_data":
    "data:application/pdf;base64,..."}}; si es imagen, anadir
    {"type": "image_url", "image_url": {"url": "data:<mime>;base64,..."}};
    si es texto, leerlo en utf-8 y anadirlo como {"type": "text", "text": ...};
    cualquier otro tipo se omite.
    """
    parts: list[dict] = []

    for relative_path in files:
        path = files_script.resolve(relative_path)
        size = path.stat().st_size
        if size > files_script.MAX_UPLOAD_BYTES:
            raise ValueError(
                f"{relative_path} ocupa {size} bytes y el tope para la IA es "
                f"{files_script.MAX_UPLOAD_BYTES}"
            )

        content = path.read_bytes()
        mime_type, _ = mimetypes.guess_type(path.name)
        mime_type = mime_type or "application/octet-stream"

        if mime_type == "application/pdf":
            if file_mode == "text":
                extracted = files_script.extract_text(relative_path, mime_type)
                if extracted.strip():
                    parts.append(
                        {
                            "type": "text",
                            "text": f"Contenido de {path.name}:\n{extracted}",
                        }
                    )
                    continue
                logger.warning(
                    "Sin texto extraible en %s; se envia el PDF original",
                    relative_path,
                )

            encoded = base64.b64encode(content).decode("ascii")
            parts.append(
                {
                    "type": "file",
                    "file": {
                        "filename": path.name,
                        "file_data": f"data:application/pdf;base64,{encoded}",
                    },
                }
            )
        elif mime_type.startswith("image/"):
            encoded = base64.b64encode(content).decode("ascii")
            parts.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime_type};base64,{encoded}"},
                }
            )
        elif mime_type.startswith("text/"):
            parts.append(
                {
                    "type": "text",
                    "text": f"Contenido de {path.name}:\n"
                    + content.decode("utf-8", errors="replace"),
                }
            )
        # Otros tipos (docx, zip...) se omiten: OpenRouter no los acepta inline
        # y mandarlos como base64 solo gasta tokens.

    return parts


def _api_key() -> str:
    """Devuelve OPENROUTER_API_KEY del entorno.

    Pasos: leer os.getenv; si esta vacia o no existe, lanzar RuntimeError
    indicando que falta la variable en .env.
    """
    key = os.getenv("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("Falta OPENROUTER_API_KEY en .env")
    return key
