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
    assert spaced_repetition.days_for("medium") == 2
    assert spaced_repetition.days_for("easy") == 3


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
    """Un back de 1500 caracteres se guarda entero.

    Regresion del 2026-10-27: el prompt pide explicaciones exhaustivas y el
    modelo devolvia backs de cientos de caracteres; con el limite en 500 la
    mayoria se descartaba y el set salia casi vacio.
    """
    import json

    file_row = make_file(name="tema.txt", content=b"apuntes de biologia")
    long_back = "x" * 1500
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
            {"front": "Demasiado", "back": "y" * 2500},
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


def test_from_files_keeps_a_batch_of_long_cards(client, make_file, fake_openrouter):
    """Un lote de 16 tarjetas de ~900 caracteres se guarda entero.

    Caso real del 2026-10-27: el modelo devolvio 16 tarjetas con explicaciones
    y referencias; con el limite en 500 solo sobrevivieron 2.
    """
    import json

    file_row = make_file(name="tema.txt", content=b"apuntes de seleccion optima")
    cards = [
        {"front": f"Pregunta {index}", "back": "x" * 900 + f" {index}"}
        for index in range(16)
    ]
    fake_openrouter.send_reply = json.dumps(cards, ensure_ascii=False)

    response = client.post(
        "/flashcard_set/from-files",
        json={"name": "Lote largo", "file_ids": [file_row.id], "amount": 16},
    )
    assert response.status_code == 201, response.text

    body = response.json()
    assert len(body["created"]) == 16
    assert body["discarded"] == 0


def test_study_avoids_cards_the_set_already_has(
    client, make_file, fake_openrouter
):
    """Al completar un set, el modelo recibe las tarjetas existentes y lo que
    las repite se descarta como duplicado."""
    import json

    set_id = _create_set(client, "Completado")
    _create_card(client, set_id, "¿Qué es la fotosíntesis?", "Convertir luz en energía.")
    file_row = make_file(name="tema.txt", content=b"apuntes de biologia")

    fake_openrouter.send_reply = json.dumps(
        [
            # Misma pregunta que ya existe: solo cambian mayusculas y puntuacion.
            {"front": "que es la fotosintesis", "back": "Otra respuesta."},
            {"front": "¿Dónde ocurre?", "back": "En los cloroplastos."},
        ],
        ensure_ascii=False,
    )

    response = client.post(
        "/study/flashcards",
        json={
            "flashcard_set_id": set_id,
            "file_ids": [file_row.id],
            "amount": 2,
        },
    )
    assert response.status_code == 200, response.text

    body = response.json()
    assert len(body["created"]) == 1
    assert body["duplicates"] == 1
    assert body["discarded"] == 0

    message = fake_openrouter.calls[-1]["message"]
    assert "¿Qué es la fotosíntesis?" in message
    assert "NO las repitas" in message

    stored = client.get(f"/flashcard_set/{set_id}").json()
    assert len(stored["flashcard_ids"]) == 2


def test_study_rejects_an_unknown_set(client, make_file, fake_openrouter):
    """Completar un set que no existe devuelve 404 y no llama al modelo."""
    file_row = make_file(name="tema.txt", content=b"apuntes")

    response = client.post(
        "/study/flashcards",
        json={"flashcard_set_id": 999, "file_ids": [file_row.id], "amount": 3},
    )
    assert response.status_code == 404
    assert fake_openrouter.calls == []


def _tema_with_files(client, files):
    """Crea asignatura + tema y le vincula los files indicados."""
    subject = client.post(
        "/asignatura",
        json={"name": "__test_ejercicio__", "year": 1, "semester": 1, "color": "6f6f6f"},
    )
    assert subject.status_code == 201, subject.text

    tema = client.post(
        "/tema",
        json={
            "asignatura_id": subject.json()["id"],
            "name": "Backtracking",
            "file_ids": [file.id for file in files],
        },
    )
    assert tema.status_code == 201, tema.text
    return tema.json()["id"]


def _set_kind(client, file_id, kind):
    """Cambia el tipo de documento de un archivo."""
    response = client.put(
        f"/files/{file_id}",
        json={"name": client.get(f"/files/{file_id}").json()["name"], "kind": kind},
    )
    assert response.status_code == 200, response.text


