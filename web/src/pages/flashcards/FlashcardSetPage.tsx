import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createFlashcardFlashcardPost,
  deleteFlashcardFlashcardFlashcardIdDelete,
  getFlashcardSetFlashcardSetSetIdGet,
  listFlashcardsFlashcardGet,
  reviewFlashcardSetFlashcardSetSetIdReviewGet,
  updateFlashcardSetFlashcardSetSetIdPut,
} from "../../api/generated/sdk.gen";
import type {
  FlashcardRead,
  FlashcardSetRead,
} from "../../api/generated/types.gen";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { EmptyState } from "../../components/ui/EmptyState";
import { Field } from "../../components/ui/Field";
import { IconButton } from "../../components/ui/IconButton";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/ui/Spinner";
import { Textarea } from "../../components/ui/Textarea";
import { useToast } from "../../components/ui/Toast";
import { PageHeader } from "../../layout/PageHeader";
import { apiErrorMessage } from "../../lib/api";
import { formatDateTime, formatRelative } from "../../lib/format";
import { ConfirmDialog } from "./ConfirmDialog";
import { DIFFICULTY_LABELS, ReviewSession } from "./ReviewSession";

const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 200;

type TrainMode = "due" | "all";

/** Texto del input -> entero dentro del rango; vacio o basura -> defecto. */
function clampLimit(raw: string): number {
  const parsed = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.round(parsed)));
}

