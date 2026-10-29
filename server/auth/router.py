"""Views de autenticacion del unico usuario. Prefijo: /auth"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from server.auth.audit import log_login_attempt
from server.auth.config import is_device_allowed, verify_password
from server.auth.tokens import AuthError, create_token, decode_token, token_ttl
from server.models import AuthMe, LoginRequest, RefreshRequest, TokenPair

router = APIRouter(prefix="/auth", tags=["auth"])

# Esquema solo para que /auth/me salga con el candado en el OpenAPI: el 401 de
# verdad lo pone AuthMiddleware. auto_error=False evita que FastAPI conteste
# antes de que el middleware haya validado.
bearer_scheme = HTTPBearer(auto_error=False)


def _token_pair(user_agent: str | None) -> TokenPair:
    """Emite un par de tokens nuevo para el User-Agent dado.

    Pasos: crear el access y el refresh con create_token; devolver TokenPair
    con los TTL de cada uno en segundos.
    """
    return TokenPair(
        access_token=create_token("access", user_agent),
        refresh_token=create_token("refresh", user_agent),
        expires_in=token_ttl("access"),
        refresh_expires_in=token_ttl("refresh"),
    )


@router.post("/login", response_model=TokenPair)
def login(payload: LoginRequest, request: Request) -> TokenPair:
    """Cambia la contrasena por un par de tokens.

    Pasos: verificar la contrasena con verify_password (si falta password.hash,
    RuntimeError y se devuelve un 500 con ese mensaje); comprobar el dispositivo
    con is_device_allowed DESPUES, para que el coste en tiempo sea el mismo; si
    la contrasena no vale o el dispositivo no esta permitido, devolver el mismo
    401 "Contrasena incorrecta." en los dos casos (el bloqueo por dispositivo no
    se puede distinguir de un fallo de contrasena); emitir el par con
    _token_pair. Cada intento se apunta en log/auth.log con su resultado real
    (ahi si se distingue dispositivo de contrasena).
    """
    user_agent = request.headers.get("user-agent")

    try:
        valid = verify_password(payload.password)
    except RuntimeError:
        log_login_attempt(request, "sin-password-configurada")
        raise HTTPException(status_code=401, detail="Contraseña incorrecta.")

    if not valid or not is_device_allowed(user_agent):
        log_login_attempt(
            request,
            "contrasena-incorrecta" if not valid else "dispositivo-bloqueado",
        )
        raise HTTPException(status_code=401, detail="Contraseña incorrecta.")

    log_login_attempt(request, "ok")
    return _token_pair(user_agent)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshRequest, request: Request) -> TokenPair:
    """Renueva el par de tokens a partir del refresh.

    Pasos: validar el refresh con decode_token("refresh") y devolver 401 si no
    vale; volver a comprobar is_device_allowed con el User-Agent actual y, si no
    esta permitido, devolver el mismo 401 que un refresh invalido (no se revela
    el bloqueo por dispositivo); emitir un par nuevo con _token_pair (rotacion).

    Los tokens son stateless: el refresh viejo no se revoca en el servidor y
    sigue siendo valido hasta que caduque. Rotar solo evita reutilizarlo desde
    el cliente.
    """
    user_agent = request.headers.get("user-agent")
    try:
        decode_token(payload.refresh_token, "refresh")
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    if not is_device_allowed(user_agent):
        raise HTTPException(
            status_code=401, detail="Sesión no válida o caducada."
        )

    return _token_pair(user_agent)


@router.get("/me", response_model=AuthMe)
def me(
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
) -> AuthMe:
    """Devuelve los datos del access token en uso.

    Pasos: leer el token de la cabecera Authorization (AuthMiddleware ya lo ha
    validado; si falta, 401); decodificarlo como access; devolver el subject y
    la fecha de caducidad del token. No se dice nada del dispositivo: si no
    estuviera permitido, el middleware ya habria contestado 401.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Falta el token de acceso.")

    try:
        payload = decode_token(credentials.credentials, "access")
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return AuthMe(
        subject=payload["sub"],
        expires_at=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
    )


@router.post("/logout", status_code=204)
def logout() -> None:
    """Cierra la sesion. En el servidor no hace nada.

    Pasos: ninguno. Los tokens son stateless y no hay lista negra, asi que el
    cliente es quien borra el par de tokens. El endpoint existe para que el
    frontend tenga un sitio unico donde cerrar sesion.
    """
    return None
