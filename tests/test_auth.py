"""Tests de la auth: login, refresh y filtro por dispositivo.

Todos usan anon_client (o client) con los ficheros de auth y JWT_SECRET
redirigidos por el fixture auth_files, asi que nada toca el password.hash real.
"""

import json
from pathlib import Path

import jwt
from fastapi.testclient import TestClient

# User-Agent real de un iPhone: el formato que el usuario pega en device.json.
IPHONE_AGENT = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)


def _login(
    client: TestClient, password: str, user_agent: str | None = None
):
    """Hace POST /auth/login con la contrasena y, si se pasa, un User-Agent."""
    headers = {"user-agent": user_agent} if user_agent else None
    return client.post("/auth/login", json={"password": password}, headers=headers)


def _set_devices(device_file: Path, devices: list[str]) -> None:
    """Sustituye device.json por la lista de dispositivos dada."""
    device_file.write_text(json.dumps({"devices": devices}), encoding="utf-8")


def test_request_without_token_is_401(anon_client: TestClient) -> None:
    """Sin Authorization no se llega a ninguna ruta privada."""
    response = anon_client.get("/asignatura")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_login_rejects_bad_password_and_returns_ttls(
    anon_client: TestClient, auth_files
) -> None:
    """La contrasena mala da 401; la buena, un par con los TTL esperados."""
    wrong = _login(anon_client, "no-es-la-contrasena")
    assert wrong.status_code == 401
    assert wrong.json()["detail"] == "Contraseña incorrecta."

    response = _login(anon_client, auth_files["password"])

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"] and body["refresh_token"]
    assert body["expires_in"] == 172800
    assert body["refresh_expires_in"] == 345600


def test_access_token_reaches_private_routes(client: TestClient) -> None:
    """El access token que deja el fixture client vale para la API."""
    assert client.get("/asignatura").status_code == 200


