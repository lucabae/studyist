import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getAsignaturaAsignaturaAsignaturaIdGet,
  getTemaTemaTemaIdGet,
  listEjerciciosEjercicioGet,
  listFilesFilesGet,
  listFlashcardSetsFlashcardSetGet,
  listTemasTemaGet,
  type EjercicioSummary,
  type FileRead,
  type FlashcardSetRead,
  type TemaRead,
} from "../../api/generated";
import { Spinner } from "../../components";
import { PageHeader } from "../../layout/PageHeader";
import { apiErrorMessage } from "../../lib/api";
import { ErrorNotice } from "./ErrorNotice";
import { GenerateTopicCardsModal } from "./GenerateTopicCardsModal";
import { NotFoundState } from "./NotFoundState";
import { TopicDetailsForm } from "./TopicDetailsForm";
import { TopicExerciseSection } from "./TopicExerciseSection";
import { TopicFilesSection } from "./TopicFilesSection";
import { TopicSetsSection } from "./TopicSetsSection";

type Status = "loading" | "ready" | "notfound" | "error";

/**
 * Detalle de tema (`/temas/:id`): notas en Markdown y los archivos y sets
 * vinculados. Todo lo editable se guarda contra `PUT /tema/{id}`.
 */
export default function TopicPage() {
  const { id } = useParams<{ id: string }>();
  const temaId = Number(id);

  const [topic, setTopic] = useState<TemaRead | null>(null);
  const [files, setFiles] = useState<FileRead[]>([]);
  const [sets, setSets] = useState<FlashcardSetRead[]>([]);
  const [exercises, setExercises] = useState<EjercicioSummary[]>([]);
  const [siblings, setSiblings] = useState<TemaRead[]>([]);
  const [subjectName, setSubjectName] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(temaId) || temaId <= 0) {
      setStatus("notfound");
      return;
    }

    setStatus("loading");
    const [topicResult, filesResult, setsResult, exercisesResult] = await Promise.all([
      getTemaTemaTemaIdGet({ path: { tema_id: temaId } }),
      listFilesFilesGet({ query: { limit: 500 } }),
      listFlashcardSetsFlashcardSetGet(),
      listEjerciciosEjercicioGet({ query: { tema_id: temaId } }),
    ]);

    if (topicResult.response?.status === 404) {
      setStatus("notfound");
      return;
    }

    if (
      topicResult.error ||
      filesResult.error ||
      setsResult.error ||
      exercisesResult.error ||
      !topicResult.data
    ) {
      setError(
        apiErrorMessage(
          topicResult.error ??
            filesResult.error ??
            setsResult.error ??
            exercisesResult.error,
        ),
      );
      setStatus("error");
      return;
    }

    const loaded = topicResult.data;
    setTopic(loaded);
    setFiles(filesResult.data ?? []);
    setSets(setsResult.data ?? []);
    setExercises(exercisesResult.data ?? []);
    setStatus("ready");

    // La asignatura y sus temas son contexto (miga de pan y selector de padre):
    // si fallan, la pagina sigue siendo usable.
    const [subjectResult, topicsResult] = await Promise.all([
      getAsignaturaAsignaturaAsignaturaIdGet({
        path: { asignatura_id: loaded.asignatura_id },
      }),
      listTemasTemaGet({ query: { asignatura_id: loaded.asignatura_id } }),
    ]);
    if (subjectResult.data) setSubjectName(subjectResult.data.name);
    setSiblings(topicsResult.data ?? []);
  }, [temaId]);

  useEffect(() => {
    void load();
  }, [load]);

  const parentTopic =
    topic?.parent_id != null
      ? siblings.find((item) => item.id === topic.parent_id) ?? null
      : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:py-8">
      {status === "loading" && (
        <div className="flex justify-center py-16 text-onyx-inkMuted">
          <Spinner label="Cargando tema" />
        </div>
      )}

      {status === "notfound" && (
        <NotFoundState
          title="No encontramos este tema"
          description="Puede que se haya borrado o que el enlace esté mal."
        />
      )}

      {status === "error" && <ErrorNotice message={error ?? ""} onRetry={() => void load()} />}

      {status === "ready" && topic && (
        <>
          <Link
            to={`/asignaturas/${topic.asignatura_id}`}
            className="focus-ring inline-flex max-w-full items-center gap-1.5 rounded-lg text-[13px] text-onyx-inkMuted transition-colors duration-150 hover:text-onyx-ink"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M12 5.5 7.5 10l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="truncate">{subjectName ?? "Asignatura"}</span>
          </Link>

          <PageHeader
            className="mt-4"
            title={topic.name}
            description={
              parentTopic
                ? `Subtema de ${parentTopic.name}${subjectName ? ` · ${subjectName}` : ""}.`
                : subjectName
                  ? `Tema de ${subjectName}.`
                  : "Archivos y sets de este tema."
            }
          />

          <div className="mt-6 flex flex-col gap-4">
            <TopicDetailsForm
              key={topic.id}
              topic={topic}
              topics={siblings}
              onSaved={(saved) => {
                setTopic(saved);
                setSiblings((current) =>
                  current.map((item) => (item.id === saved.id ? saved : item)),
                );
              }}
            />
            <TopicFilesSection topic={topic} files={files} onSaved={setTopic} />
            <TopicSetsSection
              topic={topic}
              sets={sets}
              onSaved={setTopic}
              onGenerate={() => setGenerateOpen(true)}
            />
            <TopicExerciseSection
              topic={topic}
              files={files}
              exercises={exercises}
              onCreated={() => {
                // El listado trae el resumen con contadores: se recarga.
                void listEjerciciosEjercicioGet({
                  query: { tema_id: topic.id },
                }).then((result) => {
                  if (result.data) setExercises(result.data);
                });
              }}
            />
          </div>

          <GenerateTopicCardsModal
            open={generateOpen}
            onClose={() => setGenerateOpen(false)}
            topic={topic}
            files={files}
            onCreated={(setId) => {
              setGenerateOpen(false);
              setTopic((current) => (current
                ? {
                    ...current,
                    flashcard_set_ids: Array.from(
                      new Set([...(current.flashcard_set_ids ?? []), setId]),
                    ),
                  }
                : current));
              // La lista de sets trae el nombre y los contadores: se recarga
              // para que el set nuevo salga completo.
              void listFlashcardSetsFlashcardSetGet().then((result) => {
                if (result.data) setSets(result.data);
              });
            }}
          />
        </>
      )}
    </div>
  );
}
