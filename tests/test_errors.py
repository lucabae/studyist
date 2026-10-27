"""Los errores no controlados salen como 500 JSON y con cabeceras CORS."""

from fastapi.testclient import TestClient
from server.main import create_app


def test_unhandled_error_is_json_with_cors_headers(monkeypatch) -> None:
    """Un 500 se puede leer desde el navegador (si no, Safari dice Load failed)."""
    app = create_app()

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("explotó")

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/boom", headers={"Origin": "http://localhost:5173"})

    assert response.status_code == 500
    assert response.json()["detail"]
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
