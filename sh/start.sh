#!/usr/bin/env bash
# Arranca backend y frontend a la vez.
# El backend corre en segundo plano; el frontend en primer plano para que
# Ctrl+C pare el script. Al salir, se mata el backend.
#
# Los scripts hijos no escriben en log/server.log: este script centraliza el
# arranque/parada de la sesion completa con STUDYIST_SUPERVISED=1.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/log"
mkdir -p "$LOG_DIR"
cd "$ROOT"

# stderr del script a un temporal: si falla, se vuelca entero en
# log/script.error.log; si termina bien, se descarta.
ERR_FILE="$(mktemp "${TMPDIR:-/tmp}/studyist-start.XXXXXX")"
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

stop_backend() {
    if [[ -n "${BACKEND_PID:-}" ]]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
}

finish() {
    local status=$?
    stop_backend
    log_server "stop"
    if (( status != 0 && status != 130 && status != 143 )); then
        # Los hijos ya escriben su detalle; se adjunta su cola por contexto.
        tail -n 10 "$LOG_DIR/backend_server.error.log" >&2 2>/dev/null || true
        tail -n 10 "$LOG_DIR/web_server.error.log" >&2 2>/dev/null || true
        {
            printf '%s start.sh fallo con status=%s\n' \
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

export STUDYIST_SUPERVISED=1
log_server "start"

sh/start_backend.sh &
BACKEND_PID=$!

sh/start_frontend.sh
