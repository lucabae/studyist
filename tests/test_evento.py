"""Eventos: tema opcional (sin cascada) y duracion en minutos."""

from fastapi.testclient import TestClient

from server.views.evento import router as evento_router


def _subject(client: TestClient, name: str) -> dict:
    response = client.post(
        "/asignatura",
        json={"name": name, "year": 1, "semester": 1, "color": "6f6f6f"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _tema(client: TestClient, asignatura_id: int, name: str) -> dict:
    response = client.post(
        "/tema", json={"asignatura_id": asignatura_id, "name": name, "notes": ""}
    )
    assert response.status_code == 201, response.text
    return response.json()


def _fake_calendar(monkeypatch, calls: list[dict]) -> None:
    """Sustituye la creacion en iCloud por un mock que apunta lo recibido."""

    def fake_create_event(**kwargs):
        calls.append(kwargs)
        return ("__uid__", "https://example.test/evento.ics")

    monkeypatch.setattr(evento_router.calendar, "create_event", fake_create_event)
    monkeypatch.setattr(evento_router.calendar, "delete_event", lambda *a, **k: True)


def test_event_with_tema_and_duration(client: TestClient, monkeypatch) -> None:
    """El evento guarda el tema, su nombre y la duracion; CalDAV la recibe."""
    calls: list[dict] = []
    _fake_calendar(monkeypatch, calls)

    subject = _subject(client, "__test_evento_tema__")
    tema = _tema(client, subject["id"], "Tema 1")

    response = client.post(
        "/evento",
        json={
            "type": "Examen",
            "asignatura_id": subject["id"],
            "tema_id": tema["id"],
            "name": "Parcial",
            "fecha": "2027-02-01T09:00:00+01:00",
            "duration_minutes": 90,
            "chats": [],
        },
    )
    assert response.status_code == 201, response.text

    body = response.json()
    assert body["tema_id"] == tema["id"]
    assert body["tema_name"] == "Tema 1"
    assert body["duration_minutes"] == 90
    assert calls[0]["duration_minutes"] == 90

    listed = client.get("/evento").json()
    assert listed[0]["tema_name"] == "Tema 1"

    client.delete(f"/asignatura/{subject['id']}")


def test_duration_defaults_to_120(client: TestClient, monkeypatch) -> None:
    """Sin duracion explicita, el examen dura 120 minutos."""
    calls: list[dict] = []
    _fake_calendar(monkeypatch, calls)

    subject = _subject(client, "__test_evento_duracion__")
    response = client.post(
        "/evento",
        json={
            "type": "Examen",
            "asignatura_id": subject["id"],
            "name": "Final",
            "fecha": "2027-02-02T09:00:00+01:00",
            "chats": [],
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["duration_minutes"] == 120
    assert calls[0]["duration_minutes"] == 120

    client.delete(f"/asignatura/{subject['id']}")


def test_tema_must_belong_to_the_subject(client: TestClient, monkeypatch) -> None:
    """Un tema de otra asignatura no vale (400) y uno inexistente da 404."""
    _fake_calendar(monkeypatch, [])

    first = _subject(client, "__test_evento_a__")
    second = _subject(client, "__test_evento_b__")
    foreign = _tema(client, second["id"], "Ajeno")

    payload = {
        "type": "Examen",
        "asignatura_id": first["id"],
        "name": "Cruzado",
        "fecha": "2027-02-03T09:00:00+01:00",
        "chats": [],
    }

    crossed = client.post("/evento", json={**payload, "tema_id": foreign["id"]})
    assert crossed.status_code == 400

    missing = client.post("/evento", json={**payload, "tema_id": 999999})
    assert missing.status_code == 404

    client.delete(f"/asignatura/{first['id']}")
    client.delete(f"/asignatura/{second['id']}")


def test_deleting_tema_leaves_event_without_tema(client: TestClient, monkeypatch) -> None:
    """Borrar el tema no borra el evento: tema_id pasa a NULL."""
    _fake_calendar(monkeypatch, [])

    subject = _subject(client, "__test_evento_setnull__")
    tema = _tema(client, subject["id"], "Temporal")

    created = client.post(
        "/evento",
        json={
            "type": "Tarea",
            "asignatura_id": subject["id"],
            "tema_id": tema["id"],
            "name": "Entrega",
            "fecha": "2027-02-04T18:00:00+01:00",
            "chats": [],
        },
    ).json()

    assert client.delete(f"/tema/{tema['id']}").status_code == 204

    after = client.get(f"/evento/{created['id']}").json()
    assert after["tema_id"] is None
    assert after["tema_name"] is None
    assert after["name"] == "Entrega"

    client.delete(f"/asignatura/{subject['id']}")


def test_update_tema_and_duration(client: TestClient, monkeypatch) -> None:
    """Editar cambia tema y duracion; pasar tema_id a null lo quita."""
    _fake_calendar(monkeypatch, [])

    subject = _subject(client, "__test_evento_update__")
    first = _tema(client, subject["id"], "Primero")
    second = _tema(client, subject["id"], "Segundo")

    created = client.post(
        "/evento",
        json={
            "type": "Examen",
            "asignatura_id": subject["id"],
            "tema_id": first["id"],
            "name": "Parcial",
            "fecha": "2027-02-05T09:00:00+01:00",
            "duration_minutes": 60,
            "chats": [],
        },
    ).json()

    updated = client.put(
        f"/evento/{created['id']}",
        json={"tema_id": second["id"], "duration_minutes": 150},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["tema_id"] == second["id"]
    assert updated.json()["tema_name"] == "Segundo"
    assert updated.json()["duration_minutes"] == 150

    cleared = client.put(f"/evento/{created['id']}", json={"tema_id": None})
    assert cleared.status_code == 200
    assert cleared.json()["tema_id"] is None

    client.delete(f"/asignatura/{subject['id']}")
