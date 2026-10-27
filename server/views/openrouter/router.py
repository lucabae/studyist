"""Views de Openrouter. Prefijo: /openrouter

Capa fina: valida el payload, delega en scripts/openrouter.py y devuelve la
respuesta junto al modelo usado. Es async porque la llamada al modelo puede
tardar minutos.
"""

from fastapi import APIRouter, HTTPException

from server.models import OpenrouterSendRequest, OpenrouterSendResponse
from server.scripts import openrouter

router = APIRouter(prefix="/openrouter", tags=["openrouter"])


@router.post("/send", response_model=OpenrouterSendResponse)
async def send(payload: OpenrouterSendRequest) -> OpenrouterSendResponse:
    """Envia un mensaje a un modelo.

    Pasos: llamar a openrouter.send con todos los campos del payload; devolver
    content y model. Traducir ValueError y FileNotFoundError a HTTPException
    400 con el mensaje original (model_type desconocido o prompt inexistente) y
    RuntimeError a 502 (fallo de OpenRouter).
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
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return OpenrouterSendResponse(content=content, model=model)
