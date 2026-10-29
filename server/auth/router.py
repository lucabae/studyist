"""Views de autenticacion del unico usuario. Prefijo: /auth"""

from datetime import datetime, timezone
import threading
import time

from fastapi import APIRouter, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from server.auth.audit import log_login_attempt
from server.auth.config import is_device_allowed, verify_password
from server.auth.tokens import AuthError, create_token, decode_token, token_ttl
from server.models import AuthMe, LoginRequest, RefreshRequest, TokenPair

router = APIRouter(prefix="/auth", tags=["auth"])

# Limite de fallos por IP: sin esto se puede probar la contrasena en bucle
# (PBKDF2 frena, pero no impide la fuerza bruta). En memoria: si el servidor se
# reinicia, el contador vuelve a cero, que es aceptable para una app local.
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_FAILURES = 10

_failures: dict[str, list[float]] = {}
_failures_lock = threading.Lock()


def _client_key(request: Request) -> str:
    """IP del cliente, o "desconocido" si el scope no la trae."""
    client = getattr(request, "client", None)
    return getattr(client, "host", None) or "desconocido"


def _recent_failures(key: str, now: float) -> list[float]:
    """Fallos de esa IP dentro de la ventana; poda los caducados."""
    stamps = [stamp for stamp in _failures.get(key, []) if now - stamp < LOGIN_WINDOW_SECONDS]
    if stamps:
        _failures[key] = stamps
    else:
        _failures.pop(key, None)
    return stamps


def _rate_limit_retry_after(request: Request) -> int | None:
    """Segundos de espera si la IP ha agotado los intentos, o None."""
    key = _client_key(request)
    now = time.monotonic()
    with _failures_lock:
        stamps = _recent_failures(key, now)
        if len(stamps) < LOGIN_MAX_FAILURES:
            return None
        oldest = stamps[0]

    return max(1, int(LOGIN_WINDOW_SECONDS - (now - oldest)) + 1)


def _register_failure(request: Request) -> None:
    """Apunta un intento fallido de la IP."""
    key = _client_key(request)
    now = time.monotonic()
    with _failures_lock:
        _recent_failures(key, now)
        _failures.setdefault(key, []).append(now)


def _clear_failures(request: Request) -> None:
    """Un login correcto reinicia el contador de la IP."""
    with _failures_lock:
        _failures.pop(_client_key(request), None)


def _raise_if_rate_limited(request: Request) -> None:
    """Responde 429 con Retry-After si la IP esta bloqueada temporalmente."""
    retry_after = _rate_limit_retry_after(request)
    if retry_after is None:
        return
    raise HTTPException(
        status_code=429,
        detail="Demasiados intentos fallidos. Espera unos minutos.",
        headers={"Retry-After": str(retry_after)},
    )


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
    _raise_if_rate_limited(request)

    try:
        valid = verify_password(payload.password)
    except RuntimeError:
        log_login_attempt(request, "sin-password-configurada")
        _register_failure(request)
        raise HTTPException(status_code=401, detail="Contraseña incorrecta.")

    if not valid or not is_device_allowed(user_agent):
        log_login_attempt(
            request,
            "contrasena-incorrecta" if not valid else "dispositivo-bloqueado",
        )
        _register_failure(request)
        raise HTTPException(status_code=401, detail="Contraseña incorrecta.")

    log_login_attempt(request, "ok")
    _clear_failures(request)
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
    _raise_if_rate_limited(request)
    try:
        decode_token(payload.refresh_token, "refresh")
    except AuthError as exc:
        _register_failure(request)
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    if not is_device_allowed(user_agent):
        _register_failure(request)
        raise HTTPException(
            status_code=401, detail="Sesión no válida o caducada."
        )

    _clear_failures(request)
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
