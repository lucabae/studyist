"""Regresion de flashcards: intervalos, repaso y generacion desde documentos."""

from datetime import datetime, timedelta

import pytest
from sqlalchemy import text

from db.db import MADRID
from server.scripts import spaced_repetition


def _create_set(client, name="Biologia"):
    """Crea un set y devuelve su id."""
    response = client.post("/flashcard_set", json={"name": name})
    assert response.status_code == 201
    return response.json()["id"]


def _create_card(client, set_id, front, back="respuesta"):
    """Crea una tarjeta en el set y devuelve su id."""
    response = client.post(
        "/flashcard",
        json={"flashcard_set_id": set_id, "front": front, "back": back},
    )
    assert response.status_code == 201
    return response.json()["id"]


def _force_last_seen(db_session, card_id, last_seen, difficulty):
    """Escribe last_seen/difficulty a mano para simular el paso del tiempo."""
    db_session.execute(
        text(
            "UPDATE flashcard SET last_seen = :last_seen, difficulty = :difficulty "
            "WHERE id = :id"
        ),
        {
            "last_seen": last_seen.isoformat(),
            "difficulty": difficulty,
            "id": card_id,
        },
    )
    db_session.commit()


def test_days_for_known_difficulties():
    """Cada dificultad tiene su intervalo fijo."""
    assert spaced_repetition.days_for("hard") == 1
    assert spaced_repetition.days_for("medium") == 3
    assert spaced_repetition.days_for("easy") == 7


def test_days_for_unknown_difficulty_raises():
    """Una dificultad desconocida es un ValueError."""
    with pytest.raises(ValueError):
        spaced_repetition.days_for("imposible")


def test_is_due_rules():
    """Nunca vista toca hoy; easy de hace 8 dias si; hard de hace 2 horas no."""
    now = datetime.now(MADRID)

    assert spaced_repetition.is_due(None, "medium", now) is True
    assert spaced_repetition.is_due(now - timedelta(days=8), "easy", now) is True
    assert spaced_repetition.is_due(now - timedelta(hours=2), "hard", now) is False


def test_set_review_excludes_recent_hard(client, db_session):
    """El repaso del set deja fuera la hard reciente y con all=true las da todas."""
    set_id = _create_set(client)
    hard_id = _create_card(client, set_id, "hard reciente")
    old_id = _create_card(client, set_id, "easy antigua")
    fresh_id = _create_card(client, set_id, "nunca vista")

    seen = client.post(f"/flashcard/{hard_id}/seen", json={"difficulty": "hard"})
    assert seen.status_code == 200

    now = datetime.now(MADRID)
    _force_last_seen(db_session, old_id, now - timedelta(days=8), "easy")

    due = client.get(f"/flashcard_set/{set_id}/review")
    assert due.status_code == 200
    assert {card["id"] for card in due.json()} == {old_id, fresh_id}

    every_card = client.get(f"/flashcard_set/{set_id}/review", params={"all": "true"})
    assert every_card.status_code == 200
    assert {card["id"] for card in every_card.json()} == {hard_id, old_id, fresh_id}


def test_global_review_respects_limit(client):
    """GET /flashcard/review corta la lista en limit."""
    set_id = _create_set(client)
    for index in range(5):
        _create_card(client, set_id, f"pregunta {index}")

    three = client.get("/flashcard/review", params={"limit": 3})
    assert three.status_code == 200
    assert len(three.json()) == 3

    everything = client.get("/flashcard/review", params={"limit": 20})
    assert len(everything.json()) == 5


def test_seen_updates_last_seen_and_difficulty(client, db_session):
    """POST /flashcard/{id}/seen guarda la fecha actual y la dificultad."""
    set_id = _create_set(client)
    card_id = _create_card(client, set_id, "pregunta")

    response = client.post(f"/flashcard/{card_id}/seen", json={"difficulty": "easy"})
    assert response.status_code == 200

    body = response.json()
    assert body["difficulty"] == "easy"
    assert body["last_seen"] is not None

    stored = db_session.execute(
        text("SELECT difficulty, last_seen FROM flashcard WHERE id = :id"),
        {"id": card_id},
    ).one()
    assert stored.difficulty == "easy"
    assert stored.last_seen is not None


