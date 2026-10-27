"""Extraccion del UID y la URL del VEVENT que devuelve CalDAV.

Regresion: caldav 3.x ya no depende de vobject, asi que vobject_instance es
None y leer el UID por ahi dejaba todos los eventos sin uid ni URL.
"""

import os
from datetime import datetime, timezone

import caldav
import pytest
from caldav.lib import vcal

from server.scripts import calendar


def _vevent(name: str = "Examen de prueba") -> str:
    """ICS completo con un VEVENT, como el que genera caldav al guardar."""
    return vcal.create_ical(
        objtype="VEVENT",
        **calendar._build_vevent(
            name, datetime(2026, 11, 3, 9, 0, tzinfo=timezone.utc), "Examen", "Mate"
        ),
    )


def _caldav_event(url: str | None = None) -> caldav.Event:
    """Evento de caldav ya cargado en memoria: no habla con la red."""
    event = caldav.Event(
        client=caldav.DAVClient(url="https://caldav.icloud.com"), data=_vevent()
    )
    if url is not None:
        event.url = url
    return event


def test_event_uid_reads_icalendar_component() -> None:
    """El UID sale del componente icalendar y coincide con el del ICS."""
    data = _vevent()
    event = caldav.Event(
        client=caldav.DAVClient(url="https://caldav.icloud.com"), data=data
    )
    uid = calendar._event_uid(event)
    assert uid
    assert uid in data.replace("\r\n ", "")


def test_event_uid_and_url_are_none_without_data() -> None:
    """Sin componente ni vobject, no se inventa nada."""

    class Empty:
        icalendar_component = None

    assert calendar._event_uid(Empty()) is None
    assert calendar._event_url(Empty()) is None


def test_create_event_returns_uid_and_url(monkeypatch) -> None:
    """create_event devuelve (uid, url) del evento que guarda el calendario."""
    saved = _caldav_event("https://caldav.icloud.com/1/calendars/x/ev.ics")

    class FakeCalendar:
        def save_event(self, **_kwargs):
            return saved

    class FakeClient:
        def close(self) -> None:
            pass

    monkeypatch.setattr(calendar, "_connect", lambda: FakeClient())
    monkeypatch.setattr(calendar, "_find_calendar", lambda _client: FakeCalendar())

    uid, url = calendar.create_event(
        "Examen de prueba",
        datetime(2026, 11, 3, 9, 0, tzinfo=timezone.utc),
        "Examen",
        "Mate",
    )

    assert uid == calendar._event_uid(saved)
    assert uid
    assert url == "https://caldav.icloud.com/1/calendars/x/ev.ics"


def test_create_event_never_raises(monkeypatch) -> None:
    """Si CalDAV falla, devuelve (None, None) en lugar de propagar."""

    def broken():
        raise RuntimeError("sin red")

    monkeypatch.setattr(calendar, "_connect", broken)

    assert calendar.create_event(
        "Examen", datetime(2026, 11, 3, 9, 0, tzinfo=timezone.utc), "Examen", "Mate"
    ) == (None, None)


def test_delete_event_prefers_url(monkeypatch) -> None:
    """Con URL guardada se borra por URL: el buscador por UID falla en iCloud."""
    calls: list[str] = []

    class FakeEvent:
        def delete(self) -> None:
            calls.append("delete")

    class FakeCalendar:
        def event_by_url(self, url: str) -> FakeEvent:
            calls.append(f"url:{url}")
            return FakeEvent()

        def event_by_uid(self, uid: str) -> FakeEvent:
            calls.append(f"uid:{uid}")
            return FakeEvent()

    class FakeClient:
        def close(self) -> None:
            pass

    monkeypatch.setattr(calendar, "_connect", lambda: FakeClient())
    monkeypatch.setattr(calendar, "_find_calendar", lambda _client: FakeCalendar())

    assert calendar.delete_event("abc", "https://example.test/abc.ics") is True
    assert calls == ["url:https://example.test/abc.ics", "delete"]

    calls.clear()
    assert calendar.delete_event("abc") is True
    assert calls == ["uid:abc", "delete"]


def test_build_vevent_uses_duration_for_exams() -> None:
    """Un examen acaba a los minutos indicados; una tarea, al final del dia."""
    start = datetime(2026, 11, 3, 9, 0, tzinfo=timezone.utc)

    examen = calendar._build_vevent("Parcial", start, "Examen", "Mate", 90)
    assert examen["dtend"] == start.replace(hour=10, minute=30)

    tarea = calendar._build_vevent("Entrega", start, "Tarea", "Mate", 90)
    assert tarea["dtend"].hour == 23
    assert tarea["dtend"].minute == 59


@pytest.mark.skipif(
    os.getenv("STUDYIST_ICLOUD_TESTS") != "1",
    reason="Prueba real contra iCloud: activar con STUDYIST_ICLOUD_TESTS=1",
)
def test_live_icloud_create_and_delete() -> None:
    """Crea un evento real en iCloud y lo borra (regresion del 2026-10).

    No se ejecuta por defecto: escribe en el calendario de verdad. Sirve para
    comprobar de punta a punta que se obtienen UID y URL y que el borrado por
    URL funciona. Deja el calendario como estaba.
    """
    start = datetime(2030, 1, 2, 9, 0, tzinfo=timezone.utc)
    name = "__studyist_test_borrar__"

    uid, url = calendar.create_event(name, start, "Examen", "Test", 90)
    assert uid, "create_event no devolvio UID"
    assert url, "create_event no devolvio URL"

    try:
        client = calendar._connect()
        try:
            cal = calendar._find_calendar(client)
            found = cal.event_by_url(url)
            assert str(found.icalendar_component.get("UID")) == uid
        finally:
            client.close()
    finally:
        assert calendar.delete_event(uid, url) is True

    client = calendar._connect()
    try:
        cal = calendar._find_calendar(client)
        with pytest.raises(Exception):
            cal.event_by_url(url).load()
    finally:
        client.close()
