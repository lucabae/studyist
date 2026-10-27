#!/usr/bin/env bash
# Regenera web/openapi.json desde la app FastAPI y despues el cliente TS
# con @hey-api/openapi-ts (script api:gen de web/package.json).
#
# Uso: sh/api_gen.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/log"
mkdir -p "$LOG_DIR"
cd "$ROOT"

# stderr del script a un temporal: si falla, se vuelca entero en
# log/script.error.log; si termina bien, se descarta.
ERR_FILE="$(mktemp "${TMPDIR:-/tmp}/studyist-apigen.XXXXXX")"
exec 2>>"$ERR_FILE"

finish() {
    local status=$?
    if (( status != 0 )); then
        {
            printf '%s api_gen.sh fallo con status=%s\n' \
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

if [[ -x "$ROOT/server/venv/bin/python" ]]; then
    PYTHON="$ROOT/server/venv/bin/python"
else
    PYTHON="python3"
fi

"$PYTHON" -c \
    "import json; from server.main import app; json.dump(app.openapi(), open('web/openapi.json', 'w'), indent=2, ensure_ascii=False)"

cd "$ROOT/web"
npm run api:gen
