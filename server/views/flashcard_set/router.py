"""Views de Flashcard Set. Prefijo: /flashcard_set"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.db import Flashcard, FlashcardSet, get_session
from server.models import (
    FileMode,
    FlashcardAmount,
    FlashcardRead,
    FlashcardSetCreate,
    FlashcardSetRead,
    FlashcardSetUpdate,
    Name,
)
from server.scripts import spaced_repetition
from server.views.study.router import generate_into_set, load_files

router = APIRouter(prefix="/flashcard_set", tags=["flashcard_set"])


class FlashcardSetFromFilesRequest(BaseModel):
    """Payload para crear un set a partir de documentos.

    amount acepta un numero exacto de tarjetas (1..50) o una estimacion
    cualitativa ("pocas", "medio", "muchas")."""

    name: Name
    file_ids: list[int] = Field(min_length=1)
    amount: int | FlashcardAmount = Field(
        default=10,
        description="Numero exacto o una estimacion cualitativa",
    )
    # Comentario libre que se le pasa al modelo junto al encargo.
    instructions: str | None = Field(
        default=None, max_length=2000, description="Indicaciones extra del usuario"
    )
    file_mode: FileMode = Field(
        default="text",
        description="Solo aplica a los PDF: texto extraido o archivo original",
    )
    model_override: str | None = None

    @field_validator("amount")
    @classmethod
    def _check_amount_range(cls, value: int | str) -> int | str:
        """Comprueba el rango solo cuando amount llega como numero."""
        if isinstance(value, int) and not 1 <= value <= 50:
            raise ValueError("amount debe estar entre 1 y 50")
        return value


class FlashcardSetFromFilesResponse(BaseModel):
    """Respuesta con el set creado, sus tarjetas y cuantas se descartaron."""

    set: FlashcardSetRead
    created: list[FlashcardRead]
    discarded: int


@router.post("", response_model=FlashcardSetRead, status_code=201)
def create_flashcard_set(
    payload: FlashcardSetCreate, db: Session = Depends(get_session)
) -> FlashcardSetRead:
    """Crea un set vacio.

    Pasos: insertar la fila; commit; devolver con flashcard_ids vacio.
    """
    flashcard_set = FlashcardSet(name=payload.name)
    db.add(flashcard_set)
    db.commit()
    return flashcard_set


@router.get("", response_model=list[FlashcardSetRead])
def list_flashcard_sets(db: Session = Depends(get_session)) -> list[FlashcardSetRead]:
    """Lista todos los sets.

    Pasos: consultar ordenando por name, cargando la relacion flashcards, y
    construir flashcard_ids a partir de ella.
    """
    return list(db.scalars(select(FlashcardSet).order_by(FlashcardSet.name)))


@router.post("/from-files", response_model=FlashcardSetFromFilesResponse, status_code=201)
async def create_flashcard_set_from_files(
    payload: FlashcardSetFromFilesRequest, db: Session = Depends(get_session)
) -> FlashcardSetFromFilesResponse:
    """Crea un set con tarjetas generadas a partir de uno o varios files.

    Pasos: recuperar los files por id (404 con la lista de ids que faltan);
    insertar el set vacio y hacer flush para tener ya su id; delegar en
    generate_into_set, que llama al modelo y deja las tarjetas en la sesion;
    construir la respuesta y solo entonces hacer commit.

    Si algo falla no queda set huerfano: get_session hace rollback al
    propagarse la excepcion. El commit va despues de serializar la respuesta,
    para que un error de validacion tampoco deje un set a medias.
    """
    file_rows = load_files(payload.file_ids, db)

    flashcard_set = FlashcardSet(name=payload.name)
    db.add(flashcard_set)
    db.flush()

    created, discarded = await generate_into_set(
        db,
        flashcard_set,
        file_rows,
        payload.amount,
        payload.model_override,
        payload.instructions,
        payload.file_mode,
    )
    response = FlashcardSetFromFilesResponse(
        set=flashcard_set,  # type: ignore[arg-type]
        created=created,  # type: ignore[arg-type]
        discarded=discarded,
    )
    db.commit()
    return response


@router.get("/{set_id}", response_model=FlashcardSetRead)
def get_flashcard_set(set_id: int, db: Session = Depends(get_session)) -> FlashcardSetRead:
    """Devuelve un set por id.

    Pasos: buscar por PK con sus flashcards; 404 si no existe; devolverlo.
    """
    flashcard_set = db.get(FlashcardSet, set_id)
    if flashcard_set is None:
        raise HTTPException(
            status_code=404, detail=f"No existe el flashcard set {set_id}"
        )
    return flashcard_set


@router.get("/{set_id}/review", response_model=list[FlashcardRead])
def review_flashcard_set(
    set_id: int,
    all_cards: bool = Query(False, alias="all"),
    limit: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_session),
) -> list[FlashcardRead]:
    """Devuelve las tarjetas del set que toca repasar hoy.

    Pasos: comprobar que el set existe (404); con all=true devolver todas las
    del set ordenadas por id y sin aplicar limit (es el repaso completo); si
    no, quedarse con las que cumplen spaced_repetition.is_due, ordenarlas con
    order_due (nunca vistas primero, luego por next_review ascendente y por id)
    y cortar en limit.
    """
    flashcard_set = db.get(FlashcardSet, set_id)
    if flashcard_set is None:
        raise HTTPException(
            status_code=404, detail=f"No existe el flashcard set {set_id}"
        )

    cards = list(flashcard_set.flashcards)
    if all_cards:
        return sorted(cards, key=lambda flashcard: flashcard.id)

    due = [
        flashcard
        for flashcard in cards
        if spaced_repetition.is_due(flashcard.last_seen, flashcard.difficulty)
    ]
    return spaced_repetition.order_due(due)[:limit]


@router.put("/{set_id}", response_model=FlashcardSetRead)
def update_flashcard_set(
    set_id: int, payload: FlashcardSetUpdate, db: Session = Depends(get_session)
) -> FlashcardSetRead:
    """Renombra un set.

    Pasos: buscar la fila (404 si no existe); asignar name; commit; devolver.
    """
    flashcard_set = db.get(FlashcardSet, set_id)
    if flashcard_set is None:
        raise HTTPException(
            status_code=404, detail=f"No existe el flashcard set {set_id}"
        )

    flashcard_set.name = payload.name
    db.commit()
    return flashcard_set


@router.delete("/{set_id}", status_code=204)
def delete_flashcard_set(set_id: int, db: Session = Depends(get_session)) -> None:
    """Borra un set y todas sus flashcards.

    Pasos: buscar la fila (404 si no existe); delete + commit. Las flashcards
    caen por ON DELETE CASCADE y las filas de tema_flashcard_set tambien.
    """
    flashcard_set = db.get(FlashcardSet, set_id)
    if flashcard_set is None:
        raise HTTPException(
            status_code=404, detail=f"No existe el flashcard set {set_id}"
        )

    db.delete(flashcard_set)
    db.commit()


@router.post("/{set_id}/flashcards", response_model=FlashcardSetRead)
def add_flashcard(
    set_id: int,
    flashcard_id: int = Query(
        ...,
        description="Id de la flashcard que se mueve a este set",
    ),
    db: Session = Depends(get_session),
) -> FlashcardSetRead:
    """Mete una flashcard existente en este set (o la mueve desde otro).

    Pasos: comprobar que el set existe (404); buscar la flashcard por id (404);
    si ya pertenece a este set, devolver 409; asignar flashcard_set_id al nuevo
    set; commit; devolver el set actualizado.

    flashcard_id viaja como query param: POST /flashcard_set/{set_id}/flashcards?flashcard_id=N
    """
    flashcard_set = db.get(FlashcardSet, set_id)
    if flashcard_set is None:
        raise HTTPException(
            status_code=404, detail=f"No existe el flashcard set {set_id}"
        )

    flashcard = db.get(Flashcard, flashcard_id)
    if flashcard is None:
        raise HTTPException(
            status_code=404, detail=f"No existe la flashcard {flashcard_id}"
        )

    if flashcard.flashcard_set_id == set_id:
        raise HTTPException(
            status_code=409,
            detail=f"La flashcard {flashcard_id} ya pertenece al set {set_id}",
        )

    flashcard.flashcard_set_id = set_id
    db.commit()
    # expire_on_commit=False deja la relacion cacheada; hay que invalidarla
    # para que flashcard_ids incluya la tarjeta recien movida.
    db.expire(flashcard_set)
    return flashcard_set
