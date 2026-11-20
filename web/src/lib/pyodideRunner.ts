/**
 * Ejecutor de ejercicios Python en el navegador usando Pyodide en un Web Worker.
 *
 * El worker se reutiliza entre ejecuciones para no volver a descargar Python,
 * pero se destruye y recrea si una ejecucion supera el timeout (bucles infinitos).
 */
import type {
  WorkerCaseInput,
  WorkerRunResponse,
  WorkerTestCaseResult,
} from "./pyodide.worker";

export type TestCaseResult = WorkerTestCaseResult;
export type RunExerciseResponse = WorkerRunResponse;

const EXECUTION_TIMEOUT_MS = 5000;

let worker: Worker | null = null;
let nextId = 1;
let busy = false;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./pyodide.worker.ts", import.meta.url), {
      type: "module",
    });
  }
  return worker;
}

function resetWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

function blankResults(
  cases: WorkerCaseInput[],
  error: string,
): WorkerTestCaseResult[] {
  return cases.map((c) => {
    let expected: unknown = c.expected;
    try {
      expected = JSON.parse(c.expected);
    } catch {
      // mantener texto crudo si no es JSON valido
    }
    return {
      position: c.position,
      passed: false,
      expected,
      actual: null,
      error,
    };
  });
}

export async function runPythonTests(
  code: string,
  cases: WorkerCaseInput[],
  onPhase?: (phase: "loading" | "running") => void,
): Promise<RunExerciseResponse> {
  if (busy) {
    throw new Error("Ya hay una ejecución en curso.");
  }
  busy = true;
  onPhase?.("loading");

  const id = nextId++;
  const activeWorker = getWorker();

  return new Promise<RunExerciseResponse>((resolve) => {
    let timer: number | undefined;

    const cleanup = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      activeWorker.removeEventListener("message", onMessage);
      activeWorker.removeEventListener("error", onError);
      busy = false;
    };

    const startExecutionTimer = () => {
      if (timer !== undefined) return;
      onPhase?.("running");
      timer = window.setTimeout(() => {
        cleanup();
        resetWorker();
        const message = `El código tardó más de ${EXECUTION_TIMEOUT_MS / 1000} segundos y se paró.`;
        resolve({
          ok: false,
          results: blankResults(cases, message),
          error: message,
        });
      }, EXECUTION_TIMEOUT_MS);
    };

    const onMessage = (
      event: MessageEvent<{
        id: number;
        status?: "running";
        result?: RunExerciseResponse;
      }>,
    ) => {
      if (event.data?.id !== id) return;
      if (event.data.status === "running") {
        startExecutionTimer();
        return;
      }
      if (event.data.result) {
        cleanup();
        resolve(event.data.result);
      }
    };

    const onError = (event: ErrorEvent) => {
      cleanup();
      resetWorker();
      const message = event.message || "Error al cargar el entorno Python.";
      resolve({
        ok: false,
        results: blankResults(cases, message),
        error: message,
      });
    };

    activeWorker.addEventListener("message", onMessage);
    activeWorker.addEventListener("error", onError);
    activeWorker.postMessage({ id, code, cases });
  });
}
