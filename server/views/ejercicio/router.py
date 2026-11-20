"""Views de Ejercicio. Prefijo: /ejercicio

Los ejercicios se generan en POST /study/exercise y quedan ligados a un tema.
Aqui se listan, se abren y se borran. Los de programacion se corrigen en el
navegador con Pyodide (web/src/lib/pyodide): el servidor nunca ejecuta el
codigo del usuario.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.db import Ejercicio, get_session
from server.models import EjercicioRead, EjercicioSummary

router = APIRouter(prefix="/ejercicio", tags=["ejercicio"])

@router.get("", response_model=list[EjercicioSummary])
def list_ejercicios(
    tema_id: int | None = Query(None, description="Solo los ejercicios de un tema"),
    db: Session = Depends(get_session),
) -> list[EjercicioSummary]:
    """Lista los ejercicios guardados, del mas reciente al mas antiguo.

    Pasos: seleccionar todos (o filtrar por tema_id si llega), ordenar por
    created_at descendente y devolverlos como resumen (sin solucion ni test
    cases).
    """
    stmt = select(Ejercicio)
    if tema_id is not None:
        stmt = stmt.where(Ejercicio.tema_id == tema_id)
    stmt = stmt.order_by(Ejercicio.created_at.desc(), Ejercicio.id.desc())
    return list(db.scalars(stmt))


@router.get("/{ejercicio_id}", response_model=EjercicioRead)
def get_ejercicio(
    ejercicio_id: int, db: Session = Depends(get_session)
) -> EjercicioRead:
    """Devuelve un ejercicio completo, con sus test cases.

    Pasos: buscar por PK; 404 si no existe; devolverlo.
    """
    ejercicio = db.get(Ejercicio, ejercicio_id)
    if ejercicio is None:
        raise HTTPException(
            status_code=404, detail=f"No existe el ejercicio {ejercicio_id}"
        )
    return ejercicio


@router.delete("/{ejercicio_id}", status_code=204)
def delete_ejercicio(ejercicio_id: int, db: Session = Depends(get_session)) -> None:
    """Borra un ejercicio y sus test cases.

    Pasos: buscar por PK (404); delete + commit. Los test cases caen por
    ON DELETE CASCADE.
    """
    ejercicio = db.get(Ejercicio, ejercicio_id)
    if ejercicio is None:
        raise HTTPException(
            status_code=404, detail=f"No existe el ejercicio {ejercicio_id}"
        )

    db.delete(ejercicio)
    db.commit()
