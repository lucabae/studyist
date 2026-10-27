import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createFlashcardSetFlashcardSetPost,
  deleteFlashcardSetFlashcardSetSetIdDelete,
  listFlashcardSetsFlashcardSetGet,
  reviewFlashcardsFlashcardReviewGet,
  updateFlashcardSetFlashcardSetSetIdPut,
} from "../../api/generated/sdk.gen";
import type {
  FlashcardRead,
  FlashcardSetRead,
} from "../../api/generated/types.gen";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Field } from "../../components/ui/Field";
import { IconButton } from "../../components/ui/IconButton";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../components/ui/Toast";
import { PageHeader } from "../../layout/PageHeader";
import { apiErrorMessage } from "../../lib/api";
import { ConfirmDialog } from "./ConfirmDialog";
import { GenerateSetModal } from "./GenerateSetModal";
import { ReviewSession } from "./ReviewSession";

const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 200;

/** Texto del input -> entero dentro del rango; vacio o basura -> defecto. */
function clampLimit(raw: string): number {
  const parsed = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.round(parsed)));
}

/** Cuantas tarjetas tiene el set, sin cargar la relacion. */
function cardCount(set: FlashcardSetRead): number {
  return set.flashcard_ids?.length ?? 0;
}

/** Nombre del set vacio: el modal no deja guardarlo, pero el backend si. */
function cleanName(name: string): string {
  return name.trim();
}

