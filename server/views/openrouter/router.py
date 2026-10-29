"""Views de Openrouter. Prefijo: /openrouter

Capa fina: valida el payload, delega en scripts/openrouter.py y devuelve la
respuesta junto al modelo usado. Es async porque la llamada al modelo puede
tardar minutos.
"""

import logging

from fastapi import APIRouter, HTTPException

from server.models import OpenrouterSendRequest, OpenrouterSendResponse
from server.scripts import openrouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/openrouter", tags=["openrouter"])


@router.post("/send", response_model=OpenrouterSendResponse)
async def send(payload: OpenrouterSendRequest) -> OpenrouterSendResponse:
    """Envia un mensaje a un modelo.

    Pasos: llamar a openrouter.send con todos los campos del payload; devolver
    content y model. Los errores se loggean enteros (mensaje real, rutas,
    respuesta del proveedor) y al cliente le llega un mensaje generico: un 400
    si el payload no vale y un 502 si falla el proveedor.
    """
    try:
        content, model = await openrouter.send(
            message=payload.message,
            model_type=payload.model_type,
            system_prompt=payload.system_prompt,
            files=payload.files,
            file_mode=payload.file_mode,
            model_override=payload.model_override,
        )
    except (ValueError, FileNotFoundError):
        logger.exception("Petición inválida a OpenRouter")
        raise HTTPException(status_code=400, detail="Petición no válida para el modelo.")
    except RuntimeError:
        logger.exception("OpenRouter falló")
        raise HTTPException(
            status_code=502, detail="No se pudo contactar con el modelo."
        )

    return OpenrouterSendResponse(content=content, model=model)