/** Parametro de ruta -> id, o null si no es un entero positivo. */
function parseId(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export default function FlashcardSetPage() {
  const { setId: setIdParam } = useParams();
  const setId = parseId(setIdParam);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [flashcardSet, setSet] = useState<FlashcardSetRead | null>(null);
  const [cards, setCards] = useState<FlashcardRead[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [mode, setMode] = useState<TrainMode>("due");
  const [limit, setLimit] = useState(String(DEFAULT_LIMIT));
  const [starting, setStarting] = useState(false);
  const [noDueCards, setNoDueCards] = useState(false);
  const [session, setSession] = useState<FlashcardRead[] | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [adding, setAdding] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FlashcardRead | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (setId === null) return;

    setLoadError(null);
    try {
      const [{ data: setData }, { data: cardData }] = await Promise.all([
        getFlashcardSetFlashcardSetSetIdGet({
          path: { set_id: setId },
          throwOnError: true,
        }),
        listFlashcardsFlashcardGet({ throwOnError: true }),
      ]);

      setSet(setData);
      setCards(
        (cardData ?? []).filter((card) => card.flashcard_set_id === setData.id),
      );
    } catch (error) {
      setLoadError(apiErrorMessage(error));
      setCards([]);
    }
  }, [setId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitRename = async () => {
    if (setId === null || !flashcardSet || renaming) return;
    const name = renameName.trim();
    if (!name) return;

    setRenaming(true);
    try {
      const { data } = await updateFlashcardSetFlashcardSetSetIdPut({
        path: { set_id: setId },
        body: { name },
        throwOnError: true,
      });
      setSet(data);
      toast("Nombre actualizado.", "success");
      setRenameOpen(false);
    } catch (error) {
      toast(apiErrorMessage(error), "error");
    } finally {
      setRenaming(false);
    }
  };

  /** Trae la sesion del backend y la monta; all=true ignora el tope. */
  const startTraining = async (trainMode: TrainMode) => {
    if (setId === null || starting) return;

    const parsed = clampLimit(limit);
    setLimit(String(parsed));
    setMode(trainMode);
    setStarting(true);
    setNoDueCards(false);
    try {
      const { data } = await reviewFlashcardSetFlashcardSetSetIdReviewGet({
        path: { set_id: setId },
        query: { all: trainMode === "all", limit: parsed },
        throwOnError: true,
      });

      const cardsToReview = data ?? [];
      if (cardsToReview.length === 0) {
        if (trainMode === "due") {
          setNoDueCards(true);
        } else {
          toast("Este set todavía no tiene tarjetas.", "info");
        }
      } else {
        setSession(cardsToReview);
      }
    } catch (error) {
      toast(apiErrorMessage(error), "error");
    } finally {
      setStarting(false);
    }
  };

  const submitAdd = async () => {
    if (setId === null || adding) return;
    const frontText = front.trim();
    const backText = back.trim();
    if (!frontText || !backText) return;

    setAdding(true);
    try {
      const { data } = await createFlashcardFlashcardPost({
        body: {
          front: frontText,
          back: backText,
          flashcard_set_id: setId,
        },
        throwOnError: true,
      });

      setCards((current) => (current ? [...current, data] : [data]));
      setSet((current) =>
        current
          ? {
              ...current,
              flashcard_ids: [...(current.flashcard_ids ?? []), data.id],
            }
          : current,
      );
      toast("Tarjeta añadida.", "success");
      setAddOpen(false);
      setFront("");
      setBack("");
    } catch (error) {
      toast(apiErrorMessage(error), "error");
    } finally {
      setAdding(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;

    setDeleting(true);
    try {
      await deleteFlashcardFlashcardFlashcardIdDelete({
        path: { flashcard_id: deleteTarget.id },
        throwOnError: true,
      });
      setCards((current) =>
        current ? current.filter((card) => card.id !== deleteTarget.id) : current,
      );
      setSet((current) =>
        current
          ? {
              ...current,
              flashcard_ids: (current.flashcard_ids ?? []).filter(
                (id) => id !== deleteTarget.id,
              ),
            }
          : current,
      );
      toast("Tarjeta borrada.", "success");
      setDeleteTarget(null);
    } catch (error) {
      toast(apiErrorMessage(error), "error");
    } finally {
      setDeleting(false);
    }
  };

  if (setId === null) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-8 sm:px-6">
        <p role="alert" className="text-[13px] text-onyx-inkMuted">
          El set que buscas no existe.
        </p>
        <Button to="/flashcards" variant="secondary" className="mt-4">
          Volver a Flashcards
        </Button>
      </div>
    );
  }

  if (session) {
    return (
      <ReviewSession
        cards={session}
        heading={flashcardSet?.name ?? "Repaso del set"}
        onExit={() => {
          setSession(null);
          void load();
        }}
      />
    );
  }

  const isLoading = flashcardSet === null && !loadError;
  const cardTotal = cards?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6 sm:py-8">
      <nav aria-label="Migas de pan" className="mb-3">
        <Link
          to="/flashcards"
          className="focus-ring inline-flex items-center gap-1 rounded text-[13px] text-onyx-inkMuted transition-colors duration-150 hover:text-onyx-ink"
        >
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M12.5 5 7.5 10l5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Flashcards
        </Link>
      </nav>

      {isLoading && (
        <p className="flex items-center gap-2 text-[13px] text-onyx-inkMuted">
          <Spinner size="sm" label="Cargando el set" />
          Cargando el set…
        </p>
      )}

      {loadError && (
        <>
          <p role="alert" className="text-[13px] leading-relaxed text-[#f0a8a1]">
            {loadError}
          </p>
          <Button to="/flashcards" variant="secondary" className="mt-4">
            Volver a Flashcards
          </Button>
        </>
      )}

      {flashcardSet && (
        <>
          <PageHeader
            title={flashcardSet.name}
            description={
              cardTotal === 1 ? "1 tarjeta" : `${cardTotal} tarjetas`
            }
            actions={
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRenameName(flashcardSet.name);
                    setRenameOpen(true);
                  }}
                >
                  Renombrar
                </Button>
                <Button variant="secondary" onClick={() => setAddOpen(true)}>
                  Añadir tarjeta
                </Button>
                <Button
                  onClick={() => void startTraining(mode)}
                  disabled={starting || cardTotal === 0}
                >
                  {starting && <Spinner size="sm" label="Preparando el repaso" />}
                  {starting ? "Preparando…" : "Entrenar"}
                </Button>
              </>
            }
          />

          <section
            aria-label="Entrenar el set"
            className="mt-6 rounded-xl border border-onyx-line bg-onyx-surface p-4 sm:p-5"
          >
            <h2 className="text-[15px] font-medium text-onyx-ink">Entrenar</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-onyx-inkMuted">
              Repasa solo lo que toca hoy o pasa por todas las tarjetas del set.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Chip active={mode === "due"} onClick={() => setMode("due")}>
                Solo las que tocan hoy
              </Chip>
              <Chip active={mode === "all"} onClick={() => setMode("all")}>
                Todas
              </Chip>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              {mode === "due" ? (
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
              ) : (
                <p className="pb-2 text-[13px] text-onyx-inkFaint">
                  Se repasan todas las tarjetas del set.
                </p>
              )}

              <Button
                onClick={() => void startTraining(mode)}
                disabled={starting || cardTotal === 0}
              >
                {starting && <Spinner size="sm" label="Preparando el repaso" />}
                {starting ? "Preparando…" : "Empezar"}
              </Button>
            </div>

            {noDueCards && (
              <EmptyState
                className="mt-4"
                title="No hay tarjetas pendientes hoy"
                description="Este set está al día. Puedes repasarlo entero igualmente."
                action={
                  <Button variant="secondary" onClick={() => void startTraining("all")}>
                    Entrenar todas
                  </Button>
                }
              />
            )}
          </section>

          <section aria-labelledby="cards-heading" className="mt-8">
            <h2 id="cards-heading" className="text-[15px] font-medium text-onyx-ink">
              Tarjetas
            </h2>

            {cards !== null && cards.length === 0 && (
              <EmptyState
                className="mt-3"
                title="Este set está vacío"
                description="Añade tarjetas a mano o genera un set nuevo desde tus documentos."
                action={
                  <Button variant="secondary" onClick={() => setAddOpen(true)}>
                    Añadir tarjeta
                  </Button>
                }
              />
            )}

            {cards !== null && cards.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {cards.map((card) => (
                  <li key={card.id}>
                    <div className="flex min-w-0 items-center gap-1 rounded-xl border border-onyx-line bg-onyx-surface pr-1 transition-colors duration-150 hover:bg-onyx-surfaceHover">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/flashcards/${flashcardSet.id}/cards/${card.id}`)
                        }
                        aria-label={`Abrir tarjeta: ${card.front}`}
                        className="focus-ring min-w-0 flex-1 rounded-lg px-3 py-3 text-left"
                      >
                        <span className="block truncate text-[14px] text-onyx-ink">
                          {card.front}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-onyx-inkFaint">
                          <span className="rounded-full border border-onyx-line px-2 py-0.5">
                            {DIFFICULTY_LABELS[card.difficulty]}
                          </span>
                          <span>
                            {card.last_seen ? (
                              <time dateTime={card.last_seen} title={formatDateTime(card.last_seen)}>
                                {formatRelative(card.last_seen)}
                              </time>
                            ) : (
                              "Nunca vista"
                            )}
                          </span>
                        </span>
                      </button>

                      <IconButton
                        aria-label={`Borrar tarjeta: ${card.front}`}
                        size="sm"
                        tone="danger"
                        onClick={() => setDeleteTarget(card)}
                      >
                        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                          <path d="M4.5 6.5h11M8 6.5V4.5h4v2M6.5 6.5l.7 9h5.6l.7-9" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Modal
            open={renameOpen}
            onClose={() => {
              if (!renaming) setRenameOpen(false);
            }}
            title="Renombrar set"
            size="sm"
            footer={
              <>
                <Button variant="secondary" onClick={() => setRenameOpen(false)} disabled={renaming}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => void submitRename()}
                  disabled={renaming || renameName.trim().length === 0}
                >
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

          <Modal
            open={addOpen}
            onClose={() => {
              if (!adding) setAddOpen(false);
            }}
            title="Añadir tarjeta"
            description="La pregunta va delante; la respuesta, detrás."
            footer={
              <>
                <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={adding}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => void submitAdd()}
                  disabled={
                    adding || front.trim().length === 0 || back.trim().length === 0
                  }
                >
                  {adding && <Spinner size="sm" label="Guardando" />}
                  {adding ? "Guardando…" : "Añadir"}
                </Button>
              </>
            }
          >
            <div className="flex min-w-0 flex-col gap-4">
              <Field label="Delante">
                {({ id, invalid, ...aria }) => (
                  <Textarea
                    id={id}
                    rows={3}
                    value={front}
                    onChange={(event) => setFront(event.target.value)}
                    placeholder="Pregunta"
                    disabled={adding}
                    invalid={invalid}
                    {...aria}
                  />
                )}
              </Field>
              <Field label="Detrás">
                {({ id, invalid, ...aria }) => (
                  <Textarea
                    id={id}
                    rows={3}
                    value={back}
                    onChange={(event) => setBack(event.target.value)}
                    placeholder="Respuesta"
                    disabled={adding}
                    invalid={invalid}
                    {...aria}
                  />
                )}
              </Field>
            </div>
          </Modal>

          <ConfirmDialog
            open={deleteTarget !== null}
            title="Borrar tarjeta"
            description={
              deleteTarget
                ? `Se borrará «${deleteTarget.front}».`
                : ""
            }
            busy={deleting}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => void confirmDelete()}
          />
        </>
      )}
    </div>
  );
}
