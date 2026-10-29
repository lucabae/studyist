"""Registro de los intentos de login en log/auth.log.

Va a su propio fichero para poder mirar quien ha intentado entrar sin bucear
en el log de accesos de uvicorn. Aqui si se distingue un dispositivo bloqueado
de una contrasena mala: esa diferencia es justo lo que el cliente nunca ve.

Nunca se escribe la contrasena ni el token. Si el fichero no se puede abrir,
el login sigue adelante: la auditoria no puede tumbar la app.
"""

import logging
from pathlib import Path

from fastapi import Request

# log/ esta en la raiz del repo; este modulo vive en server/auth/audit.py.
LOG_DIR = Path(__file__).resolve().parents[2] / "log"
AUTH_LOG = LOG_DIR / "auth.log"

# User-Agent largos no aportan nada y llenan el fichero.
MAX_USER_AGENT = 200

logger = logging.getLogger("server.auth.audit")
# El handler escribe ya el mensaje final: que no lo repita el logger raiz.
logger.propagate = False
logger.setLevel(logging.INFO)


def _ensure_handler() -> bool:
    """Engancha un FileHandler a AUTH_LOG si no hay uno apuntando alli.

    Pasos: crear LOG_DIR si falta; resolver la ruta; si ya hay un FileHandler
    del logger sobre esa ruta, no hacer nada; si hay handlers viejos (los tests
    cambian AUTH_LOG a tmp_path) cerrarlos y quitarlos; crear el handler con
    formato fecha nivel mensaje; devolver False si el fichero no se puede abrir.
    """
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        target = str(AUTH_LOG.resolve())
    except OSError:
        return False

    for handler in list(logger.handlers):
        if not isinstance(handler, logging.FileHandler):
            continue
        if str(Path(handler.baseFilename).resolve()) == target:
            return True
        # Handler de una ruta anterior: se cierra para no escribir en dos sitios
        # ni dejar descriptores abiertos entre tests.
        logger.removeHandler(handler)
        handler.close()

    try:
        handler = logging.FileHandler(AUTH_LOG, encoding="utf-8")
    except OSError:
        return False

    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    )
    logger.addHandler(handler)
    return True


def _clean(value: str | None) -> str:
    """Deja un valor en una sola linea y recortado, para que no rompa el log."""
    if not value:
        return "-"
    compact = " ".join(value.split())
    return compact[:MAX_USER_AGENT]


def log_login_attempt(request: Request, outcome: str) -> None:
    """Anota un intento de login con su resultado.

    Pasos: asegurar el handler; sacar la IP del cliente (request.client puede
    ser None en tests) y el User-Agent; escribir una linea con resultado, IP y
    User-Agent. Cualquier fallo de escritura se traga: la auditoria es
    secundaria.
    """
    if not _ensure_handler():
        return

    client = getattr(request, "client", None)
    ip = getattr(client, "host", None) or "-"
    user_agent = _clean(request.headers.get("user-agent"))

    try:
        logger.info('login outcome=%s ip=%s ua="%s"', outcome, ip, user_agent)
    except Exception:  # noqa: BLE001 - el log no puede tumbar el login
        return
