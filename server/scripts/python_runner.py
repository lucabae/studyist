"""Ejecutor de codigo Python para los ejercicios de programacion.

El usuario escribe una funcion `solve(...)` en la pagina del ejercicio. Aqui se
mete su codigo junto a un pequeno arnés en un script temporal y se lanza en un
subproceso aislado (`python -I`, sin sitio de usuario ni PYTHONPATH) con un
timeout. Los casos de prueba y los resultados viajan por ficheros JSON, no por
stdout, para que un `print` del usuario no corrompa nada.

Aviso: es ejecucion de codigo arbitrario en la maquina local. El subproceso
aisla imports del entorno y limita el tiempo, pero no es una sandbox de
verdad (no bloquea red ni sistema de ficheros). Uso personal y local.
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

DEFAULT_TIMEOUT_SECONDS = 5.0

# Arnés que se concatena DESPUES del codigo del usuario. Lee los casos del
# primer argumento, ejecuta solve(*args) y escribe los resultados en el segundo.
HARNESS = r'''

# --- arnes del corrector (no forma parte de la solucion) ---
import json as _json
import sys as _sys
import traceback as _traceback


def _canon(value):
    """Representacion estable para comparar valores JSON."""
    return _json.dumps(value, sort_keys=True, ensure_ascii=False, default=repr)


def _main():
    cases = _json.loads(open(_sys.argv[1], encoding="utf-8").read())
    results = []
    for index, case in enumerate(cases):
        entry = {
            "position": index + 1,
            "passed": False,
            "expected": case.get("expected"),
            "actual": None,
            "error": None,
        }
        try:
            actual = solve(*case.get("args", []))
            entry["actual"] = actual
            entry["passed"] = _canon(actual) == _canon(case.get("expected"))
        except Exception:
            entry["error"] = _traceback.format_exc(limit=4)
        results.append(entry)
    with open(_sys.argv[2], "w", encoding="utf-8") as handle:
        _json.dump(results, handle, ensure_ascii=False, default=repr)


_main()
'''


def _parse_case(case: dict) -> dict:
    """Convierte un test case de la BBDD (input/expected en texto) a JSON.

    Lanza ValueError con el numero de caso si alguno de los dos no es JSON.
    """
    try:
        args = json.loads(case["input"])
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError(
            f"El caso {case.get('position')} tiene un input que no es JSON: {exc}"
        ) from exc

    if not isinstance(args, list):
        raise ValueError(
            f"El input del caso {case.get('position')} debe ser un array JSON de argumentos"
        )

    try:
        expected = json.loads(case["expected"])
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError(
            f"El caso {case.get('position')} tiene un expected que no es JSON: {exc}"
        ) from exc

    return {"args": args, "expected": expected}


def _blank_results(cases: list[dict], error: str) -> list[dict]:
    """Resultados fallidos para todos los casos, con el mismo error global."""
    return [
        {
            "position": case.get("position", index + 1),
            "passed": False,
            "expected": case.get("expected"),
            "actual": None,
            "error": error,
        }
        for index, case in enumerate(cases)
    ]


def run_tests(
    code: str,
    cases: list[dict],
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict:
    """Ejecuta `solve` con cada caso y devuelve el resultado.

    Pasos: parsear los casos (ValueError si alguno esta mal guardado); escribir
    un script temporal con el codigo del usuario + HARNESS y un JSON con los
    casos; lanzar `python -I script casos.json resultados.json` con timeout y
    cwd en un directorio temporal; leer resultados; si el proceso muere por
    timeout o no deja resultados, devolver todos los casos fallidos con el
    stderr recortado. Devolver {ok, results, error}.
    """
    parsed = [_parse_case(case) for case in cases]

    with tempfile.TemporaryDirectory(prefix="studyist-ejercicio-") as workdir:
        root = Path(workdir)
        script = root / "solution.py"
        cases_file = root / "cases.json"
        results_file = root / "results.json"

        script.write_text(f"{code}\n{HARNESS}", encoding="utf-8")
        cases_file.write_text(
            json.dumps(parsed, ensure_ascii=False), encoding="utf-8"
        )

        try:
            completed = subprocess.run(
                [
                    sys.executable,
                    "-I",
                    str(script),
                    str(cases_file),
                    str(results_file),
                ],
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=workdir,
                env={"PATH": "/usr/bin:/bin:/usr/local/bin", "PYTHONIOENCODING": "utf-8"},
            )
        except subprocess.TimeoutExpired:
            message = f"El código tardó más de {timeout:g} segundos y se paró."
            return {
                "ok": False,
                "results": _blank_results(cases, message),
                "error": message,
            }

        if not results_file.exists():
            stderr = (completed.stderr or "").strip()[-1500:]
            message = stderr or "El código no llegó a ejecutarse."
            return {
                "ok": False,
                "results": _blank_results(cases, message),
                "error": message,
            }

        results = json.loads(results_file.read_text(encoding="utf-8"))

    return {
        "ok": bool(results) and all(result["passed"] for result in results),
        "results": results,
        "error": None,
    }