export default function FlashcardSetsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [sets, setSets] = useState<FlashcardSetRead[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);

  const [renameTarget, setRenameTarget] = useState<FlashcardSetRead | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FlashcardSetRead | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [generateOpen, setGenerateOpen] = useState(false);

  const [limit, setLimit] = useState(String(DEFAULT_LIMIT));
  const [starting, setStarting] = useState(false);
  const [session, setSession] = useState<FlashcardRead[] | null>(null);
  const [noDueCards, setNoDueCards] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const { data } = await listFlashcardSetsFlashcardSetGet({ throwOnError: true });
      setSets(data ?? []);
    } catch (error) {
      setLoadError(apiErrorMessage(error));
      setSets([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submitCreate = async () => {
    const name = cleanName(createName);
    if (!name || creating) return;

    setCreating(true);
    try {
      const { data } = await createFlashcardSetFlashcardSetPost({
        body: { name },
        throwOnError: true,
      });
      toast("Set creado.", "success");
      setCreateOpen(false);
      setCreateName("");
      navigate(`/flashcards/${data.id}`);
    } catch (error) {
      toast(apiErrorMessage(error), "error");
    } finally {
      setCreating(false);
    }
  };

  const submitRename = async () => {
    const name = cleanName(renameName);
    if (!renameTarget || !name || renaming) return;

    setRenaming(true);
    try {
      const { data } = await updateFlashcardSetFlashcardSetSetIdPut({
        path: { set_id: renameTarget.id },
        body: { name },
        throwOnError: true,
      });
      setSets((current) =>
        current ? current.map((item) => (item.id === data.id ? data : item)) : current,
      );
      toast("Nombre actualizado.", "success");
      setRenameTarget(null);
    } catch (error) {
      toast(apiErrorMessage(error), "error");
    } finally {
      setRenaming(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;

    setDeleting(true);
    try {
      await deleteFlashcardSetFlashcardSetSetIdDelete({
        path: { set_id: deleteTarget.id },
        throwOnError: true,
      });
      setSets((current) =>
        current ? current.filter((item) => item.id !== deleteTarget.id) : current,
      );
      toast("Set borrado.", "success");
      setDeleteTarget(null);
    } catch (error) {
      toast(apiErrorMessage(error), "error");
    } finally {
      setDeleting(false);
    }
  };

  const startGlobalTest = async () => {
    if (starting) return;

    const parsed = clampLimit(limit);
    setLimit(String(parsed));
    setStarting(true);
    setNoDueCards(false);
    try {
      const { data } = await reviewFlashcardsFlashcardReviewGet({
        query: { limit: parsed },
        throwOnError: true,
      });
      const cards = data ?? [];
      if (cards.length === 0) {
        setNoDueCards(true);
      } else {
        setSession(cards);
      }
    } catch (error) {
      toast(apiErrorMessage(error), "error");
    } finally {
      setStarting(false);
    }
  };

  const exitSession = () => {
    setSession(null);
    void load();
  };

  if (session) {
    return (
      <ReviewSession cards={session} heading="Test global" onExit={exitSession} />
    );
  }

  const totalCards = sets?.reduce((sum, set) => sum + cardCount(set), 0) ?? 0;

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Flashcards"
        description="Todos tus sets. Repasa lo que toca hoy o genera tarjetas desde tus documentos."
        actions={
          <>
            <Button variant="secondary" onClick={() => setGenerateOpen(true)}>
              Generar desde documentos
            </Button>
            <Button
              onClick={() => {
                setCreateName("");
                setCreateOpen(true);
              }}
            >
              Nuevo set
            </Button>
          </>
        }
      />

      <section aria-label="Test global" className="mt-6">
        <div className="rounded-xl border border-onyx-line bg-onyx-surface p-4 sm:p-5">
          <h2 className="text-[15px] font-medium text-onyx-ink">Test global</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-onyx-inkMuted">
            Repasa las tarjetas que tocan hoy en todos los sets.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Field
              label="Tope de tarjetas"
              hint={`Entre ${MIN_LIMIT} y ${MAX_LIMIT}.`}
              className="w-[140px]"
            >
              {({ id, invalid, ...aria }) => (
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={MIN_LIMIT}
                  max={MAX_LIMIT}
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  onBlur={() => setLimit(String(clampLimit(limit)))}
                  disabled={starting}
                  invalid={invalid}
                  {...aria}
                />
              )}
            </Field>

            <Button onClick={() => void startGlobalTest()} disabled={starting}>
              {starting && <Spinner size="sm" label="Preparando el test" />}
              {starting ? "Preparando…" : "Empezar test"}
            </Button>
          </div>

          {noDueCards && (
            <EmptyState
              className="mt-4"
              title="No hay tarjetas para hoy"
              description="Todas las tarjetas están al día. Vuelve mañana o repasa un set completo."
            />
          )}
        </div>
      </section>

      <section aria-labelledby="sets-heading" className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="sets-heading" className="text-[15px] font-medium text-onyx-ink">
            Tus sets
          </h2>
          {sets && sets.length > 0 && (
            <p className="text-[12px] text-onyx-inkFaint">
              {sets.length === 1 ? "1 set" : `${sets.length} sets`} ·{" "}
              {totalCards === 1 ? "1 tarjeta" : `${totalCards} tarjetas`}
            </p>
          )}
        </div>

        {loadError && (
          <p role="alert" className="mt-3 text-[13px] leading-relaxed text-[#f0a8a1]">
            {loadError}
          </p>
        )}

        {sets === null && !loadError && (
          <p className="mt-3 flex items-center gap-2 text-[13px] text-onyx-inkMuted">
            <Spinner size="sm" label="Cargando sets" />
            Cargando sets…
          </p>
        )}

        {sets !== null && sets.length === 0 && !loadError && (
          <EmptyState
            className="mt-3"
            title="Todavía no hay sets"
            description="Crea un set vacío y añade tarjetas a mano, o genera uno a partir de tus documentos."
            action={
              <Button variant="secondary" onClick={() => setGenerateOpen(true)}>
                Generar desde documentos
              </Button>
            }
          />
        )}

        {sets !== null && sets.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {sets.map((set) => (
              <li key={set.id}>
                <div className="flex min-w-0 items-center gap-1 rounded-xl border border-onyx-line bg-onyx-surface pr-1 transition-colors duration-150 hover:bg-onyx-surfaceHover">
                  <button
                    type="button"
                    onClick={() => navigate(`/flashcards/${set.id}`)}
                    aria-label={`Abrir ${set.name}`}
                    className="focus-ring flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-3 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-onyx-ink">
                        {set.name}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-onyx-inkFaint">
                        {cardCount(set) === 1
                          ? "1 tarjeta"
                          : `${cardCount(set)} tarjetas`}
                      </span>
                    </span>
                  </button>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <IconButton
                      aria-label={`Renombrar ${set.name}`}
                      size="sm"
                      onClick={() => {
                        setRenameTarget(set);
                        setRenameName(set.name);
                      }}
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                        <path d="M4.5 15.5h3l7-7-3-3-7 7zM11 5.5l3 3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </IconButton>
                    <IconButton
                      aria-label={`Borrar ${set.name}`}
                      size="sm"
                      tone="danger"
                      onClick={() => setDeleteTarget(set)}
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                        <path d="M4.5 6.5h11M8 6.5V4.5h4v2M6.5 6.5l.7 9h5.6l.7-9" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </IconButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={createOpen}
        onClose={() => {
          if (!creating) setCreateOpen(false);
        }}
        title="Nuevo set"
        description="El set se crea vacío; añádele tarjetas después."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={() => void submitCreate()} disabled={creating || !cleanName(createName)}>
              {creating && <Spinner size="sm" label="Creando" />}
              {creating ? "Creando…" : "Crear set"}
            </Button>
          </>
        }
      >
        <Field label="Nombre">
          {({ id, invalid, ...aria }) => (
            <Input
              id={id}
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Ej. Anatomía — Tema 2"
              maxLength={120}
              autoComplete="off"
              invalid={invalid}
              disabled={creating}
              {...aria}
            />
          )}
        </Field>
      </Modal>

      <Modal
        open={renameTarget !== null}
        onClose={() => {
          if (!renaming) setRenameTarget(null);
        }}
        title="Renombrar set"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenameTarget(null)} disabled={renaming}>
              Cancelar
            </Button>
            <Button onClick={() => void submitRename()} disabled={renaming || !cleanName(renameName)}>
              {renaming && <Spinner size="sm" label="Guardando" />}
              {renaming ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        <Field label="Nombre">
          {({ id, invalid, ...aria }) => (
            <Input
              id={id}
              value={renameName}
              onChange={(event) => setRenameName(event.target.value)}
              maxLength={120}
              autoComplete="off"
              invalid={invalid}
              disabled={renaming}
              {...aria}
            />
          )}
        </Field>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Borrar set"
        description={
          deleteTarget
            ? `Se borrará «${deleteTarget.name}» y sus ${cardCount(deleteTarget)} tarjetas.`
            : ""
        }
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />

      <GenerateSetModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onCreated={(setId) => {
          setGenerateOpen(false);
          navigate(`/flashcards/${setId}`);
        }}
      />
    </div>
  );
}
