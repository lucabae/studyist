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
