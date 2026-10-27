#!/usr/bin/env bash
# Arranca solo el backend (FastAPI) en el puerto 8080.
# TLS (8443) queda para mas adelante; por ahora solo 8080 en localhost.
#
# Logs:
#   log/backend_server.log        accesos HTTP (stdout de uvicorn)
#   log/backend_server.error.log  errores y arranque/parada de uvicorn + app
#   log/server.log                arranque/parada con fecha, commit y rama
#   log/script.error.log          fallos del propio script
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/log"
mkdir -p "$LOG_DIR"
cd "$ROOT"

# stderr del script a un temporal: si falla, se vuelca entero en
# log/script.error.log; si termina bien, se descarta.
ERR_FILE="$(mktemp "${TMPDIR:-/tmp}/studyist-backend.XXXXXX")"
exec 2>>"$ERR_FILE"

log_server() {
    local action="$1"
    local commit branch
    commit="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "sin-commit")"
    branch="$(git -C "$ROOT" branch --show-current 2>/dev/null)"
    [[ -n "$branch" ]] || branch="sin-rama"
    printf '%s %s commit=%s branch=%s\n' \
        "$(date '+%Y-%m-%d %H:%M:%S')" "$action" "$commit" "$branch" \
        >> "$LOG_DIR/server.log"
}

finish() {
    local status=$?
    if [[ -z "${STUDYIST_SUPERVISED:-}" ]]; then
        log_server "stop backend"
    fi
    if (( status != 0 && status != 130 && status != 143 )); then
        # El stderr de uvicorn va a su propio log: se copia aqui para que el
        # fallo quede con su mensaje real en script.error.log.
        tail -n 20 "$LOG_DIR/backend_server.error.log" >&2 2>/dev/null || true
        {
            printf '%s start_backend.sh fallo con status=%s\n' \
                "$(date '+%Y-%m-%d %H:%M:%S')" "$status"
            if [[ -s "$ERR_FILE" ]]; then
                printf -- '--- stderr ---\n'
                tail -n 50 "$ERR_FILE"
                printf -- '--- fin stderr ---\n'
            fi
        } >> "$LOG_DIR/script.error.log"
    fi
    rm -f "$ERR_FILE"
}
trap finish EXIT

if [[ -z "${STUDYIST_SUPERVISED:-}" ]]; then
    log_server "start backend"
fi

# Preferir el uvicorn del venv del proyecto; si no existe, el del PATH.
if [[ -x "$ROOT/server/venv/bin/uvicorn" ]]; then
    UVICORN="$ROOT/server/venv/bin/uvicorn"
else
    UVICORN="uvicorn"
fi

"$UVICORN" server.main:app --reload --host 127.0.0.1 --port 8080 \
    >> "$LOG_DIR/backend_server.log" \
    2>> "$LOG_DIR/backend_server.error.log"
