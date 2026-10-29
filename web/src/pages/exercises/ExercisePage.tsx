import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deleteEjercicioEjercicioEjercicioIdDelete,
  getEjercicioEjercicioEjercicioIdGet,
  runEjercicioEjercicioEjercicioIdRunPost,
  type EjercicioRead,
  type RunExerciseResponse,
} from "../../api/generated";
import { Button, Card, CodeEditor, Spinner, useToast } from "../../components";
import { RichText } from "../../components/RichText";
import { PageHeader } from "../../layout/PageHeader";
import { apiErrorMessage } from "../../lib/api";
import { ConfirmDialog } from "../flashcards/ConfirmDialog";

type Status = "loading" | "ready" | "notfound" | "error";

/**
 * La ejecución de código está desactivada en el backend
 * (`EXERCISE_RUN_ENABLED = False` en server/views/ejercicio/router.py).
 * El editor y el botón se ocultan para no ofrecer una acción que da 403.
 */
const EXERCISE_RUN_ENABLED = false;


/** Args JSON del test case -> "solve(1, 2)" para pintarlo legible. */
function callLabel(input: string): string {
  try {
    const args = JSON.parse(input);
    if (!Array.isArray(args)) return input;
    return `solve(${args.map((arg) => JSON.stringify(arg)).join(", ")})`;
  } catch {
    return input;
  }
}

/** Valor JSON -> texto compacto e indentado si es objeto/lista. */
function showValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * /ejercicios/:id — ejercicio guardado.
 *
 * Texto: enunciado y, a demanda, solución y explicación.
 * Programación: el usuario escribe `solve` en Python, se ejecutan los test
 * cases en el backend y se pinta el resultado de cada uno.
 */