def test_access_token_is_not_a_refresh_token(
    anon_client: TestClient, auth_files
) -> None:
    """Un access presentado en /auth/refresh da 401 por el claim typ."""
    tokens = _login(anon_client, auth_files["password"]).json()

    response = anon_client.post(
        "/auth/refresh", json={"refresh_token": tokens["access_token"]}
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Se esperaba un token de refresco."


def test_refresh_returns_a_working_pair(
    anon_client: TestClient, auth_files
) -> None:
    """El refresh emite un par nuevo (rotacion) y el access nuevo sirve."""
    tokens = _login(anon_client, auth_files["password"]).json()

    response = anon_client.post(
        "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )

    assert response.status_code == 200
    fresh = response.json()
    assert fresh["access_token"] != tokens["access_token"]
    assert fresh["refresh_token"] != tokens["refresh_token"]

    headers = {"Authorization": f"Bearer {fresh['access_token']}"}
    assert anon_client.get("/asignatura", headers=headers).status_code == 200


def test_me_describes_the_session(anon_client: TestClient, auth_files) -> None:
    """GET /auth/me devuelve el subject y la caducidad, sin datos del dispositivo."""
    tokens = _login(anon_client, auth_files["password"]).json()

    response = anon_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["subject"] == "owner"
    assert "device" not in body
    assert body["expires_at"]


def test_device_block_looks_like_a_wrong_password(
    anon_client: TestClient, auth_files
) -> None:
    """Un dispositivo bloqueado no se distingue de una contraseña incorrecta.

    Pasos: dejar device.json solo con Android y comparar la respuesta con la de
    una contraseña mala (mismo status, mismo cuerpo); despues permitir solo
    iPhone y comprobar que ese User-Agent si entra.
    """
    _set_devices(auth_files["device_file"], ["Android"])

    blocked = _login(anon_client, auth_files["password"])
    wrong = _login(anon_client, "no-es-la-contrasena")

    assert blocked.status_code == 401
    assert blocked.json() == wrong.json() == {"detail": "Contraseña incorrecta."}
    assert blocked.content == wrong.content

    _set_devices(auth_files["device_file"], ["iPhone"])
    allowed = _login(anon_client, auth_files["password"], IPHONE_AGENT)
    assert allowed.status_code == 200


def test_device_block_on_private_routes_looks_like_a_bad_token(
    anon_client: TestClient, auth_files
) -> None:
    """Con token válido pero User-Agent no permitido, la respuesta es la de un token inválido."""
    tokens = _login(anon_client, auth_files["password"]).json()
    _set_devices(auth_files["device_file"], ["Android"])

    blocked = anon_client.get(
        "/asignatura",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    forged = anon_client.get(
        "/asignatura",
        headers={"Authorization": "Bearer token-que-no-existe"},
    )

    assert blocked.status_code == forged.status_code == 401
    assert blocked.json() == forged.json() == {"detail": "Sesión no válida o caducada."}


def test_logout_is_204(client: TestClient) -> None:
    """El logout no toca el servidor: solo confirma al cliente."""
    assert client.post("/auth/logout").status_code == 204


def test_token_signed_with_other_secret_is_401(anon_client: TestClient) -> None:
    """Un token con la firma de otro secreto no pasa el middleware."""
    forged = jwt.encode(
        {"sub": "owner", "typ": "access"},
        "otro-secreto-que-no-es-el-del-backend",
        algorithm="HS256",
    )

    response = anon_client.get(
        "/asignatura", headers={"Authorization": f"Bearer {forged}"}
    )

    assert response.status_code == 401


def test_wildcard_device_allows_any_user_agent(
    anon_client: TestClient, auth_files
) -> None:
    """Con "*" en device.json entra cualquier User-Agent."""
    _set_devices(auth_files["device_file"], ["*"])

    response = _login(anon_client, auth_files["password"], "Mozilla/5.0 (X11; Linux)")

    assert response.status_code == 200


def test_static_files_accept_token_in_query(
    anon_client: TestClient, auth_files, files_root
) -> None:
    """Imagenes y descargas: `?token=` vale donde no llega la cabecera.

    Pasos: crear un fichero en el mount temporal; sin token debe dar 401; con
    `?token=<access>` debe servir el contenido; un refresh en la query y un
    token en la query de un POST no valen.
    """
    target = files_root / "images" / "prueba.png"
    target.write_bytes(b"\x89PNG\r\n\x1a\n")

    assert anon_client.get("/files/images/prueba.png").status_code == 401

    tokens = _login(anon_client, auth_files["password"]).json()

    served = anon_client.get(
        f"/files/images/prueba.png?token={tokens['access_token']}"
    )
    assert served.status_code == 200
    assert served.content == b"\x89PNG\r\n\x1a\n"

    refresh = anon_client.get(
        f"/files/images/prueba.png?token={tokens['refresh_token']}"
    )
    assert refresh.status_code == 401

    posted = anon_client.post(
        f"/files/images/prueba.png?token={tokens['access_token']}"
    )
    assert posted.status_code == 401


def test_login_attempts_are_logged(
    anon_client: TestClient, auth_files
) -> None:
    """Cada intento deja una linea en auth.log con su resultado real.

    Pasos: hacer un login bueno, uno con contrasena mala y uno con dispositivo
    bloqueado; leer el log y comprobar los tres resultados, que la contrasena no
    aparece en ningun sitio y que se apunta IP y User-Agent.
    """
    _login(anon_client, auth_files["password"], IPHONE_AGENT)
    _login(anon_client, "no-es-la-contrasena", IPHONE_AGENT)

    _set_devices(auth_files["device_file"], ["Android"])
    _login(anon_client, auth_files["password"], IPHONE_AGENT)

    contenido = auth_files["auth_log"].read_text(encoding="utf-8")

    assert "login outcome=ok " in contenido
    assert "login outcome=contrasena-incorrecta " in contenido
    assert "login outcome=dispositivo-bloqueado " in contenido
    assert "ip=" in contenido
    assert "ua=" in contenido
    assert auth_files["password"] not in contenido
    assert "no-es-la-contrasena" not in contenido
