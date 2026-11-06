"""Alta de tema con archivos en el mismo formulario."""

from fastapi.testclient import TestClient


def _subject(client: TestClient, name: str) -> dict:
    response = client.post(
        "/asignatura",
        json={"name": name, "year": 1, "semester": 1, "color": "6f6f6f"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_create_tema_with_files_in_one_request(client, make_file) -> None:
    """El tema nace ya enlazado a los archivos que se suben en el formulario."""
    subject = _subject(client, "__test_tema_archivos__")
    first = make_file(name="apuntes.txt", content=b"teoria")
    second = make_file(name="ejercicios.txt", content=b"practica")

    response = client.post(
        "/tema",
        json={
            "asignatura_id": subject["id"],
            "name": "Tema con archivos",
            "notes": "",
            "file_ids": [first.id, second.id],
        },
    )
    assert response.status_code == 201, response.text

    body = response.json()
    assert sorted(body["file_ids"]) == sorted([first.id, second.id])

    listed = client.get(f"/files?tema_id={body['id']}").json()
    assert sorted(file["id"] for file in listed) == sorted([first.id, second.id])

    client.delete(f"/tema/{body['id']}")
    client.delete(f"/asignatura/{subject['id']}")


def test_create_tema_with_missing_file_is_404(client) -> None:
    """Un archivo que no existe no deja crear el tema a medias."""
    subject = _subject(client, "__test_tema_archivo_malo__")

    response = client.post(
        "/tema",
        json={
            "asignatura_id": subject["id"],
            "name": "Fantasma",
            "notes": "",
            "file_ids": [999999],
        },
    )
    assert response.status_code == 404

    client.delete(f"/asignatura/{subject['id']}")


def test_tema_progress_is_limited_to_lective_pdf_pages(
    client, make_file, db_session
) -> None:
    """Los punteros del tema usan solo las páginas de PDFs no-ejercicio."""
    subject = _subject(client, "__test_tema_progreso__")
    lecture = make_file(
        name="2.3 apuntes.pdf",
        file_type="application/pdf",
        content=b"%PDF-1.4",
    )
    db_session.get(type(lecture), lecture.id).page_count = 50
    db_session.commit()
    exercise = make_file(
        name="3 ejercicio.pdf",
        file_type="application/pdf",
        content=b"%PDF-1.4-extra",
    )
    exercise_row = db_session.get(type(exercise), exercise.id)
    exercise_row.page_count = 100
    exercise_row.kind = "ejercicio"
    db_session.commit()

    created = client.post(
        "/tema",
        json={
            "asignatura_id": subject["id"],
            "name": "Tema con progreso",
            "file_ids": [lecture.id, exercise.id],
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["teacher_progress"] == 0

    updated = client.put(
        f"/tema/{created.json()['id']}",
        json={"teacher_progress": 50, "student_progress": 25},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["student_progress"] == 25

    too_far = client.put(
        f"/tema/{created.json()['id']}",
        json={"teacher_progress": 51},
    )
    assert too_far.status_code == 400
