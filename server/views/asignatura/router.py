"""Views de Asignatura. Prefijo: /asignatura"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from db.db import Asignatura, get_session
from server.models import AsignaturaCreate, AsignaturaRead, AsignaturaUpdate

router = APIRouter(prefix="/asignatura", tags=["asignatura"])


@router.post("", response_model=AsignaturaRead, status_code=201)
def create_asignatura(
    payload: AsignaturaCreate, db: Session = Depends(get_session)
) -> AsignaturaRead:
    """Crea una asignatura.

    Pasos: comprobar que no existe otra con el mismo nombre (409 si ya existe,
    por el UNIQUE de la tabla); insertar; commit; devolver la fila.
    """
    existing = db.scalar(select(Asignatura).where(Asignatura.name == payload.name))
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe una asignatura llamada {payload.name!r} (id {existing.id})",
        )

    asignatura = Asignatura(**payload.model_dump())
    db.add(asignatura)
    try:
        db.commit()
    except IntegrityError:
        # Carrera entre la comprobacion y el commit: el UNIQUE decide.
        db.rollback()
        raise HTTPException(
            status_code=409, detail=f"Ya existe una asignatura llamada {payload.name!r}"
        )
    return asignatura


@router.get("", response_model=list[AsignaturaRead])
def list_asignaturas(db: Session = Depends(get_session)) -> list[AsignaturaRead]:
    """Lista todas las asignaturas con cuantos temas tiene cada una.

    Pasos: consultar ordenando por year, semester y name; cargar los temas de
    todas las asignaturas en una sola consulta extra con selectinload, para que
    tema_count no dispare una consulta por asignatura (N+1); devolver la lista.
    """
    return list(
        db.scalars(
            select(Asignatura)
            .options(selectinload(Asignatura.temas))
            .order_by(Asignatura.year, Asignatura.semester, Asignatura.name)
        )
    )


@router.get("/{asignatura_id}", response_model=AsignaturaRead)
def get_asignatura(
    asignatura_id: int, db: Session = Depends(get_session)
) -> AsignaturaRead:
    """Devuelve una asignatura por id, con cuantos temas tiene.

    Pasos: buscar por PK cargando sus temas con selectinload (tema_count los
    necesita); 404 si no existe; devolverla.
    """
    asignatura = db.scalar(
        select(Asignatura)
        .options(selectinload(Asignatura.temas))
        .where(Asignatura.id == asignatura_id)
    )
    if asignatura is None:
        raise HTTPException(
            status_code=404, detail=f"No existe la asignatura {asignatura_id}"
        )
    return asignatura


@router.put("/{asignatura_id}", response_model=AsignaturaRead)
def update_asignatura(
    asignatura_id: int, payload: AsignaturaUpdate, db: Session = Depends(get_session)
) -> AsignaturaRead:
    """Modifica una asignatura.

    Pasos: buscar la fila (404 si no existe); aplicar
    model_dump(exclude_unset=True); si se cambia el nombre, comprobar el UNIQUE
    y devolver 409 en caso de colision; commit; devolver la fila.
    """
    asignatura = db.get(Asignatura, asignatura_id)
    if asignatura is None:
        raise HTTPException(
            status_code=404, detail=f"No existe la asignatura {asignatura_id}"
        )

    changes = payload.model_dump(exclude_unset=True)
    new_name = changes.get("name")
    if new_name is not None and new_name != asignatura.name:
        clash = db.scalar(select(Asignatura).where(Asignatura.name == new_name))
        if clash is not None:
            raise HTTPException(
                status_code=409,
                detail=f"Ya existe una asignatura llamada {new_name!r} (id {clash.id})",
            )

    for field, value in changes.items():
        setattr(asignatura, field, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail=f"Ya existe una asignatura llamada {new_name!r}"
        )
    return asignatura


@router.delete("/{asignatura_id}", status_code=204)
def delete_asignatura(asignatura_id: int, db: Session = Depends(get_session)) -> None:
    """Borra una asignatura.

    Pasos: buscar la fila (404 si no existe); delete + commit. Los eventos
    (con sus chats) y los temas (con sus filas de tema_file y
    tema_flashcard_set) se borran en cascada por la FK: el engine activa
    PRAGMA foreign_keys en cada conexion.

    Los files y los flashcard_sets NO se borran: solo se pierden las
    referencias desde los temas.
    """
    asignatura = db.get(Asignatura, asignatura_id)
    if asignatura is None:
        raise HTTPException(
            status_code=404, detail=f"No existe la asignatura {asignatura_id}"
        )

    db.delete(asignatura)
    db.commit()
