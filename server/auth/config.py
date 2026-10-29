"""Configuracion de la auth: secreto JWT, contrasena y dispositivos.

App de un solo usuario: no hay tabla de usuarios. La contrasena vive hasheada
en server/auth/password.hash (la escribe sh/hash_password.sh) y la allowlist de
dispositivos en server/auth/device.json. Los dos ficheros se leen en cada
llamada, no al importar: los tests los redirigen a tmp_path y el OpenAPI se
genera importando server.main, donde el fichero puede no existir.
"""

import hashlib
import hmac
import json
import logging
import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

AUTH_DIR = Path(__file__).resolve().parent
PASSWORD_FILE = AUTH_DIR / "password.hash"
DEVICE_FILE = AUTH_DIR / "device.json"

# Algoritmo y claims fijos: solo este backend emite tokens (ISSUER) y solo hay
# un usuario (SUBJECT).
JWT_ALG = "HS256"
ISSUER = "studyist"
SUBJECT = "owner"

# Duracion de los tokens. El access dura poco para que uno robado caduque
# pronto; el refresh permite renovarlo sin volver a escribir la contrasena.
ACCESS_TTL = timedelta(days=2)
REFRESH_TTL = timedelta(days=4)

# Prefijo del formato que escribe sh/hash_password.sh.
PASSWORD_PREFIX = "pbkdf2_sha256"


def jwt_secret() -> str:
    """Devuelve JWT_SECRET leido de .env.

    Pasos: leer os.getenv("JWT_SECRET") en cada llamada (nunca a nivel de
    modulo: el OpenAPI se genera importando server.main en contextos sin .env);
    si falta o esta vacio, lanzar RuntimeError con un mensaje para el usuario.
    """
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET no está configurado en .env")
    return secret


def read_password_hash() -> str:
    """Devuelve la linea de PASSWORD_FILE sin espacios en los extremos.

    Pasos: leer PASSWORD_FILE en la llamada (los tests monkeypatchean la
    constante); si no existe, lanzar RuntimeError con la instruccion para
    generarla; devolver el contenido recortado.
    """
    try:
        return PASSWORD_FILE.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        raise RuntimeError(
            "No hay contraseña configurada. Ejecuta sh/hash_password.sh"
        )


def verify_password(password: str) -> bool:
    """Comprueba una contrasena contra el hash guardado.

    Pasos: leer el hash con read_password_hash (que lanza RuntimeError si no
    hay fichero); partirlo por "$" y exigir el prefijo pbkdf2_sha256, cuatro
    campos, iteraciones positivas y sal/hash hexadecimales; recalcular el
    PBKDF2-HMAC-SHA256 con la misma sal e iteraciones; comparar con
    hmac.compare_digest.

    Cualquier formato raro o hash vacio devuelve False: un hash corrupto no
    debe tumbar el login con una excepcion.
    """
    stored = read_password_hash()

    try:
        prefix, iterations_text, salt_hex, hash_hex = stored.split("$")
        iterations = int(iterations_text)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
    except ValueError:
        return False

    if prefix != PASSWORD_PREFIX or not salt_hex or not hash_hex:
        return False
    if iterations <= 0:
        return False

    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations
    )
    return hmac.compare_digest(digest, expected)


def load_devices() -> list[str]:
    """Devuelve los dispositivos autorizados leidos de DEVICE_FILE.

    Pasos: leer y parsear DEVICE_FILE en cada llamada (no hace falta reiniciar
    el servidor al editarlo); aceptar tanto {"devices": [...]} como una lista
    JSON suelta; quedarse solo con las cadenas no vacias (las claves que
    empiezan por "_" son ayuda y se ignoran); si el fichero no existe, esta
    corrupto o la lista queda vacia, loggear un warning y devolver ["*"].

    El fail-open es a proposito: el filtro por dispositivo es una defensa
    blanda y no puede dejar fuera al unico usuario.
    """
    try:
        data = json.loads(DEVICE_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        logger.warning("No existe %s: se permite cualquier dispositivo", DEVICE_FILE)
        return ["*"]
    except (OSError, ValueError):
        logger.warning(
            "%s no es JSON valido: se permite cualquier dispositivo", DEVICE_FILE
        )
        return ["*"]

    if isinstance(data, dict):
        data = data.get("devices")

    if not isinstance(data, list):
        logger.warning(
            "%s no tiene una lista 'devices': se permite cualquier dispositivo",
            DEVICE_FILE,
        )
        return ["*"]

    devices = [item for item in data if isinstance(item, str) and item.strip()]
    if not devices:
        logger.warning(
            "%s no tiene dispositivos: se permite cualquier dispositivo", DEVICE_FILE
        )
        return ["*"]
    return devices


def is_device_allowed(user_agent: str | None) -> bool:
    """Dice si el User-Agent corresponde a un dispositivo autorizado.

    Pasos: cargar load_devices; si algun dispositivo contiene "*", permitir
    todo; si no y no hay User-Agent, denegar; comparar cada dispositivo como
    subcadena del User-Agent sin distinguir mayusculas.
    """
    devices = load_devices()
    if any("*" in device for device in devices):
        return True
    if not user_agent:
        return False

    agent = user_agent.lower()
    return any(device.lower() in agent for device in devices)
