"""Views de Tema. Prefijo: /tema"""

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from db.db import Asignatura, File, FlashcardSet, Tema, get_session
from server.models import TemaCreate, TemaRead, TemaUpdate

router = APIRouter(prefix="/tema", tags=["tema"])


@router.post("", response_model=TemaRead, status_code=201)
def create_tema(payload: TemaCreate, db: Session = Depends(get_session)) -> TemaRead:
    """Crea un tema con sus relaciones.

    Pasos: comprobar que asignatura_id existe (404 si no); validar el tema
    padre, si llega (existe, es de la misma asignatura); comprobar que todos
    los file_ids y flashcard_set_ids existen (404 con la lista de ids que
    faltan); insertar la fila; insertar las filas de tema_file y
    tema_flashcard_set; commit; devolver el tema con las listas rellenas.

    Las filas de las tablas intermedias las escribe SQLAlchemy al asignar las
    relaciones (tema.files / tema.flashcard_sets), no un INSERT manual.
    """
    if db.get(Asignatura, payload.asignatura_id) is None:
        raise HTTPException(
            status_code=404,
            detail=f"No existe la asignatura {payload.asignatura_id}",
        )

    _validate_parent(db, payload.parent_id, payload.asignatura_id)
    files = _get_files_or_404(payload.file_ids, db)
    sets = _get_sets_or_404(payload.flashcard_set_ids, db)

    tema = Tema(
        asignatura_id=payload.asignatura_id,
        parent_id=payload.parent_id,
        name=payload.name,
        notes=payload.notes,
    )
    tema.files = files
    tema.flashcard_sets = sets

    db.add(tema)
    db.commit()
    return tema


@router.get("", response_model=list[TemaRead])
def list_temas(
    asignatura_id: int | None = None, db: Session = Depends(get_session)
) -> list[TemaRead]:
    """Lista todos los temas, con filtro opcional por asignatura.

    Pasos: consultar los temas (con where por asignatura_id si llega) con sus
    relaciones; ordenar en Python por asignatura_id y por orden natural del
    nombre; devolver la lista.

    El orden es natural, no alfabetico puro: se parte el nombre por los tramos
    numericos, de forma que "Tema 2" va antes que "Tema 10". Se hace en Python
    porque SQLite no tiene una funcion para esto y el volumen es minimo. El
    filtro va en SQL y el orden se aplica despues, sobre lo ya filtrado.

    La lista es plana: cada tema trae parent_id y child_ids, y el arbol se
    monta en el cliente.
    """
    query = select(Tema).options(selectinload(Tema.children))
    if asignatura_id is not None:
        query = query.where(Tema.asignatura_id == asignatura_id)

    temas = list(db.scalars(query))
    temas.sort(key=lambda tema: (tema.asignatura_id, _natural_key(tema.name)))
    return temas


@router.get("/{tema_id}", response_model=TemaRead)
def get_tema(tema_id: int, db: Session = Depends(get_session)) -> TemaRead:
    """Devuelve un tema por id.

    Pasos: buscar por PK con sus relaciones; 404 si no existe; devolverlo.
    """
    tema = db.scalar(
        select(Tema).options(selectinload(Tema.children)).where(Tema.id == tema_id)
    )
    if tema is None:
        raise HTTPException(status_code=404, detail=f"No existe el tema {tema_id}")
    return tema


@router.put("/{tema_id}", response_model=TemaRead)
def update_tema(
    tema_id: int, payload: TemaUpdate, db: Session = Depends(get_session)
) -> TemaRead:
    """Modifica un tema.

    Pasos: buscar la fila (404 si no existe); calcular la asignatura y el padre
    resultantes (los nuevos si llegan, los actuales si no); validar el padre
    (existe, misma asignatura y sin ciclos); aplicar los campos simples que
    lleguen; si llega file_ids, borrar las filas de tema_file del tema e
    insertar las nuevas; lo mismo con flashcard_set_ids; commit; devolver.

    Mover un tema de sitio no toca sus hijos: solo cambia parent_id. Pasar
    parent_id a null lo devuelve a la raiz.
    """
    tema = db.get(Tema, tema_id)
    if tema is None:
        raise HTTPException(status_code=404, detail=f"No existe el tema {tema_id}")

    changes = payload.model_dump(exclude_unset=True)

    if "file_ids" in changes:
        tema.files = _get_files_or_404(changes.pop("file_ids"), db)
    if "flashcard_set_ids" in changes:
        tema.flashcard_sets = _get_sets_or_404(changes.pop("flashcard_set_ids"), db)

    asignatura_id = changes.get("asignatura_id", tema.asignatura_id)
    if "asignatura_id" in changes:
        if db.get(Asignatura, asignatura_id) is None:
            raise HTTPException(
                status_code=404,
                detail=f"No existe la asignatura {asignatura_id}",
            )

    parent_id = changes["parent_id"] if "parent_id" in changes else tema.parent_id
    _validate_parent(db, parent_id, asignatura_id, tema=tema)

    for field, value in changes.items():
        setattr(tema, field, value)

    db.commit()
    return tema