export default function ExercisePage() {
  const { id } = useParams<{ id: string }>();
  const exerciseId = Number(id);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [exercise, setExercise] = useState<EjercicioRead | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunExerciseResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [solutionOpen, setSolutionOpen] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
      setStatus("notfound");
      return;
    }

    setStatus("loading");
    setLoadError(null);
    const { data, error, response } = await getEjercicioEjercicioEjercicioIdGet({
      path: { ejercicio_id: exerciseId },
    });

    if (response?.status === 404) {
      setStatus("notfound");
      return;
    }
    if (error || !data) {
      setLoadError(apiErrorMessage(error));
      setStatus("error");
      return;
    }

    setExercise(data);
    setStatus("ready");
  }, [exerciseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async () => {
    if (!exercise || running) return;
    const trimmed = code.trim();
    if (!trimmed) {
      setRunError("Escribe tu solución antes de ejecutar los tests.");
      return;
    }

    setRunning(true);
    setRunError(null);
    setRunResult(null);
    try {
      const { data } = await runEjercicioEjercicioEjercicioIdRunPost({
        path: { ejercicio_id: exercise.id },
        body: { code },
        throwOnError: true,
      });
      setRunResult(data);
      if (data.ok) toast("Todos los test cases han pasado.", "success");
    } catch (error) {
      setRunError(apiErrorMessage(error));
    } finally {
      setRunning(false);
    }
  };

  const confirmDelete = async () => {
    if (!exercise || deleting) return;
    setDeleting(true);
    try {
      await deleteEjercicioEjercicioEjercicioIdDelete({
        path: { ejercicio_id: exercise.id },
        throwOnError: true,
      });
      toast("Ejercicio borrado.", "success");
      navigate(`/temas/${exercise.tema_id}`);
    } catch (error) {
      toast(apiErrorMessage(error), "error");
      setDeleting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="mx-auto flex w-full max-w-[880px] justify-center px-4 py-16 text-onyx-inkMuted sm:px-6">
        <Spinner label="Cargando ejercicio" />
      </div>
    );
  }

  if (status === "notfound") {
    return (
      <div className="mx-auto w-full max-w-[880px] px-4 py-8 sm:px-6">
        <p role="alert" className="text-[13px] text-onyx-inkMuted">
          El ejercicio que buscas no existe.
        </p>
        <Button to="/" variant="secondary" className="mt-4">
          Volver al inicio
        </Button>
      </div>
    );
  }

  if (status === "error" || !exercise) {
    return (
      <div className="mx-auto w-full max-w-[880px] px-4 py-8 sm:px-6">
        <p role="alert" className="text-[13px] leading-relaxed text-[#f0a8a1]">
          {loadError}
        </p>
        <Button variant="secondary" className="mt-4" onClick={() => void load()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const isCode = exercise.kind === "programacion";
  const results = runResult?.results ?? [];
  const passedCount = results.filter((result) => result.passed).length;

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4 px-4 py-5 sm:px-6 sm:py-8">
      <Link
        to={`/temas/${exercise.tema_id}`}
        className="focus-ring inline-flex w-fit items-center gap-1 rounded-md text-[13px] text-onyx-inkMuted transition-colors hover:text-onyx-ink"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M12.5 5 7.5 10l5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Tema
      </Link>

      <PageHeader
        title={isCode ? "Ejercicio de programación" : "Ejercicio de texto"}
        description={
          isCode
            ? `Python · ${(exercise.test_cases ?? []).length} test cases`
            : "Lee el enunciado y compáralo con la solución."
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            Borrar
          </Button>
        }
      />

      <Card className="p-4 sm:p-5">
        <p className="text-[11px] uppercase tracking-wide text-onyx-inkFaint">
          Enunciado
        </p>
        <RichText
          text={exercise.statement}
          className="mt-2 block text-[15px] leading-relaxed text-onyx-ink"
        />
      </Card>

      {isCode && (
        <>
          <Card className="p-4 sm:p-5">
            <p className="text-[11px] uppercase tracking-wide text-onyx-inkFaint">
              Test cases
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {(exercise.test_cases ?? []).map((testCase) => (
                <li
                  key={testCase.id}
                  className="min-w-0 rounded-lg border border-onyx-line bg-onyx-bg/40 px-3 py-2"
                >
                  <p className="text-[12px] uppercase tracking-wide text-onyx-inkFaint">
                    Caso {testCase.position}
                  </p>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[13px] text-onyx-ink">
{callLabel(testCase.input)}
                  </pre>
                  <p className="mt-1 text-[12px] text-onyx-inkFaint">
                    Devuelve{" "}
                    <span className="font-mono text-onyx-inkMuted">
                      {testCase.expected}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wide text-onyx-inkFaint">
                Tu solución
              </p>
              {EXERCISE_RUN_ENABLED ? (
                <Button onClick={() => void run()} disabled={running}>
                  {running && <Spinner size="sm" label="Ejecutando" />}
                  {running ? "Ejecutando…" : "Ejecutar tests"}
                </Button>
              ) : (
                <span className="text-[12px] text-onyx-inkFaint">
                  Ejecución desactivada
                </span>
              )}
            </div>

            <div className="mt-3">
              <CodeEditor
                value={code}
                onChange={setCode}
                placeholder={"def solve(...):\n    ..."}
                ariaLabel="Código Python de la solución"
                readOnly={running}
              />
            </div>

            <p className="mt-2 text-[12px] leading-relaxed text-onyx-inkFaint">
              {EXERCISE_RUN_ENABLED
                ? "Define una función solve con los argumentos de cada test case. Sin input() ni print(): el resultado es lo que devuelve la función."
                : "La ejecución de tests está desactivada. Puedes escribir tu solución y compararla con la que se muestra abajo."}
            </p>

            {runError && (
              <p role="alert" className="mt-3 text-[13px] leading-relaxed text-[#f0a8a1]">
                {runError}
              </p>
            )}

            {runResult && (
              <div className="mt-4" aria-live="polite">
                <p
                  className={
                    runResult.ok
                      ? "text-[13px] font-medium text-onyx-ink"
                      : "text-[13px] font-medium text-[#f0a8a1]"
                  }
                >
                  {runResult.ok
                    ? `Todos los test cases han pasado (${passedCount}/${results.length}).`
                    : `${passedCount}/${results.length} test cases correctos.`}
                </p>

                <ul className="mt-2 flex flex-col gap-2">
                  {results.map((result) => (
                    <li
                      key={result.position}
                      className={
                        result.passed
                          ? "rounded-lg border border-onyx-line px-3 py-2"
                          : "rounded-lg border border-[#5a3636] px-3 py-2"
                      }
                    >
                      <p className="flex flex-wrap items-center gap-2 text-[13px]">
                        <span className="font-medium text-onyx-ink">
                          Caso {result.position}
                        </span>
                        <span
                          className={
                            result.passed
                              ? "text-[12px] text-onyx-inkMuted"
                              : "text-[12px] text-[#f0a8a1]"
                          }
                        >
                          {result.passed ? "Correcto" : "Falló"}
                        </span>
                      </p>

                      {!result.passed && (
                        <div className="mt-2 flex flex-col gap-1.5 text-[12px]">
                          <p className="text-onyx-inkFaint">
                            Esperado:{" "}
                            <span className="font-mono text-onyx-inkMuted">
                              {showValue(result.expected)}
                            </span>
                          </p>
                          <p className="text-onyx-inkFaint">
                            Obtenido:{" "}
                            <span className="font-mono text-onyx-inkMuted">
                              {result.error ? "—" : showValue(result.actual)}
                            </span>
                          </p>
                          {result.error && (
                            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] text-[#f0a8a1]">
{result.error.trim()}
                            </pre>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </>
      )}

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wide text-onyx-inkFaint">
            Solución y explicación
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSolutionOpen((current) => !current)}
            aria-expanded={solutionOpen}
          >
            {solutionOpen ? "Ocultar" : "Ver solución"}
          </Button>
        </div>

        {solutionOpen && (
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-onyx-inkFaint">
                Solución
              </p>
              {isCode ? (
                <pre className="mt-2 overflow-x-auto rounded-lg border border-onyx-line bg-onyx-bg/60 p-3 font-mono text-[13px] leading-relaxed text-onyx-ink">
{exercise.solution}
                </pre>
              ) : (
                <RichText
                  text={exercise.solution}
                  className="mt-2 block text-[15px] leading-relaxed text-onyx-ink"
                />
              )}
            </div>

            <div className="border-t border-onyx-line pt-3">
              <p className="text-[11px] uppercase tracking-wide text-onyx-inkFaint">
                Explicación
              </p>
              <RichText
                text={exercise.explanation}
                className="mt-2 block text-[15px] leading-relaxed text-onyx-ink"
              />
            </div>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        title="Borrar ejercicio"
        description="Se borrará el ejercicio y sus test cases. No se puede deshacer."
        busy={deleting}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
