"""Emision y validacion de los JWT de la app.

Dos tipos de token, separados por el claim typ para que un refresh no valga
como access: access (2 dias) y refresh (4 dias). Son stateless: el servidor no
guarda nada, asi que no hay revocacion ni lista negra.
"""

import hashlib
import secrets
from datetime import datetime, timezone
from typing import Literal

import jwt

from server.auth.config import (
    ACCESS_TTL,
    ISSUER,
    JWT_ALG,
    REFRESH_TTL,
    SUBJECT,
    jwt_secret,
)

TokenKind = Literal["access", "refresh"]

TTL_BY_KIND = {"access": ACCESS_TTL, "refresh": REFRESH_TTL}


class AuthError(Exception):
    """Token invalido, caducado o del tipo equivocado.

    Lleva el mensaje para el usuario y el status con el que debe salir la
    respuesta (401 por defecto).
    """

    def __init__(self, message: str, status_code: int = 401) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def token_ttl(kind: TokenKind) -> int:
    """Devuelve la duracion del tipo de token en segundos.

    Pasos: buscar el timedelta en TTL_BY_KIND y pasarlo a segundos enteros
    (para el expires_in del TokenPair).
    """
    return int(TTL_BY_KIND[kind].total_seconds())


def create_token(kind: TokenKind, user_agent: str | None) -> str:
    """Firma un JWT del tipo pedido y lo devuelve como str.

    Pasos: tomar ahora en UTC; construir el payload con sub, typ, iat, exp
    (ahora + TTL del tipo), jti aleatorio, iss y dev (sha256 corto del
    User-Agent, para poder distinguir sesiones de dispositivos distintos);
    firmar con jwt_secret() y JWT_ALG.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": SUBJECT,
        "typ": kind,
        "iat": now,
        "exp": now + TTL_BY_KIND[kind],
        "jti": secrets.token_hex(16),
        "iss": ISSUER,
        "dev": hashlib.sha256((user_agent or "").encode("utf-8")).hexdigest()[:16],
    }
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALG)


def decode_token(token: str, expected_kind: str) -> dict:
    """Valida el token y devuelve su payload.

    Pasos: jwt.decode comprobando firma, algoritmo, issuer y exp; exigir que
    typ sea expected_kind (un refresh usado como access da 401 con el mensaje
    del tipo esperado); exigir sub == SUBJECT. Cualquier PyJWTError o payload
    incompleto se convierte en AuthError 401.
    """
    try:
        payload = jwt.decode(
            token, jwt_secret(), algorithms=[JWT_ALG], issuer=ISSUER
        )
    except jwt.PyJWTError:
        raise AuthError("Sesión no válida o caducada.", 401)

    if not isinstance(payload, dict):
        raise AuthError("Sesión no válida o caducada.", 401)

    if payload.get("typ") != expected_kind:
        raise AuthError(
            "Se esperaba un token de acceso."
            if expected_kind == "access"
            else "Se esperaba un token de refresco.",
            401,
        )

    if payload.get("sub") != SUBJECT:
        raise AuthError("Sesión no válida o caducada.", 401)

    return payload
