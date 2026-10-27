"""Creacion de eventos en un calendario iCloud via CalDAV.

Unidireccional: solo crea eventos. No modifica nada remoto; solo borra (por
UID) cuando se borra el evento en la app.
Si CalDAV falla, se loggea y se devuelve None/False; nunca se propaga la
excepcion a la view para no bloquear el guardado en la base de datos.
"""

import logging
import os
from datetime import datetime, timedelta

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

ICLOUD_URL = "https://caldav.icloud.com"

# Calendario donde se crean los eventos. Se puede cambiar sin tocar codigo
# con ICLOUD_CALENDAR_NAME en .env.
CALENDAR_NAME = os.getenv("ICLOUD_CALENDAR_NAME", "Studyist")


def create_event(
    name: str,
    fecha: datetime,
    event_type: str,
    asignatura: str,
    duration_minutes: int = 120,
) -> tuple[str | None, str | None]:
    """Crea el evento en el calendario y devuelve (uid, url) del VEVENT.

    Pasos: conectarse con _connect(); localizar el calendario con
    _find_calendar; construir el VEVENT con _build_vevent (que usa
    duration_minutes para la hora de fin de los examenes); guardar el evento;
    devolver el UID que asigna el servidor y la URL con la que se puede abrir
    el evento en iCloud; envolver todo en try/except y, si falla, loggear el
    error y devolver (None, None) (la view guarda uid y calendar_url NULL).

    fecha llega aware en Europe/Madrid (lo garantiza MadridDateTime en la DB).
    La view persiste ambos valores en evento.uid y evento.calendar_url.
    """
    try:
        client = _connect()
        try:
            calendar = _find_calendar(client)
            event = calendar.save_event(
                **_build_vevent(name, fecha, event_type, asignatura, duration_minutes)
            )
            uid = _event_uid(event)
            url = _event_url(event)
            logger.info("Evento %r creado en iCloud con uid %s y url %s", name, uid, url)
            return uid, url
        finally:
            client.close()
    except Exception:
        logger.exception("No se pudo crear el evento %r en el calendario", name)
        return None, None


def _event_uid(event) -> str | None:
    """Devuelve el UID del VEVENT creado, o None si no se puede leer.

    La libreria caldav 2.x exponía vobject_instance, pero desde la 3.x la
    dependencia es icalendar y ese atributo es None. Se intenta primero la via
    nueva (icalendar_component) y se deja el fallback a vobject por si algun dia
    vuelve. Cualquier fallo se traduce en None en lugar de romper la creacion.
    """
    try:
        component = event.icalendar_component
        if component is not None:
            uid = component.get("UID")
            if uid:
                return str(uid)
    except Exception:
        pass

    try:
        return str(event.vobject_instance.vevent.uid.value)
    except Exception:
        return None


def _event_url(event) -> str | None:
    """Devuelve la URL del VEVENT como str, o None si no se puede leer.

    La libreria caldav no siempre expone `url` (ni con el mismo tipo) en el
    objeto que devuelve save_event, asi que cualquier fallo se traduce en None
    en lugar de romper la creacion del evento.
    """
    try:
        url = event.url
    except Exception:
        return None
    return str(url) if url else None


def delete_event(uid: str, url: str | None = None) -> bool:
    """Borra el evento remoto a partir de su UID (o de su URL, si se conoce).

    Pasos: conectarse con _connect(); localizar el calendario con
    _find_calendar; si hay url, cargar el evento con event_by_url y borrarlo;
    si no, buscarlo por UID con event_by_uid; devolver True. Cualquier fallo de
    red se captura y devuelve False sin propagarse.

    Se prefiere la URL porque el buscador por UID de caldav 3.x falla contra
    iCloud (ReportError 412 Precondition Failed); la URL se guarda en
    evento.calendar_url desde que se crea el evento.
    """
    try:
        client = _connect()
        try:
            calendar = _find_calendar(client)
            if url:
                calendar.event_by_url(url).delete()
            else:
                calendar.event_by_uid(uid).delete()
            logger.info("Evento con uid %s borrado de iCloud", uid)
            return True
        finally:
            client.close()
    except Exception:
        logger.exception("No se pudo borrar el evento con uid %s del calendario", uid)
        return False


def _connect():
    """Abre la conexion CalDAV con iCloud.

    Pasos: leer ICLOUD_MAIL e ICLOUD_APP_PASSWORD de .env; construir el cliente
    DAVClient apuntando a https://caldav.icloud.com; llamar a principal() para
    descubrir el principal del usuario; devolver el cliente DAVClient.

    La libreria caldav se importa aqui dentro: si no esta instalada, el
    ImportError lo captura create_event/delete_event y el fallo no tumba el
    servidor.
    """
    import caldav

    user = os.getenv("ICLOUD_MAIL")
    password = os.getenv("ICLOUD_APP_PASSWORD")
    if not user or not password:
        raise RuntimeError(
            "Faltan ICLOUD_MAIL o ICLOUD_APP_PASSWORD en .env"
        )

    client = caldav.DAVClient(url=ICLOUD_URL, username=user, password=password)
    client.principal()
    return client


def _find_calendar(client):
    """Devuelve el calendario donde se crean los eventos.

    Pasos: listar los calendarios del principal; elegir el que coincida con el
    nombre configurado; si no hay ninguno que coincida, lanzar LookupError.

    El nombre se lee de ICLOUD_CALENDAR_NAME (constante del modulo).
    """
    principal = client.principal()
    for calendar in principal.calendars():
        display_name = calendar.get_display_name() or ""
        if display_name.strip().lower() == CALENDAR_NAME.strip().lower():
            return calendar
    raise LookupError(
        f"No hay ningun calendario llamado {CALENDAR_NAME!r} en iCloud"
    )


def _build_vevent(
    name: str,
    fecha: datetime,
    event_type: str,
    asignatura: str,
    duration_minutes: int = 120,
):
    """Construye el objeto de evento a guardar.

    Pasos: montar un dict con summary ("[Examen] Nombre - Asignatura"),
    dtstart igual a fecha (ya normalizada a Europe/Madrid por la view),
    dtend igual a dtstart mas duration_minutes si es Examen (120 por defecto) o
    al final del dia si es Tarea, y description con el tipo y la asignatura.
    """
    summary = f"[{event_type}] {name} - {asignatura}"
    if event_type == "Examen":
        end = fecha + timedelta(minutes=duration_minutes)
    else:
        # Tarea: ocupa el resto del dia para que se vea en el calendario.
        end = fecha.replace(hour=23, minute=59, second=0, microsecond=0)

    return {
        "summary": summary,
        "dtstart": fecha,
        "dtend": end,
        "description": f"{event_type} de {asignatura} ({duration_minutes} min)"
        if event_type == "Examen"
        else f"{event_type} de {asignatura}",
    }
