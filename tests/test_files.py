"""Regresion de /files: FTS, dedupe por hash, tope de subida y borrado."""

from sqlalchemy import text

MAX_UPLOAD_BYTES = 30 * 1024 * 1024


def _upload(client, name, content):
    """Sube un .txt por multipart/form-data."""
    return client.post("/files", files={"upload": (name, content, "text/plain")})


def test_upload_indexes_content_and_search_finds_it(client, db_session):
    """Un .txt queda indexado en file_fts y sale en GET /files?q= y con type."""
    content = "La fotosintesis ocurre en los cloroplastos de la celula.".encode()

    response = _upload(client, "apuntes.txt", content)
    assert response.status_code == 201

    uploaded = response.json()
    assert uploaded["type"] == "text/plain"
    assert uploaded["path"] == "texts/apuntes.txt"
    assert uploaded["size"] == len(content)

    indexed = db_session.execute(
        text("SELECT name, content FROM file_fts WHERE rowid = :id"),
        {"id": uploaded["id"]},
    ).one()
    assert indexed.name == "apuntes.txt"
    assert "cloroplastos" in indexed.content

    found = client.get("/files", params={"q": "cloroplastos"})
    assert found.status_code == 200
    assert [item["id"] for item in found.json()] == [uploaded["id"]]

    text_type = client.get("/files", params={"type": "text"}).json()
    assert [item["id"] for item in text_type] == [uploaded["id"]]

    pdf_type = client.get("/files", params={"type": "application/pdf"}).json()
    assert pdf_type == []


def test_duplicate_content_returns_409_with_existing_id(client):
    """Subir dos veces el mismo contenido devuelve el id del archivo existente."""
    content = b"contenido repetido"

    first = _upload(client, "original.txt", content)
    assert first.status_code == 201

    second = _upload(client, "copia.txt", content)
    assert second.status_code == 409
    assert second.json()["detail"]["file_id"] == first.json()["id"]

    assert len(client.get("/files").json()) == 1


def test_upload_over_30_mb_returns_413(client, files_root):
    """Un archivo de mas de 30 MB se rechaza antes de escribir nada."""
    oversized = b"x" * (MAX_UPLOAD_BYTES + 1)

    response = _upload(client, "grande.txt", oversized)
    assert response.status_code == 413

    assert client.get("/files").json() == []
    assert list((files_root / "texts").iterdir()) == []


def test_rename_updates_index_and_delete_cleans_rows(client, db_session, files_root):
    """Renombrar reindexa el nombre; borrar limpia file, file_fts y disco."""
    uploaded = _upload(client, "apuntes.txt", b"contenido de biologia").json()

    renamed = client.put(
        f"/files/{uploaded['id']}", json={"name": "renombrado.txt"}
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "renombrado.txt"

    by_new_name = client.get("/files", params={"q": "renombrado"}).json()
    assert [item["id"] for item in by_new_name] == [uploaded["id"]]
    assert client.get("/files", params={"q": "apuntes"}).json() == []

    deleted = client.delete(f"/files/{uploaded['id']}")
    assert deleted.status_code == 204

    assert client.get(f"/files/{uploaded['id']}").status_code == 404
    assert not (files_root / uploaded["path"]).exists()

    remaining_fts = db_session.execute(
        text("SELECT COUNT(*) FROM file_fts WHERE rowid = :id"),
        {"id": uploaded["id"]},
    ).scalar_one()
    assert remaining_fts == 0
