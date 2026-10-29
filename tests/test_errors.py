"""La auth no rompe el contrato de errores: 500 JSON con cabeceras CORS."""

from fastapi.testclient import TestClient


def test_unhandled_error_is_json_with_cors_headers(client: TestClient) -> None:
    """Un 500 se puede leer desde el navegador (si no, Safari dice Load failed)."""

    @client.app.get("/boom")
    def boom() -> None:
        raise RuntimeError("explotó")

    response = client.get("/boom", headers={"Origin": "http://localhost:5173"})

    assert response.status_code == 500
    assert response.json()["detail"]
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