def test_exercise_uses_only_exams_and_exercises(
    client, make_file, fake_openrouter
):
    """Solo se mandan al modelo los archivos de tipo examen/ejercicio del tema."""
    import json

    examen = make_file(name="2024_enero.pdf", content=b"examen de grafos")
    ejercicio = make_file(name="hoja_ejercicios.pdf", content=b"ejercicios de grafos")
    teoria = make_file(name="tema_3.pdf", content=b"teoria de grafos")
    _set_kind(client, examen.id, "examen")
    _set_kind(client, ejercicio.id, "ejercicio")
    _set_kind(client, teoria.id, "teoria")
    tema_id = _tema_with_files(client, [examen, ejercicio, teoria])

    fake_openrouter.send_reply = json.dumps(
        {
            "statement": "Recorre el grafo.",
            "solution": "Paso 1: ...",
            "explanation": "Se aplica DFS.",
        },
        ensure_ascii=False,
    )

    response = client.post(
        "/study/exercise",
        json={"tema_id": tema_id, "instructions": "con matrices de adyacencia"},
    )
    assert response.status_code == 200, response.text

    body = response.json()
    exercise = body["exercise"]
    assert exercise["statement"] == "Recorre el grafo."
    assert exercise["solution"] == "Paso 1: ..."
    assert exercise["explanation"] == "Se aplica DFS."
    assert exercise["kind"] == "texto"
    assert exercise["test_cases"] == []
    assert sorted(body["files"]) == ["2024_enero.pdf", "hoja_ejercicios.pdf"]

    listed = client.get("/ejercicio", params={"tema_id": tema_id}).json()
    assert [item["id"] for item in listed] == [exercise["id"]]
    assert listed[0]["test_case_count"] == 0

    call = fake_openrouter.calls[-1]
    assert call["system_prompt"] == "exercises"
    assert call["model_type"] == "exercise"
    assert "Backtracking" in call["message"]
    assert "con matrices de adyacencia" in call["message"]
    assert not any("tema_3.pdf" in path for path in call["files"])


def test_programming_exercise_stores_test_cases_and_runs_code(
    client, make_file, fake_openrouter
):
    """Un ejercicio de programación guarda sus test cases y corrige el código."""
    import json

    examen = make_file(name="2024_enero.pdf", content=b"examen de bucles")
    _set_kind(client, examen.id, "examen")
    tema_id = _tema_with_files(client, [examen])

    fake_openrouter.send_reply = json.dumps(
        {
            "statement": "Suma dos enteros.",
            "solution": "def solve(a, b):\n    return a + b",
            "explanation": "Suma directa.",
            "test_cases": [
                {"args": [1, 2], "expected": 3},
                {"args": [-1, 1], "expected": 0},
            ],
        },
        ensure_ascii=False,
    )

    created = client.post(
        "/study/exercise",
        json={"tema_id": tema_id, "kind": "programacion"},
    )
    assert created.status_code == 200, created.text

    exercise = created.json()["exercise"]
    assert exercise["kind"] == "programacion"
    assert len(exercise["test_cases"]) == 2
    assert exercise["test_cases"][0]["input"] == "[1, 2]"
    assert fake_openrouter.calls[-1]["system_prompt"] == "exercises_code"

    correct = client.post(
        f"/ejercicio/{exercise['id']}/run",
        json={"code": "def solve(a, b):\n    return a + b"},
    )
    assert correct.status_code == 200, correct.text
    assert correct.json()["ok"] is True
    assert [result["passed"] for result in correct.json()["results"]] == [True, True]

    wrong = client.post(
        f"/ejercicio/{exercise['id']}/run",
        json={"code": "def solve(a, b):\n    return a - b"},
    )
    assert wrong.status_code == 200, wrong.text
    body = wrong.json()
    assert body["ok"] is False
    assert body["results"][0]["passed"] is False
    assert body["results"][0]["actual"] == -1
    assert body["results"][0]["expected"] == 3
    assert body["results"][1]["passed"] is False

    listed = client.get("/ejercicio", params={"tema_id": tema_id}).json()
    assert listed[0]["test_case_count"] == 2

    deleted = client.delete(f"/ejercicio/{exercise['id']}")
    assert deleted.status_code == 204
    assert client.get(f"/ejercicio/{exercise['id']}").status_code == 404


def test_run_rejects_text_exercises(client, make_file, fake_openrouter):
    """Un ejercicio de texto no se puede ejecutar."""
    import json

    examen = make_file(name="2024_enero.pdf", content=b"examen")
    _set_kind(client, examen.id, "examen")
    tema_id = _tema_with_files(client, [examen])
    fake_openrouter.send_reply = json.dumps(
        {"statement": "Explica X.", "solution": "X es...", "explanation": "..."}
    )

    created = client.post("/study/exercise", json={"tema_id": tema_id})
    exercise_id = created.json()["exercise"]["id"]

    response = client.post(
        f"/ejercicio/{exercise_id}/run", json={"code": "def solve(): pass"}
    )
    assert response.status_code == 400


def test_exercise_without_exams_or_exercises_returns_400(
    client, make_file, fake_openrouter
):
    """Un tema sin archivos de examen/ejercicio no llama al modelo."""
    teoria = make_file(name="tema_3.pdf", content=b"teoria")
    _set_kind(client, teoria.id, "teoria")
    tema_id = _tema_with_files(client, [teoria])

    response = client.post("/study/exercise", json={"tema_id": tema_id})
    assert response.status_code == 400
    assert "ejercicio o examen" in response.json()["detail"]
    assert fake_openrouter.calls == []


def test_exercise_rejects_unknown_topic(client, fake_openrouter):
    """Un tema inexistente devuelve 404."""
    response = client.post("/study/exercise", json={"tema_id": 999})
    assert response.status_code == 404
    assert fake_openrouter.calls == []
