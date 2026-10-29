#!/usr/bin/env bash
# Genera el hash de la contrasena del unico usuario y lo guarda en
# server/auth/password.hash (ignorado por git, permisos 600).
#
# Uso:
#   ./sh/hash_password.sh            (interactivo: pide la contrasena dos veces)
#   printf '%s\n' 'mi-clave' | ./sh/hash_password.sh   (sin TTY, para automatizar)
#
# Pide la contrasena por teclado (no se pasa por argumentos para que no quede en
# el historial de la shell). Formato del fichero:
#   pbkdf2_sha256$<iteraciones>$<salt_hex>$<hash_hex>
# El backend lo verifica con hmac.compare_digest (server/auth/config.py), sin
# dependencias externas mas alla de la libreria estandar.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/server/auth/password.hash"

# Preferir el python del venv del proyecto; si no existe, el del PATH.
if [[ -x "$ROOT/server/venv/bin/python" ]]; then
    PYTHON="$ROOT/server/venv/bin/python"
else
    PYTHON="python3"
fi

if [[ -t 0 ]]; then
    # Interactivo: dos lecturas sin eco y comprobacion de que coinciden.
    if ! read -r -s -p "Contrasena: " PASSWORD; then
        printf '\nEntrada cancelada.\n' >&2
        exit 1
    fi
    printf '\n'
    if ! read -r -s -p "Repite la contrasena: " CONFIRM; then
        printf '\nEntrada cancelada.\n' >&2
        exit 1
    fi
    printf '\n'

    if [[ "$PASSWORD" != "$CONFIRM" ]]; then
        printf 'Las contrasenas no coinciden.\n' >&2
        exit 1
    fi
else
    # Sin TTY (tuberia o CI): una sola linea, sin confirmacion.
    if ! IFS= read -r PASSWORD; then
        printf 'No se ha recibido ninguna contrasena por stdin.\n' >&2
        exit 1
    fi
fi

if [[ -z "$PASSWORD" ]]; then
    printf 'La contrasena no puede estar vacia.\n' >&2
    exit 1
fi

mkdir -p "$(dirname "$TARGET")"

STUDYIST_PASSWORD="$PASSWORD" "$PYTHON" - "$TARGET" <<'PY'
"""Escribe el hash PBKDF2-HMAC-SHA256 de la contrasena en el fichero dado."""
import hashlib
import os
import secrets
import sys

ITERATIONS = 600_000
password = os.environ["STUDYIST_PASSWORD"]
salt = secrets.token_bytes(16)
digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS)

target = sys.argv[1]
fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as handle:
    handle.write(
        f"pbkdf2_sha256${ITERATIONS}${salt.hex()}${digest.hex()}\n"
    )
os.chmod(target, 0o600)
PY

unset PASSWORD CONFIRM
printf 'Hash escrito en %s (permisos 600).\n' "${TARGET#"$ROOT"/}"
