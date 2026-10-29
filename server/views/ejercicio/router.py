"""Views de Ejercicio. Prefijo: /ejercicio

Los ejercicios se generan en POST /study/exercise y quedan ligados a un tema.
Aqui se listan, se abren, se borran y se corrigen los de programacion: el codigo
del usuario se ejecuta en un subproceso con timeout (ver
server/scripts/python_runner.py).
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.db import Ejercicio, get_session
from server.models import (
    EjercicioRead,
    EjercicioSummary,
    RunExerciseRequest,
    RunExerciseResponse,
)
from server.scripts import python_runner

router = APIRouter(prefix="/ejercicio", tags=["ejercicio"])

# La ejecucion de codigo arbitrario esta desactivada: el runner solo aisla
# imports y tiempo, y cualquier fallo de auth o XSS daria ejecucion de codigo
# con acceso a .env, la DB y la red. Se deja el codigo y el flag para volver a
# activarlo cuando haya una sandbox de verdad.
EXERCISE_RUN_ENABLED = False


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


@router.post("/{ejercicio_id}/run", response_model=RunExerciseResponse)
def run_ejercicio(
    ejercicio_id: int,
    payload: RunExerciseRequest,
    db: Session = Depends(get_session),
) -> RunExerciseResponse:
    """Ejecuta el codigo del usuario contra los test cases del ejercicio.

    Pasos: si EXERCISE_RUN_ENABLED es False, devolver 403 sin ejecutar nada;
    buscar el ejercicio (404); 400 si no es de programacion; montar la lista de
    casos con input/expected tal cual estan guardados; llamar a
    python_runner.run_tests (subproceso aislado con timeout); devolver ok,
    detalle por caso y error global. Un caso con input mal guardado se traduce
    a 400.

    El codigo es arbitrario: se ejecuta en la maquina local. Ver el aviso del
    runner.
    """
    if not EXERCISE_RUN_ENABLED:
        raise HTTPException(
            status_code=403,
            detail="La ejecución de código está desactivada.",
        )

    ejercicio = db.get(Ejercicio, ejercicio_id)
    if ejercicio is None:
        raise HTTPException(
            status_code=404, detail=f"No existe el ejercicio {ejercicio_id}"
        )

    if ejercicio.kind != "programacion":
        raise HTTPException(
            status_code=400,
            detail="Este ejercicio es de texto: no tiene test cases que ejecutar",
        )

    cases = [
        {
            "position": case.position,
            "input": case.input,
            "expected": case.expected,
        }
        for case in ejercicio.test_cases
    ]

    try:
        outcome = python_runner.run_tests(payload.code, cases)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return RunExerciseResponse(**outcome)
