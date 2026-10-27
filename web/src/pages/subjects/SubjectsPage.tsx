import { useCallback, useEffect, useState } from "react";
import {
  deleteAsignaturaAsignaturaAsignaturaIdDelete,
  listAsignaturasAsignaturaGet,
  type AsignaturaRead,
} from "../../api/generated";
import { Button, EmptyState, Spinner, useToast } from "../../components";
import { PageHeader } from "../../layout/PageHeader";
import { apiErrorMessage } from "../../lib/api";
import { ConfirmDialog } from "./ConfirmDialog";
import { ErrorNotice } from "./ErrorNotice";
import { SubjectCard } from "./SubjectCard";
import { SubjectFormModal } from "./SubjectFormModal";

type Status = "loading" | "ready" | "error";

/**
 * Listado de asignaturas (`/asignaturas`).
 *
 * El backend ya devuelve `tema_count`, asi que no hace falta pedir los temas:
 * una sola peticion alimenta las tarjetas.
 */
export default function SubjectsPage() {
  const { toast } = useToast();
  const [subjects, setSubjects] = useState<AsignaturaRead[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AsignaturaRead | null>(null);
  const [deleting, setDeleting] = useState<AsignaturaRead | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    const { data, error: requestError } = await listAsignaturasAsignaturaGet();

    if (requestError || !data) {
      setError(apiErrorMessage(requestError));
      setStatus("error");
      return;
    }

    setSubjects(data);
    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(subject: AsignaturaRead) {
    setEditing(subject);
    setFormOpen(true);
  }

  function handleSaved(saved: AsignaturaRead) {
    setSubjects((current) => {
      const exists = current.some((item) => item.id === saved.id);
      if (!exists) return [...current, saved];
      return current.map((item) => (item.id === saved.id ? { ...item, ...saved } : item));
    });
    setFormOpen(false);
    setEditing(null);
    toast(editing ? "Asignatura actualizada" : "Asignatura creada", "success");
  }

  async function handleDelete() {
    if (!deleting) return;

    setDeletePending(true);
    const { error: requestError } = await deleteAsignaturaAsignaturaAsignaturaIdDelete({
      path: { asignatura_id: deleting.id },
    });
    setDeletePending(false);

    if (requestError) {
      toast(apiErrorMessage(requestError), "error");
      return;
    }

    setSubjects((current) => current.filter((item) => item.id !== deleting.id));
    setDeleting(null);
    toast("Asignatura borrada", "success");
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:py-8">
      <PageHeader
        title="Asignaturas"
        description="Cada asignatura agrupa sus temas, archivos y flashcard sets."
        actions={
          <Button onClick={openCreate}>
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M10 4.5v11M4.5 10h11" strokeLinecap="round" />
            </svg>
            Nueva asignatura
          </Button>
        }
      />

      <div className="mt-6">
        {status === "loading" && (
          <div className="flex justify-center py-16 text-onyx-inkMuted">
            <Spinner label="Cargando asignaturas" />
          </div>
        )}

        {status === "error" && <ErrorNotice message={error ?? ""} onRetry={() => void load()} />}

        {status === "ready" && subjects.length === 0 && (
          <EmptyState
            title="Todavía no hay asignaturas"
            description="Crea la primera para empezar a ordenar temas, apuntes y flashcards por curso."
            icon={
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path d="M4 5.5h12v11H4zM7 3.5v4M13 3.5v4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            action={<Button onClick={openCreate}>Crear asignatura</Button>}
          />
        )}

        {status === "ready" && subjects.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {subjects.map((subject) => (
              <li key={subject.id} className="min-w-0">
                <SubjectCard
                  subject={subject}
                  onEdit={() => openEdit(subject)}
                  onDelete={() => setDeleting(subject)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {status === "ready" && subjects.length > 0 && (
        <p className="mt-4 text-[12px] text-onyx-inkFaint">
          {subjects.length} asignatura{subjects.length === 1 ? "" : "s"}
        </p>
      )}

      <SubjectFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        subject={editing}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `¿Borrar “${deleting.name}”?` : "¿Borrar asignatura?"}
        description={
          deleting
            ? `Se borrarán también sus ${deleting.tema_count ?? 0} temas y todos los eventos asociados a la asignatura.`
            : ""
        }
        pending={deletePending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