def test_from_files_translates_qualitative_amount(client, make_file, fake_openrouter):
    """amount="pocas" pide 5 tarjetas al modelo y crea el set con las devueltas."""
    file_row = make_file(name="tema.txt", content=b"apuntes de biologia")

    response = client.post(
        "/flashcard_set/from-files",
        json={"name": "Generado", "file_ids": [file_row.id], "amount": "pocas"},
    )
    assert response.status_code == 201

    body = response.json()
    assert len(body["created"]) == 3
    assert body["discarded"] == 0
    assert body["set"]["name"] == "Generado"
    assert "5" in fake_openrouter.calls[-1]["message"]

    stored = client.get(f"/flashcard_set/{body['set']['id']}")
    assert stored.status_code == 200
    assert len(stored.json()["flashcard_ids"]) == 3


def test_from_files_model_failure_leaves_no_set(client, make_file, fake_openrouter):
    """Si el modelo falla se devuelve 502 y el set vacio no se commitea."""
    file_row = make_file(name="tema.txt", content=b"apuntes de biologia")
    fake_openrouter.send_error = RuntimeError("modelo caido")

    response = client.post(
        "/flashcard_set/from-files",
        json={"name": "Huerfano", "file_ids": [file_row.id], "amount": 3},
    )
    assert response.status_code == 502
    assert client.get("/flashcard_set").json() == []


def test_from_files_passes_the_user_comment_to_the_model(
    client, make_file, fake_openrouter
):
    """El comentario del formulario viaja en el mensaje que recibe el modelo."""
    file_row = make_file(name="tema.txt", content=b"apuntes de biologia")

    response = client.post(
        "/flashcard_set/from-files",
        json={
            "name": "Con comentario",
            "file_ids": [file_row.id],
            "amount": 4,
            "instructions": "céntrate en los teoremas",
        },
    )
    assert response.status_code == 201

    message = fake_openrouter.calls[-1]["message"]
    assert "4" in message
    assert "céntrate en los teoremas" in message


def test_from_files_accepts_a_long_back(client, make_file, fake_openrouter):
    """Una respuesta de 400 caracteres se guarda y se devuelve entera.

    Regresion del 2026-10-27: el modelo devolvia backs de mas de 200
    caracteres, la validacion de la respuesta fallaba con 500 despues de
    haber creado el set, y el usuario veia «Load failed» con tarjetas
    huerfanas en la base de datos.
    """
    import json

    file_row = make_file(name="tema.txt", content=b"apuntes de biologia")
    long_back = "x" * 400
    fake_openrouter.send_reply = json.dumps(
        [{"front": "Pregunta larga", "back": long_back}], ensure_ascii=False
    )

    response = client.post(
        "/flashcard_set/from-files",
        json={"name": "Largas", "file_ids": [file_row.id], "amount": 1},
    )
    assert response.status_code == 201, response.text

    body = response.json()
    assert len(body["created"]) == 1
    assert body["created"][0]["back"] == long_back

    stored = client.get(f"/flashcard_set/{body['set']['id']}").json()
    assert len(stored["flashcard_ids"]) == 1


def test_from_files_drops_cards_over_the_limit(client, make_file, fake_openrouter):
    """Lo que pasa del limite se descarta, sin dejar el set a medias."""
    import json

    file_row = make_file(name="tema.txt", content=b"apuntes de biologia")
    fake_openrouter.send_reply = json.dumps(
        [
            {"front": "Vale", "back": "corta"},
            {"front": "Demasiado", "back": "y" * 600},
        ]
    )

    response = client.post(
        "/flashcard_set/from-files",
        json={"name": "Mixto", "file_ids": [file_row.id], "amount": 2},
    )
    assert response.status_code == 201, response.text

    body = response.json()
    assert len(body["created"]) == 1
    assert body["discarded"] == 1