@router.delete("/{tema_id}", status_code=204)
def delete_tema(tema_id: int, db: Session = Depends(get_session)) -> None:
    """Borra un tema y, en cascada, sus temas hijos.

    Pasos: buscar la fila (404 si no existe); delete + commit. La FK de tema
    tiene ON DELETE CASCADE, asi que los hijos (y los nietos) caen con el; las
    filas de las tablas intermedias tambien. Los files y los sets no se borran.
    """
    tema = db.get(Tema, tema_id)
    if tema is None:
        raise HTTPException(status_code=404, detail=f"No existe el tema {tema_id}")

    db.delete(tema)
    db.commit()


def _validate_parent(
    db: Session,
    parent_id: int | None,
    asignatura_id: int,
    tema: Tema | None = None,
) -> None:
    """Comprueba que el tema padre es valido para la asignatura indicada.

    Pasos: si parent_id es None no hay nada que comprobar; buscar el padre y
    lanzar 404 si no existe; rechazar con 400 si es de otra asignatura, si es
    el propio tema o si es un descendiente suyo (eso cerraria un ciclo,
    subiendo por parent_id desde el padre).

    tema es el tema que se esta editando (None al crear): hace falta para
    detectar ciclos.
    """
    if parent_id is None:
        return

    parent = db.get(Tema, parent_id)
    if parent is None:
        raise HTTPException(
            status_code=404, detail=f"No existe el tema padre {parent_id}"
        )

    if parent.asignatura_id != asignatura_id:
        raise HTTPException(
            status_code=400,
            detail="El tema padre tiene que ser de la misma asignatura",
        )

    if tema is None:
        return

    if parent.id == tema.id:
        raise HTTPException(status_code=400, detail="Un tema no puede ser su propio padre")

    seen: set[int] = set()
    node: Tema | None = parent
    while node is not None and node.id not in seen:
        if node.id == tema.id:
            raise HTTPException(
                status_code=400,
                detail="No se puede mover un tema dentro de uno de sus hijos",
            )
        seen.add(node.id)
        node = node.parent if node.parent_id is not None else None


def _get_files_or_404(file_ids: list[int], db: Session) -> list[File]:
    """Devuelve las filas de file pedidas o lanza 404 con las que faltan.

    Pasos: consultar los file con id en file_ids; comparar los ids encontrados
    con los pedidos; si falta alguno, lanzar HTTPException 404 con la lista de
    ids que no existen; devolver las filas.
    """
    unique_ids = list(dict.fromkeys(file_ids))
    if not unique_ids:
        return []

    files = list(db.scalars(select(File).where(File.id.in_(unique_ids))))
    missing = [file_id for file_id in unique_ids if file_id not in {f.id for f in files}]
    if missing:
        raise HTTPException(status_code=404, detail=f"No existen los files {missing}")
    return files


def _get_sets_or_404(set_ids: list[int], db: Session) -> list[FlashcardSet]:
    """Devuelve los flashcard_set pedidos o lanza 404 con los que faltan.

    Pasos: consultar los sets con id en set_ids; comparar los ids encontrados
    con los pedidos; si falta alguno, lanzar HTTPException 404 con la lista de
    ids que no existen; devolver las filas.
    """
    unique_ids = list(dict.fromkeys(set_ids))
    if not unique_ids:
        return []

    sets = list(db.scalars(select(FlashcardSet).where(FlashcardSet.id.in_(unique_ids))))
    missing = [set_id for set_id in unique_ids if set_id not in {s.id for s in sets}]
    if missing:
        raise HTTPException(
            status_code=404, detail=f"No existen los flashcard sets {missing}"
        )
    return sets


def _natural_key(name: str) -> list:
    """Clave de orden natural para un nombre.

    Pasos: partir el nombre en tramos de digitos y de no-digitos con
    re.split(r"(\\d+)", name); convertir los tramos numericos a int y el resto
    a minusculas; devolver la lista resultante, que Python compara elemento a
    elemento.

    Ejemplo: "Tema 2" -> ["tema ", 2, ""] y "Tema 10" -> ["tema ", 10, ""], asi
    que 2 < 10.
    """
    return [
        int(part) if part.isdigit() else part.lower()
        for part in re.split(r"(\d+)", name)
    ]
