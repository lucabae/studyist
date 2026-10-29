"""Regresion de /files: imagenes/PDF, dedupe, tope de subida y borrado."""

import base64

from sqlalchemy import text

MAX_UPLOAD_BYTES = 30 * 1024 * 1024

# PNG 1x1 valido: Pillow lo verifica como imagen real.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _upload(client, name="apuntes.png", content=PNG, mime="image/png", kind=None):
    """Sube un archivo por multipart/form-data."""
    data = {"kind": kind} if kind is not None else None
    return client.post("/files", files={"upload": (name, content, mime)}, data=data)


def test_upload_saves_image_and_search_finds_it_by_name(client, db_session):
    """Una imagen queda guardada en /images y se busca por nombre."""
    response = _upload(client, "apuntes.png")
    assert response.status_code == 201

    uploaded = response.json()
    assert uploaded["type"] == "image/png"
    assert uploaded["path"] == "images/apuntes.png"
    assert uploaded["size"] == len(PNG)

    indexed = db_session.execute(
        text("SELECT name, content FROM file_fts WHERE rowid = :id"),
        {"id": uploaded["id"]},
    ).one()
    assert indexed.name == "apuntes.png"
    # Las imagenes no tienen texto extraible: solo se buscan por nombre.
    assert indexed.content == ""

    found = client.get("/files", params={"q": "apuntes"})
    assert found.status_code == 200
    assert [item["id"] for item in found.json()] == [uploaded["id"]]

    image_type = client.get("/files", params={"type": "image"}).json()
    assert [item["id"] for item in image_type] == [uploaded["id"]]

    pdf_type = client.get("/files", params={"type": "application/pdf"}).json()
    assert pdf_type == []


def test_upload_accepts_a_pdf(client):
    """Un PDF con cabecera valida se guarda en /pdfs aunque no tenga texto."""
    response = _upload(
        client,
        "examen.pdf",
        b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n",
        "application/pdf",
    )
    assert response.status_code == 201
    assert response.json()["path"] == "pdfs/examen.pdf"
    assert response.json()["type"] == "application/pdf"


def test_upload_rejects_anything_that_is_not_image_or_pdf(client, files_root):
    """Texto, HTML, SVG y un .png con HTML dentro se rechazan con 415."""
    rechazados = [
        ("notas.txt", b"texto plano", "text/plain"),
        ("pagina.html", b"<html><script>alert(1)</script></html>", "text/html"),
        (
            "dibujo.svg",
            b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            "image/svg+xml",
        ),
        ("falsa.png", b"<html><script>alert(1)</script></html>", "image/png"),
    ]

    for name, content, mime in rechazados:
        response = _upload(client, name, content, mime)
        assert response.status_code == 415, name
        assert response.json()["detail"] == "Solo se admiten imágenes o PDF."

    assert client.get("/files").json() == []
    for subdir in ("images", "pdfs", "texts", "others"):
        assert list((files_root / subdir).iterdir()) == []


def test_duplicate_content_returns_409_with_existing_id(client):
    """Subir dos veces el mismo contenido devuelve el id del archivo existente."""
    first = _upload(client, "original.png")
    assert first.status_code == 201

    second = _upload(client, "copia.png")
    assert second.status_code == 409
    assert second.json()["detail"]["file_id"] == first.json()["id"]

    assert len(client.get("/files").json()) == 1


def test_upload_over_30_mb_returns_413(client, files_root):
    """Un archivo de mas de 30 MB se rechaza antes de escribir nada."""
    oversized = b"x" * (MAX_UPLOAD_BYTES + 1)

    response = _upload(client, "grande.png", oversized)
    assert response.status_code == 413

    assert client.get("/files").json() == []
    assert list((files_root / "images").iterdir()) == []


def test_request_body_limit_returns_413(client, monkeypatch):
    """El middleware corta un cuerpo mayor que MAX_REQUEST_BYTES."""
    from server import main as server_main

    monkeypatch.setattr(server_main, "MAX_REQUEST_BYTES", 512)

    response = _upload(client, "grande.png", PNG + b"x" * 4096)

    assert response.status_code == 413
    assert response.json()["detail"] == "La petición es demasiado grande."
    assert client.get("/files").json() == []


def test_rename_updates_index_and_delete_cleans_rows(client, db_session, files_root):
    """Renombrar reindexa el nombre; borrar limpia file, file_fts y disco."""
    uploaded = _upload(client).json()

    renamed = client.put(
        f"/files/{uploaded['id']}", json={"name": "renombrado.png"}
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "renombrado.png"

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


def test_upload_accepts_a_document_kind(client):
    """La subida guarda el tipo elegido; sin campo queda en "otros"."""
    teoria = _upload(client, "tema_1.png", PNG, kind="teoria")
    assert teoria.status_code == 201
    assert teoria.json()["kind"] == "teoria"

    sin_tipo = _upload(client, "apuntes.png", PNG + b"\x00")
    assert sin_tipo.status_code == 201
    assert sin_tipo.json()["kind"] == "otros"

    invalid = _upload(client, "raro.png", PNG + b"\x01", kind="inventado")
    assert invalid.status_code == 422


def test_update_and_filter_by_document_kind(client):
    """PUT cambia solo el tipo y GET /files?kind= filtra por el."""
    uploaded = _upload(client, "parcial.png").json()
    assert uploaded["kind"] == "otros"

    updated = client.put(
        f"/files/{uploaded['id']}",
        json={"name": "parcial.png", "kind": "examen"},
    )
    assert updated.status_code == 200
    assert updated.json()["kind"] == "examen"

    examenes = client.get("/files", params={"kind": "examen"}).json()
    assert [item["id"] for item in examenes] == [uploaded["id"]]
    assert client.get("/files", params={"kind": "teoria"}).json() == []


def test_static_files_are_served_with_nosniff_and_sandbox(client):
    """El mount /files no deja ejecutar HTML/SVG aunque hubiera uno antiguo."""
    uploaded = _upload(client).json()

    served = client.get(f"/files/{uploaded['path']}")
    assert served.status_code == 200
    assert served.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in served.headers["content-security-policy"]
