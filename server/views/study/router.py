"""Views de Study. Prefijo: /study

Generacion de contenido de estudio con IA a partir de los documentos del
usuario. Los endpoints son async: la llamada al modelo puede tardar minutos y
no debe bloquear el event loop.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.db import File, Flashcard, FlashcardSet, get_session
from server.models import (
    CARD_TEXT_MAX_LENGTH,
    FileMode,
    FlashcardAmount,
    GenerateFlashcardsRequest,
    GenerateFlashcardsResponse,
)
from server.scripts import openrouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/study", tags=["study"])

# Limite de validacion de una tarjeta generada. Es el mismo que valida la
# respuesta (CardText): si aqui fuera mayor, el modelo podria devolver tarjetas
# que despues no se pueden serializar.
MAX_CARD_CHARS = CARD_TEXT_MAX_LENGTH

# Traduccion determinista de las cantidades cualitativas al numero de tarjetas
# que se le pide al modelo.
QUALITATIVE_AMOUNTS: dict[str, int] = {"pocas": 5, "medio": 15, "muchas": 30}


@router.post("/flashcards", response_model=GenerateFlashcardsResponse)
async def generate_flashcards(
    payload: GenerateFlashcardsRequest, db: Session = Depends(get_session)
) -> GenerateFlashcardsResponse:
    """Genera flashcards a partir de uno o varios files y las guarda en un set.

    Pasos: comprobar que el set existe (404); recuperar los files por id (404
    con la lista de ids que faltan); delegar en generate_into_set, que llama al
    modelo e inserta las tarjetas; devolver creadas y descartadas.
    """
    flashcard_set = db.get(FlashcardSet, payload.flashcard_set_id)
    if flashcard_set is None:
        raise HTTPException(
            status_code=404,
            detail=f"No existe el flashcard set {payload.flashcard_set_id}",
        )

    file_rows = load_files(payload.file_ids, db)
    created, discarded = await generate_into_set(
        db,
        flashcard_set,
        file_rows,
        payload.amount,
        payload.model_override,
        payload.instructions,
        payload.file_mode,
    )

    response = GenerateFlashcardsResponse(created=created, discarded=discarded)  # type: ignore[arg-type]
    db.commit()
    return response


def resolve_amount(amount: int | FlashcardAmount) -> int:
    """Traduce el amount del request al numero de tarjetas que se piden.

    Pasos: si amount es un int devolverlo tal cual; si es una estimacion
    cualitativa, buscarla en QUALITATIVE_AMOUNTS (pocas 5, medio 15, muchas 30).
    """
    if isinstance(amount, int):
        return amount
    return QUALITATIVE_AMOUNTS[amount]


def load_files(file_ids: list[int], db: Session) -> list[File]:
    """Recupera los files de una peticion.

    Pasos: consultar los File con esos ids; si falta alguno, lanzar 404 con la
    lista de ids que no existen; devolver las filas encontradas.

    Si un id llega repetido se devuelve una sola fila: la relacion es por id.
    """
    file_rows = list(db.scalars(select(File).where(File.id.in_(file_ids))))
    found_ids = {row.id for row in file_rows}
    missing = [file_id for file_id in file_ids if file_id not in found_ids]
    if missing:
        raise HTTPException(status_code=404, detail=f"No existen los files {missing}")

    return file_rows


async def generate_into_set(
    db: Session,
    flashcard_set: FlashcardSet,
    files: list[File],
    amount: int | FlashcardAmount,
    model_override: str | None,
    instructions: str | None = None,
    file_mode: FileMode = "text",
) -> tuple[list[Flashcard], int]:
    """Genera tarjetas con el modelo y las guarda en el set indicado.

    Pasos: resolver amount a un numero; sacar los paths relativos de files;
    construir el mensaje de usuario con el numero pedido (y, si llega, las
    instructions del usuario al final); llamar a
    openrouter.send con system_prompt "flashcards", model_type "pdf", esos
    paths y file_mode; parsear con _parse_flashcards; si el parseo falla, reintentar una
    vez anadiendo al mensaje "devuelve solo el JSON"; descartar las tarjetas con
    front o back vacios o de mas de 500 caracteres; insertar todas las validas
    con flashcard_set_id (no se trunca aunque el modelo devuelva de mas);
    flush; devolver (creadas, descartadas). El commit lo hace el llamante.

    Ojo: la sesion de SQLAlchemy es sincrona. Las consultas son SQLite local
    (microsegundos), asi que se hacen inline; la unica espera larga es la
    llamada al modelo, que si es await.
    """
    wanted = resolve_amount(amount)
    paths = [row.path for row in files]
    message = f"Genera {wanted} flashcards a partir de los documentos."
    if instructions and instructions.strip():
        # Comentario libre del usuario: se respeta tal cual, sin sanear.
        message = f"{message} Instrucciones del usuario: {instructions.strip()}"

    raw = await _ask_model(message, paths, model_override, file_mode)
    try:
        parsed = _parse_flashcards(raw)
    except ValueError:
        logger.warning("Respuesta no parseable, reintentando con instruccion extra")
        raw = await _ask_model(
            f"{message} Devuelve solo el JSON, sin explicaciones.",
            paths,
            model_override,
            file_mode,
        )
        try:
            parsed = _parse_flashcards(raw)
        except ValueError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"El modelo no devolvio JSON valido ni en el reintento: {exc}",
            )

    valid = [
        card
        for card in parsed
        if card["front"].strip()
        and card["back"].strip()
        and len(card["front"]) <= MAX_CARD_CHARS
        and len(card["back"]) <= MAX_CARD_CHARS
    ]

    created: list[Flashcard] = []
    for card in valid:
        flashcard = Flashcard(
            flashcard_set_id=flashcard_set.id,
            front=card["front"].strip(),
            back=card["back"].strip(),
            last_seen=None,
            difficulty="medium",
        )
        db.add(flashcard)
        created.append(flashcard)

    # flush, no commit: los ids ya existen para la respuesta, pero la
    # transaccion sigue abierta hasta que el llamante la cierra.
    db.flush()

    return created, len(parsed) - len(valid)


async def _ask_model(
    message: str,
    paths: list[str],
    model_override: str | None,
    file_mode: FileMode = "text",
) -> str:
    """Pide las tarjetas al modelo y traduce sus errores a HTTPException.

    Pasos: llamar a openrouter.send con system_prompt "flashcards", model_type
    "pdf" y file_mode; un ValueError o FileNotFoundError se convierte en 400; un
    RuntimeError, en 502; devolver el texto crudo.
    """
    try:
        raw, _model = await openrouter.send(
            message=message,
            model_type="pdf",
            system_prompt="flashcards",
            files=paths,
            file_mode=file_mode,
            model_override=model_override,
        )
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return raw


def _parse_flashcards(raw: str) -> list[dict]:
    """Extrae la lista de tarjetas del texto devuelto por el modelo.

    Pasos: buscar el primer "[" y el ultimo "]" del texto y quedarse con ese
    fragmento; intentar json.loads; si falla, lanzar ValueError para que el
    llamante reintente; validar que cada elemento es un dict con las claves
    front y back de tipo str; devolver solo las validas.
    """
    start = raw.find("[")
    end = raw.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("La respuesta del modelo no contiene un array JSON")

    try:
        data = json.loads(raw[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ValueError(f"JSON invalido en la respuesta del modelo: {exc}") from exc

    if not isinstance(data, list):
        raise ValueError("La respuesta del modelo no es una lista")

    return [
        item
        for item in data
        if isinstance(item, dict)
        and isinstance(item.get("front"), str)
        and isinstance(item.get("back"), str)
    ]
