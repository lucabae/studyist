import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  deleteTemaTemaTemaIdDelete,
  getAsignaturaAsignaturaAsignaturaIdGet,
  listTemasTemaGet,
  type AsignaturaRead,
  type TemaRead,
} from "../../api/generated";
import { Button, EmptyState, Spinner, useToast } from "../../components";
import { PageHeader } from "../../layout/PageHeader";
import { apiErrorMessage } from "../../lib/api";
import { ConfirmDialog } from "./ConfirmDialog";
import { ErrorNotice } from "./ErrorNotice";
import { NewTopicModal } from "./NewTopicModal";
import { NotFoundState } from "./NotFoundState";
import { SubjectFormModal } from "./SubjectFormModal";
import { colorToHex } from "./subjectColor";
import { collectSubtreeIds } from "./topicTree";
import { TopicTimeline } from "./TopicTimeline";

type Status = "loading" | "ready" | "notfound" | "error";

/**
 * Detalle de asignatura (`/asignaturas/:id`): datos de cabecera y timeline de
 * sus temas. La lista de temas ya llega ordenada de forma natural.
 */
export default function SubjectPage() {
  const { toast } = useToast();
  const { id } = useParams<{ id: string }>();
  const asignaturaId = Number(id);

  const [subject, setSubject] = useState<AsignaturaRead | null>(null);
  const [topics, setTopics] = useState<TemaRead[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [newTopicOpen, setNewTopicOpen] = useState(false);
  const [deleting, setDeleting] = useState<TemaRead | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(asignaturaId) || asignaturaId <= 0) {
      setStatus("notfound");
      return;
    }

    setStatus("loading");
    const [subjectResult, topicsResult] = await Promise.all([
      getAsignaturaAsignaturaAsignaturaIdGet({ path: { asignatura_id: asignaturaId } }),
      listTemasTemaGet({ query: { asignatura_id: asignaturaId } }),
    ]);

    if (subjectResult.response?.status === 404) {
      setStatus("notfound");
      return;
    }

    if (subjectResult.error || topicsResult.error || !subjectResult.data || !topicsResult.data) {
      setError(apiErrorMessage(subjectResult.error ?? topicsResult.error));
      setStatus("error");
      return;
    }

    setSubject(subjectResult.data);
    setTopics(topicsResult.data);
    setStatus("ready");
  }, [asignaturaId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Recarga solo los temas, sin tocar el estado de carga de la pagina. */
  const refreshTopics = useCallback(async () => {
    const { data } = await listTemasTemaGet({
      query: { asignatura_id: asignaturaId },
    });
    if (data) setTopics(data);
  }, [asignaturaId]);

  function handleCreated() {
    // Se recargan para que el padre recien estrenado tenga su child_ids al dia.
    void refreshTopics();
    setNewTopicOpen(false);
    toast("Tema creado", "success");
  }

  async function handleDelete() {
    if (!deleting) return;

    setDeletePending(true);
    const { error: requestError } = await deleteTemaTemaTemaIdDelete({
      path: { tema_id: deleting.id },
    });
    setDeletePending(false);

    if (requestError) {
      toast(apiErrorMessage(requestError), "error");
      return;
    }

    // Los subtemas caen en cascada en el backend: se refleja igual en local.
    const removed = collectSubtreeIds(topics, deleting.id);
    setTopics((current) => current.filter((item) => !removed.has(item.id)));
    setDeleting(null);
    toast("Tema borrado", "success");
  }

  const deletingChildCount = deleting?.child_ids?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:py-8">
      {status === "loading" && (
        <div className="flex justify-center py-16 text-onyx-inkMuted">
          <Spinner label="Cargando asignatura" />
        </div>
      )}

      {status === "notfound" && (
        <NotFoundState
          title="No encontramos esta asignatura"
          description="Puede que se haya borrado o que el enlace esté mal."
        />
      )}

      {status === "error" && <ErrorNotice message={error ?? ""} onRetry={() => void load()} />}

      {status === "ready" && subject && (
        <>
          <div className="flex items-center justify-between gap-3">
            <Link
              to="/asignaturas"
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg text-[13px] text-onyx-inkMuted transition-colors duration-150 hover:text-onyx-ink"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M12 5.5 7.5 10l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Asignaturas
            </Link>

            <span
              aria-hidden
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: colorToHex(subject.color) }}
            />
          </div>

          <PageHeader
            className="mt-4"
            title={subject.name}
            description={`${subject.year}º año · Semestre ${subject.semester} · ${
              topics.length
            } ${topics.length === 1 ? "tema" : "temas"}`}
            actions={
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                Editar
              </Button>
            }
          />

          <section className="mt-7" aria-labelledby="temas-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="temas-heading" className="text-[15px] font-medium text-onyx-ink">
                Temas
              </h2>
              {topics.length > 0 && (
                <Button variant="secondary" size="sm" onClick={() => setNewTopicOpen(true)}>
                  Nuevo tema
                </Button>
              )}
            </div>

            <div className="mt-4">
              {topics.length === 0 ? (
                <EmptyState
                  title="Todavía no hay temas"
                  description="Los temas ordenan los archivos y sets de la asignatura."
                  action={<Button onClick={() => setNewTopicOpen(true)}>Crear tema</Button>}
                />
              ) : (
                <TopicTimeline topics={topics} onDelete={setDeleting} />
              )}
            </div>
          </section>

          <SubjectFormModal
            open={editOpen}
            onClose={() => setEditOpen(false)}
            subject={subject}
            onSaved={(saved) => {
              setSubject(saved);
              setEditOpen(false);
              toast("Asignatura actualizada", "success");
            }}
          />

          <NewTopicModal
            open={newTopicOpen}
            onClose={() => setNewTopicOpen(false)}
            asignaturaId={subject.id}
            asignaturaName={subject.name}
            topics={topics}
            onCreated={handleCreated}
          />

          <ConfirmDialog
            open={deleting !== null}
            title={deleting ? `¿Borrar “${deleting.name}”?` : "¿Borrar tema?"}
            description={
              deletingChildCount > 0
                ? `Se borrarán también sus ${deletingChildCount} subtemas. Los archivos y los sets se conservan.`
                : "El tema se borrará con sus vínculos: los archivos y los flashcard sets se conservan."
            }
            pending={deletePending}
            onCancel={() => setDeleting(null)}
            onConfirm={() => void handleDelete()}
          />
        </>
      )}
    </div>
  );
}
