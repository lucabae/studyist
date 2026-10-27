"""Views de Flashcard. Prefijo: /flashcard

Una flashcard pertenece a un unico Flashcard Set.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.db import MADRID, File, Flashcard, FlashcardSet, get_session
from server.models import FlashcardCreate, FlashcardRead, FlashcardSeen, FlashcardUpdate
from server.scripts import spaced_repetition

router = APIRouter(prefix="/flashcard", tags=["flashcard"])


@router.post("", response_model=FlashcardRead, status_code=201)
def create_flashcard(
    payload: FlashcardCreate, db: Session = Depends(get_session)
) -> FlashcardRead:
    """Crea una flashcard dentro de un set.

    Pasos: comprobar que flashcard_set_id existe (404 si no); comprobar que
    front_img_id y back_img_id existen si no son None (404); insertar con
    last_seen a None y difficulty "medium"; commit; devolver.
    """
    if db.get(FlashcardSet, payload.flashcard_set_id) is None:
        raise HTTPException(
            status_code=404,
            detail=f"No existe el flashcard set {payload.flashcard_set_id}",
        )

    _check_images_exist(payload.front_img_id, payload.back_img_id, db)

    flashcard = Flashcard(
        flashcard_set_id=payload.flashcard_set_id,
        front=payload.front,
        back=payload.back,
        front_img_id=payload.front_img_id,
        back_img_id=payload.back_img_id,
        last_seen=None,
        difficulty="medium",
    )
    db.add(flashcard)
    db.commit()
    return flashcard


@router.get("", response_model=list[FlashcardRead])
def list_flashcards(db: Session = Depends(get_session)) -> list[FlashcardRead]:
    """Lista todas las flashcards.

    Pasos: consultar ordenando por id; devolver la lista.
    """
    return list(db.scalars(select(Flashcard).order_by(Flashcard.id)))


@router.get("/review", response_model=list[FlashcardRead])
def review_flashcards(
    limit: int = Query(20, ge=1, le=200),
    set_ids: list[int] | None = Query(
        None, description="Limita el repaso a estos sets; vacio = todos"
    ),
    db: Session = Depends(get_session),
) -> list[FlashcardRead]:
    """Devuelve las tarjetas que toca repasar hoy (test global).

    Pasos: consultar las flashcards (de todos los sets, o solo de set_ids si
    llega); quedarse con las que cumplen spaced_repetition.is_due; ordenarlas
    con order_due (nunca vistas primero, luego por next_review ascendente y por
    id); cortar en limit.

    La ruta se declara antes de /{flashcard_id} para que FastAPI no interprete
    "review" como un id.
    """
    stmt = select(Flashcard)
    if set_ids:
        stmt = stmt.where(Flashcard.flashcard_set_id.in_(set_ids))

    due = [
        flashcard
        for flashcard in db.scalars(stmt)
        if spaced_repetition.is_due(flashcard.last_seen, flashcard.difficulty)
    ]
    return spaced_repetition.order_due(due)[:limit]


@router.get("/{flashcard_id}", response_model=FlashcardRead)
def get_flashcard(flashcard_id: int, db: Session = Depends(get_session)) -> FlashcardRead:
    """Devuelve una flashcard por id.

    Pasos: buscar por PK; 404 si no existe; devolverla.
    """
    flashcard = db.get(Flashcard, flashcard_id)
    if flashcard is None:
        raise HTTPException(
            status_code=404, detail=f"No existe la flashcard {flashcard_id}"
        )
    return flashcard


@router.put("/{flashcard_id}", response_model=FlashcardRead)
def update_flashcard(
    flashcard_id: int, payload: FlashcardUpdate, db: Session = Depends(get_session)
) -> FlashcardRead:
    """Modifica front, back o las imagenes de una flashcard.

    Pasos: buscar la fila (404 si no existe); aplicar
    model_dump(exclude_unset=True); validar que las imagenes existan si no son
    None; commit; devolver.

    Nota: el set no se cambia aqui; para mover una tarjeta de set se usa
    POST /flashcard_set/{id}/flashcards.
    """
    flashcard = db.get(Flashcard, flashcard_id)
    if flashcard is None:
        raise HTTPException(
            status_code=404, detail=f"No existe la flashcard {flashcard_id}"
        )

    changes = payload.model_dump(exclude_unset=True)

    # Los campos no enviados no se tocan; los enviados como None se limpian.
    if "front_img_id" in changes or "back_img_id" in changes:
        _check_images_exist(
            changes.get("front_img_id", flashcard.front_img_id),
            changes.get("back_img_id", flashcard.back_img_id),
            db,
        )

    for field, value in changes.items():
        setattr(flashcard, field, value)

    db.commit()
    return flashcard


@router.delete("/{flashcard_id}", status_code=204)
def delete_flashcard(flashcard_id: int, db: Session = Depends(get_session)) -> None:
    """Borra una flashcard.

    Pasos: buscar la fila (404 si no existe); delete + commit. Los files de sus
    imagenes no se tocan.
    """
    flashcard = db.get(Flashcard, flashcard_id)
    if flashcard is None:
        raise HTTPException(
            status_code=404, detail=f"No existe la flashcard {flashcard_id}"
        )

    db.delete(flashcard)
    db.commit()


@router.post("/{flashcard_id}/seen", response_model=FlashcardRead)
def mark_seen(
    flashcard_id: int, payload: FlashcardSeen, db: Session = Depends(get_session)
) -> FlashcardRead:
    """Registra que el usuario ha repasado la tarjeta.

    Pasos: buscar la fila (404 si no existe); asignar last_seen a
    datetime.now(MADRID) (aware, Europe/Madrid) y difficulty al valor
    recibido; commit; devolver la tarjeta.

    TODO abierto: aqui deberia reajustarse el intervalo de repaso, pero el
    algoritmo no esta definido todavia. De momento solo se registra.
    """
    flashcard = db.get(Flashcard, flashcard_id)
    if flashcard is None:
        raise HTTPException(
            status_code=404, detail=f"No existe la flashcard {flashcard_id}"
        )

    flashcard.last_seen = datetime.now(MADRID)
    flashcard.difficulty = payload.difficulty
    db.commit()
    return flashcard


def _check_images_exist(
    front_img_id: int | None, back_img_id: int | None, db: Session
) -> None:
    """Comprueba que los file referenciados existen.

    Pasos: reunir los ids no nulos de front_img_id y back_img_id; consultar los
    file con esos ids; si falta alguno, lanzar HTTPException 404 nombrando el
    id que no existe.
    """
    for label, file_id in (("front_img_id", front_img_id), ("back_img_id", back_img_id)):
        if file_id is not None and db.get(File, file_id) is None:
            raise HTTPException(
                status_code=404, detail=f"{label} apunta al file {file_id}, que no existe"
            )
