/**
 * Web Worker que carga Pyodide desde CDN y ejecuta `solve(*args)` sobre los
 * test cases de un ejercicio de programacion.
 *
 * Corre en un worker separado para no bloquear la UI y poder cortar bucles
 * infinitos terminando el worker desde pyodideRunner.ts.
 */

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.29.5/full/";
const PYODIDE_ENTRY = `${PYODIDE_CDN}pyodide.mjs`;

export interface WorkerCaseInput {
  position: number;
  input: string;
  expected: string;
}

export interface WorkerTestCaseResult {
  position: number;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  error: string | null;
}

export interface WorkerRunResponse {
  ok: boolean;
  results: WorkerTestCaseResult[];
  error: string | null;
}

interface WorkerRequest {
  id: number;
  code: string;
  cases: WorkerCaseInput[];
}

interface PyodideInstance {
  globals: {
    set(name: string, value: unknown): void;
  };
  runPythonAsync(code: string): Promise<unknown>;
}

let pyodidePromise: Promise<PyodideInstance> | null = null;

async function getPyodide(): Promise<PyodideInstance> {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const mod = (await import(/* @vite-ignore */ PYODIDE_ENTRY)) as {
        loadPyodide: (opts: { indexURL: string }) => Promise<PyodideInstance>;
      };
      return mod.loadPyodide({ indexURL: PYODIDE_CDN });
    })();
  }
  return pyodidePromise;
}

const HARNESS = `
import json as _json
import traceback as _traceback

def _canon(_value):
    return _json.dumps(_value, sort_keys=True, ensure_ascii=False, default=repr)

def _run_suite(_code, _cases_json):
    _cases = _json.loads(_cases_json)
    _ns = {}
    try:
        exec(_code, _ns)
    except Exception:
        _err = _traceback.format_exc(limit=4)
        _results = []
        for _idx, _case in enumerate(_cases):
            _results.append({
                "position": _case.get("position", _idx + 1),
                "passed": False,
                "expected": _case.get("expected"),
                "actual": None,
                "error": _err,
            })
        return _json.dumps({"ok": False, "results": _results, "error": _err}, ensure_ascii=False)

    _solve = _ns.get("solve")
    if not callable(_solve):
        _err = "No se ha encontrado la función solve(...)."
        _results = []
        for _idx, _case in enumerate(_cases):
            _results.append({
                "position": _case.get("position", _idx + 1),
                "passed": False,
                "expected": _case.get("expected"),
                "actual": None,
                "error": _err,
            })
        return _json.dumps({"ok": False, "results": _results, "error": _err}, ensure_ascii=False)

    _results = []
    for _idx, _case in enumerate(_cases):
        _entry = {
            "position": _case.get("position", _idx + 1),
            "passed": False,
            "expected": _case.get("expected"),
            "actual": None,
            "error": None,
        }
        try:
            _actual = _solve(*_case.get("args", []))
            _entry["actual"] = _actual
            _entry["passed"] = _canon(_actual) == _canon(_case.get("expected"))
        except Exception:
            _entry["error"] = _traceback.format_exc(limit=4)
        _results.append(_entry)

    _ok = bool(_results) and all(_r["passed"] for _r in _results)
    return _json.dumps({"ok": _ok, "results": _results, "error": None}, ensure_ascii=False, default=repr)

_run_suite(__studyist_code, __studyist_cases)
`;

function parseCases(cases: WorkerCaseInput[]) {
  return cases.map((item) => {
    let args: unknown;
    try {
      args = JSON.parse(item.input);
    } catch (err) {
      throw new Error(
        `El caso ${item.position} tiene un input que no es JSON: ${String(err)}`,
      );
    }
    if (!Array.isArray(args)) {
      throw new Error(
        `El input del caso ${item.position} debe ser un array JSON de argumentos.`,
      );
    }

    let expected: unknown;
    try {
      expected = JSON.parse(item.expected);
    } catch (err) {
      throw new Error(
        `El caso ${item.position} tiene un expected que no es JSON: ${String(err)}`,
      );
    }
    return { position: item.position, args, expected };
  });
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  void (async () => {
    const { id, code, cases } = event.data;
    try {
      const parsed = parseCases(cases);
      const pyodide = await getPyodide();
      self.postMessage({ id, status: "running" });
      pyodide.globals.set("__studyist_code", code);
      pyodide.globals.set("__studyist_cases", JSON.stringify(parsed));
      const raw = (await pyodide.runPythonAsync(HARNESS)) as string;
      const result = JSON.parse(raw) as WorkerRunResponse;
      self.postMessage({ id, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({
        id,
        result: {
          ok: false,
          results: cases.map((c) => ({
            position: c.position,
            passed: false,
            expected: c.expected,
            actual: null,
            error: message,
          })),
          error: message,
        } satisfies WorkerRunResponse,
      });
    }
  })();
});
