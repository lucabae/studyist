"""Views de Evento. Prefijo: /evento

Al crear un evento se intenta ademas crearlo en el calendario iCloud y se
guardan el UID y la URL del VEVENT que devuelve CalDAV. Si CalDAV falla, se
loggea, uid y calendar_url quedan NULL y la fila se guarda igualmente: al
usuario se le avisa, pero no se le devuelve un error.
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from db.db import MADRID, Asignatura, Chat, Evento, Tema, get_session
from server.models import EventoCreate, EventoRead, EventoUpdate
from server.scripts import calendar

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/evento", tags=["evento"])


@router.post("", response_model=EventoRead, status_code=201)
def create_evento(payload: EventoCreate, db: Session = Depends(get_session)) -> EventoRead:
    """Crea un evento.

    Pasos: normalizar payload.fecha a Europe/Madrid aware (si llega con
    tzinfo, con astimezone; si llega sin tzinfo, interpretarla como Madrid);
    comprobar que asignatura_id existe (404 si no); validar el tema si llega
    (404 si no existe, 400 si es de otra asignatura); insertar la fila con una
    lista de Chat nueva y commit; llamar a calendar.create_event (que nunca
    lanza: devuelve (None, None) si falla) con la duracion en minutos; si
    devuelve uid, asignar uid y calendar_url a la fila y hacer commit otra vez;
    si devuelve None, loggear y devolver la fila con uid y calendar_url None
    (calendar_warning avisa al usuario).
    """
    fecha = payload.fecha
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=MADRID)
    fecha = fecha.astimezone(MADRID)

    asignatura = db.get(Asignatura, payload.asignatura_id)
    if asignatura is None:
        raise HTTPException(
            status_code=404, detail=f"No existe la asignatura {payload.asignatura_id}"
        )

    _validate_tema(db, payload.tema_id, payload.asignatura_id)

    evento = Evento(
        type=payload.type,
        asignatura_id=payload.asignatura_id,
        tema_id=payload.tema_id,
        name=payload.name,
        fecha=fecha,
        duration_minutes=payload.duration_minutes,
        chats=[Chat(**chat.model_dump()) for chat in payload.chats],
    )
    db.add(evento)
    db.commit()

    uid, calendar_url = calendar.create_event(
        name=evento.name,
        fecha=evento.fecha,
        event_type=evento.type,
        asignatura=asignatura.name,
        duration_minutes=evento.duration_minutes,
    )
    if uid is None:
        logger.warning(
            "El evento %s se guardo sin UID: no se pudo crear en el calendario", evento.id
        )
        return evento

    evento.uid = uid
    evento.calendar_url = calendar_url
    db.commit()
    return evento


@router.get("", response_model=list[EventoRead])
def list_eventos(
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = Query(None, alias="to"),
    asignatura_id: int | None = None,
    db: Session = Depends(get_session),
) -> list[EventoRead]:
    """Lista eventos, opcionalmente filtrados por rango y asignatura.

    Pasos: normalizar from y to a Europe/Madrid (si llegan naive se
    interpretan como hora de Madrid); si from es posterior a to, lanzar
    HTTPException 400; consultar los eventos filtrando por asignatura_id si
    llega; quedarse solo con los que caen dentro de [from, to] (ambos
    inclusivos) y devolver la lista ordenada por fecha ascendente y, a igual
    fecha, por id.

    El filtro por fecha se hace en Python y no en SQL a proposito: la fecha se
    guarda como texto ISO-8601 con offset y comparar ese texto falla en el
    cambio de hora (02:30+02:00 es anterior a 02:30+01:00, pero ordena al
    reves).
    """
    if from_ is not None:
        from_ = _to_madrid(from_)
    if to is not None:
        to = _to_madrid(to)
    if from_ is not None and to is not None and from_ > to:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Rango de fechas no valido: from ({from_.isoformat()}) es "
                f"posterior a to ({to.isoformat()})"
            ),
        )

    query = select(Evento).options(selectinload(Evento.tema))
    if asignatura_id is not None:
        query = query.where(Evento.asignatura_id == asignatura_id)

    eventos = list(db.scalars(query))
    if from_ is not None:
        eventos = [evento for evento in eventos if evento.fecha >= from_]
    if to is not None:
        eventos = [evento for evento in eventos if evento.fecha <= to]

    return sorted(eventos, key=lambda evento: (evento.fecha, evento.id))


def _validate_tema(
    db: Session, tema_id: int | None, asignatura_id: int
) -> None:
    """Comprueba que el tema existe y es de la asignatura del evento.

    Pasos: si tema_id es None no hay nada que validar; buscar el tema y lanzar
    404 si no existe; lanzar 400 si es de otra asignatura, porque un evento no
    puede apuntar a un tema que no es de su asignatura.

    No hay cascada: si el tema se borra, el evento se queda con tema_id NULL
    (ON DELETE SET NULL).
    """
    if tema_id is None:
        return

    tema = db.get(Tema, tema_id)
    if tema is None:
        raise HTTPException(status_code=404, detail=f"No existe el tema {tema_id}")
    if tema.asignatura_id != asignatura_id:
        raise HTTPException(
            status_code=400,
            detail="El tema del evento tiene que ser de su misma asignatura",
        )


def _to_madrid(value: datetime) -> datetime:
    """Interpreta un datetime naive como hora de Madrid y normaliza el aware.

    SQLite guarda la fecha con offset de Madrid, asi que comparar contra un
    datetime en otra zona (o sin zona) daria resultados raros: aqui todo se
    convierte a Europe/Madrid antes de filtrar.
    """
    if value.tzinfo is None:
        value = value.replace(tzinfo=MADRID)
    return value.astimezone(MADRID)


@router.get("/{evento_id}", response_model=EventoRead)
def get_evento(evento_id: int, db: Session = Depends(get_session)) -> EventoRead:
    """Devuelve un evento por id.

    Pasos: buscar por PK con chats; si no existe, lanzar HTTPException 404;
    devolverlo.
    """
    evento = db.scalar(
        select(Evento).options(selectinload(Evento.tema)).where(Evento.id == evento_id)
    )
    if evento is None:
        raise HTTPException(status_code=404, detail=f"No existe el evento {evento_id}")
    return evento


@router.put("/{evento_id}", response_model=EventoRead)
def update_evento(
    evento_id: int, payload: EventoUpdate, db: Session = Depends(get_session)
) -> EventoRead:
    """Modifica un evento. La fecha, el uid y la calendar_url no son
    modificables.

    Pasos: buscar la fila (404 si no existe); recorrer
    payload.model_dump(exclude_unset=True); descartar fecha, uid y
    calendar_url por si algun dia llegan; si llega chats, reemplazar la lista
    completa borrando las filas de chat anteriores y anadiendo las nuevas con
    evento_id; para el resto de campos, asignar el valor; commit; devolver.

    Nota: no se replica en el calendario (el proyecto es unidireccional), asi
    que cambiar nombre, tipo, asignatura, tema o duracion no toca el evento de
    iCloud.
    """
    evento = db.get(Evento, evento_id)
    if evento is None:
        raise HTTPException(status_code=404, detail=f"No existe el evento {evento_id}")

    changes = payload.model_dump(exclude_unset=True)

    # Campos inmutables: el schema EventoUpdate ya no los expone, pero se
    # descartan aqui para que un cambio futuro no reescriba la fecha ni rompa
    # el enlace con el evento remoto.
    for field in ("fecha", "uid", "calendar_url"):
        changes.pop(field, None)

    if "chats" in changes:
        chats = changes.pop("chats")
        # delete-orphan en la relacion: al sustituir la lista, SQLAlchemy borra
        # las filas de chat que ya no estan.
        evento.chats = [Chat(**chat) for chat in chats]

    if "asignatura_id" in changes:
        if db.get(Asignatura, changes["asignatura_id"]) is None:
            raise HTTPException(
                status_code=404,
                detail=f"No existe la asignatura {changes['asignatura_id']}",
            )

    # Tema resultante: el nuevo si llega, el actual si no. Tiene que cuadrar
    # con la asignatura resultante.
    if "tema_id" in changes or "asignatura_id" in changes:
        asignatura_id = changes.get("asignatura_id", evento.asignatura_id)
        tema_id = changes["tema_id"] if "tema_id" in changes else evento.tema_id
        _validate_tema(db, tema_id, asignatura_id)

    if "tema_id" in changes:
        # Se asigna la relacion, no solo la columna: asi tema_name devuelve el
        # nombre nuevo en esta misma respuesta.
        tema_id = changes.pop("tema_id")
        evento.tema = db.get(Tema, tema_id) if tema_id is not None else None

    for field, value in changes.items():
        setattr(evento, field, value)

    db.commit()
    return evento


@router.delete("/{evento_id}", status_code=204)
def delete_evento(evento_id: int, db: Session = Depends(get_session)) -> None:
    """Borra un evento.

    Pasos: buscar la fila (404 si no existe); guardar su uid y su calendar_url;
    delete + commit (los chats caen por cascada); si uid no era None, llamar a
    calendar.delete_event(uid, url) en un try/except y solo loggear si falla.
    """
    evento = db.get(Evento, evento_id)
    if evento is None:
        raise HTTPException(status_code=404, detail=f"No existe el evento {evento_id}")

    uid = evento.uid
    url = evento.calendar_url
    db.delete(evento)
    db.commit()

    if uid is not None:
        # delete_event ya no lanza: devuelve False y loggea. El try/except es
        # por si algun dia deja de cumplirlo.
        try:
            calendar.delete_event(uid, url)
        except Exception:
            logger.exception("Fallo inesperado borrando el evento remoto %s", uid)
