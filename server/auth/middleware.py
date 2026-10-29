"""Middleware ASGI que exige el access token en todas las rutas privadas.

Va por dentro de CORS y del capturador de 500 (ver create_app en
server/main.py): asi los 401 salen con cabeceras CORS y cualquier fallo
inesperado de aqui se convierte en un 500 JSON.
"""

from urllib.parse import parse_qs

from fastapi.responses import JSONResponse

from server.auth.config import is_device_allowed
from server.auth.tokens import AuthError, decode_token

# Rutas que no piden token: login y refresh. La documentacion (docs, redoc y
# openapi.json) esta desactivada en create_app, asi que no hay nada mas publico.
PUBLIC_PATHS = {
    "/auth/login",
    "/auth/refresh",
}

# Prefijo del mount estatico. Un <img> o un <a download> no pueden mandar la
# cabecera Authorization, asi que para estos GET/HEAD se acepta tambien
# ?token=<access> en la query string.
STATIC_FILES_PREFIX = "/files/"


def _query_token(scope) -> str | None:  # noqa: ANN001 - ASGI scope
    """Saca el access token de `?token=` en la query string.

    Pasos: leer scope["query_string"] (bytes); si esta vacia, devolver None;
    parsearla con parse_qs y quedarse con el primer valor de "token" que no
    este en blanco.
    """
    raw = scope.get("query_string") or b""
    if not raw:
        return None

    values = parse_qs(raw.decode("latin-1")).get("token")
    if not values:
        return None

    token = values[0].strip()
    return token or None


def _strip_query_token(scope) -> None:  # noqa: ANN001 - ASGI scope
    """Quita ?token= del query string antes de que lo vea el log de accesos.

    Un `?token=<access>` queda en el access log de uvicorn (que registra el
    path con su query) y en cualquier traza. La autenticacion ya se ha resuelto
    cuando se llama a esta funcion, asi que el resto de la peticion no necesita
    el token: se elimina dejando los demas parametros intactos.
    """
    raw = scope.get("query_string") or b""
    if b"token=" not in raw:
        return

    kept = [
        part
        for part in raw.split(b"&")
        if part and part.split(b"=", 1)[0].lower() != b"token"
    ]
    scope["query_string"] = b"&".join(kept)


async def _deny(status_code: int, message: str, scope, receive, send) -> None:  # noqa: ANN001
    """Responde un 401/403 JSON sin llamar a la app.

    Pasos: construir un JSONResponse con {"detail": message} y la cabecera
    WWW-Authenticate: Bearer; enviarlo con el scope/receive/send recibidos.
    """
    response = JSONResponse(
        status_code=status_code,
        content={"detail": message},
        headers={"WWW-Authenticate": "Bearer"},
    )
    await response(scope, receive, send)


class AuthMiddleware:
    """Exige Authorization: Bearer <access> salvo en rutas publicas.

    No lee el secreto, la contrasena ni device.json en __init__: el middleware
    se instancia al crear la app y los ficheros pueden cambiar sin reiniciar.
    Todo se resuelve por peticion.
    """

    def __init__(self, app) -> None:  # noqa: ANN001 - ASGI app
        self.app = app

    async def __call__(self, scope, receive, send) -> None:  # noqa: ANN001
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # El preflight de CORS no lleva cabeceras de auth: debe pasar siempre.
        if scope.get("method") == "OPTIONS" or scope.get("path") in PUBLIC_PATHS:
            await self.app(scope, receive, send)
            return

        headers = {
            key.decode("latin-1").lower(): value.decode("latin-1")
            for key, value in scope.get("headers", [])
        }
        method = scope.get("method", "")
        user_agent = headers.get("user-agent")

        token = None
        authorization = headers.get("authorization", "")
        if authorization:
            scheme, _, token_text = authorization.partition(" ")
            token = token_text.strip()
            if scheme.lower() != "bearer" or not token:
                await _deny(
                    401, "Cabecera Authorization no válida.", scope, receive, send
                )
                return
        elif method in ("GET", "HEAD") and scope.get("path", "").startswith(
            STATIC_FILES_PREFIX
        ):
            # Imagenes y descargas: el navegador no puede mandar cabeceras.
            token = _query_token(scope)

        # El token nunca debe quedar en el access log, llegue por query o no.
        if method in ("GET", "HEAD") and scope.get("path", "").startswith(
            STATIC_FILES_PREFIX
        ):
            _strip_query_token(scope)

        if not token:
            await _deny(401, "Falta el token de acceso.", scope, receive, send)
            return

        try:
            decode_token(token, "access")
        except AuthError as exc:
            await _deny(exc.status_code, exc.message, scope, receive, send)
            return

        # Mismo mensaje que un token invalido: el bloqueo por dispositivo no se
        # distingue desde fuera de un access caducado o firmado con otro secreto.
        if not is_device_allowed(user_agent):
            await _deny(401, "Sesión no válida o caducada.", scope, receive, send)
            return

        await self.app(scope, receive, send)
