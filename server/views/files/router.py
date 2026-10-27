"""Views de File. Prefijo: /files

Subida en multipart/form-data con el campo "upload". Tope de 30 MB.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from db.db import File, get_session, tema_file
from server.models import FileRead, FileUpdate
from server.scripts import files

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["files"])

# MIME types "de familia": con estos valores el filtro busca por prefijo.
MIME_PREFIXES = ("image", "text", "application")


@router.post("", response_model=FileRead, status_code=201)
def create_file(upload: UploadFile, db: Session = Depends(get_session)) -> FileRead:
    """Sube un archivo.

    Pasos: leer el contenido del UploadFile; si supera
    files.MAX_UPLOAD_BYTES, devolver 413 antes de escribir nada; calcular el
    hash con files.compute_hash y consultar si ya existe una fila con ese hash;
    si existe, devolver 409 incluyendo el id del file existente; si no, llamar
    a files.save para clasificarlo, escribirlo y generar el thumbnail; insertar
    la fila; flush para tener el id (el trigger file_fts_insert ya creo la fila
    del indice con content vacio); rellenar ese content con files.extract_text
    (texto plano o texto del PDF); commit; devolver.

    El 409 lleva el id del archivo que ya existe para que el frontend pueda
    reutilizarlo (por ejemplo, enlazarlo a un tema) sin resubir nada.
    """
    content = upload.file.read()

    if len(content) > files.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"El archivo ocupa {len(content)} bytes y el tope es "
                f"{files.MAX_UPLOAD_BYTES}"
            ),
        )

    digest = files.compute_hash(content)
    existing = db.scalar(select(File).where(File.hash == digest))
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"Ese archivo ya existe como {existing.name!r}",
                "file_id": existing.id,
            },
        )

    if not upload.filename:
        raise HTTPException(status_code=400, detail="El archivo no tiene nombre")

    metadata = files.save(upload.filename, content)
    row = File(**metadata)
    db.add(row)
    db.flush()

    db.execute(
        text("UPDATE file_fts SET content = :content WHERE rowid = :id"),
        {"content": files.extract_text(row.path, row.type), "id": row.id},
    )

    db.commit()
    return row


@router.get("", response_model=list[FileRead])
def list_files(
    q: str | None = None,
    type: str | None = None,
    tema_id: int | None = None,
    limit: int = Query(
        default=100,
        ge=1,
        le=500,
        description="Numero maximo de archivos devueltos",
    ),
    db: Session = Depends(get_session),
) -> list[FileRead]:
    """Lista archivos, con busqueda y filtros opcionales.

    Pasos: si llega q, sanearlo con _fts_query y pedir a file_fts los rowid que
    casan con MATCH, ordenados por rank; si no hay ninguno, devolver lista
    vacia; si llega type, filtrar por prefijo (image, text, application o un
    valor terminado en "/") o por igualdad exacta; si llega tema_id, unir con
    tema_file y filtrar por esa columna; ordenar por name (orden estable) y
    limitar el resultado. Los filtros se combinan entre si.

    Sin q se consulta solo la tabla file: el indice no aporta nada.
    """
    stmt = select(File)

    if q:
        match = _fts_query(q)
        if match is None:
            return []
        ids = list(
            db.scalars(
                text(
                    "SELECT rowid FROM file_fts "
                    "WHERE file_fts MATCH :q ORDER BY rank"
                ),
                {"q": match},
            )
        )
        if not ids:
            return []
        stmt = stmt.where(File.id.in_(ids))

    if type is not None:
        if type.endswith("/") or type in MIME_PREFIXES:
            stmt = stmt.where(File.type.like(f"{type}%"))
        else:
            stmt = stmt.where(File.type == type)

    if tema_id is not None:
        stmt = stmt.join(tema_file, File.id == tema_file.c.file_id).where(
            tema_file.c.tema_id == tema_id
        )

    stmt = stmt.order_by(File.name).limit(limit)
    return list(db.scalars(stmt))


@router.get("/{file_id}", response_model=FileRead)
def get_file(file_id: int, db: Session = Depends(get_session)) -> FileRead:
    """Devuelve un archivo por id.

    Pasos: buscar por PK; 404 si no existe; devolverlo.
    """
    row = db.get(File, file_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"No existe el file {file_id}")
    return row


@router.put("/{file_id}", response_model=FileRead)
def update_file(
    file_id: int, payload: FileUpdate, db: Session = Depends(get_session)
) -> FileRead:
    """Renombra un archivo.

    Pasos: buscar la fila (404 si no existe); cambiar solo la columna name.
    El path en disco no se toca.
    """
    row = db.get(File, file_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"No existe el file {file_id}")

    row.name = payload.name
    db.commit()
    return row


@router.delete("/{file_id}", status_code=204)
def delete_file(file_id: int, db: Session = Depends(get_session)) -> None:
    """Borra un archivo y todas sus referencias.

    Pasos: buscar la fila (404 si no existe); guardar path y thumbnail; borrar
    la fila y hacer commit (las filas de tema_file caen por CASCADE y las
    flashcards que lo usan como front_img/back_img pasan a NULL por SET NULL);
    y solo despues llamar a files.delete(path, thumbnail) en un try/except,
    para que un fallo de disco no deshaga el borrado en la DB.
    """
    row = db.get(File, file_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"No existe el file {file_id}")

    relative_path = row.path
    thumbnail = row.thumbnail

    db.delete(row)
    db.commit()

    try:
        files.delete(relative_path, thumbnail)
    except Exception:
        # El borrado en DB ya esta hecho: no se puede deshacer y no tiene
        # sentido devolver un error por un fichero huerfano.
        logger.exception("No se pudo borrar del disco %s", relative_path)


def _fts_query(value: str) -> str | None:
    """Convierte el texto del usuario en una consulta FTS5 segura.

    Pasos: separar por espacios; descartar los trozos vacios; envolver cada
    token en comillas dobles (duplicando las comillas internas, que es como
    FTS5 escapa dentro de una cadena entrecomillada) para que los operadores
    del usuario (OR, NEAR, *, :) se traten como texto; unir los tokens con
    " AND ". Si no queda ningun token, devolver None.
    """
    tokens = [token.replace('"', '""') for token in value.split() if token]
    if not tokens:
        return None
    return " AND ".join(f'"{token}"' for token in tokens)
