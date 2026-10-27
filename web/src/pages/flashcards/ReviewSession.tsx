import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  deleteFlashcardFlashcardFlashcardIdDelete,
  markSeenFlashcardFlashcardIdSeenPost,
  updateFlashcardFlashcardFlashcardIdPut,
} from "../../api/generated/sdk.gen";
import type { FlashcardRead } from "../../api/generated/types.gen";
import {
  FlashcardViewer,
  type FlashcardGrade,
} from "../../components/FlashcardViewer";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/ui/Spinner";
import { Textarea } from "../../components/ui/Textarea";
import { useToast } from "../../components/ui/Toast";
import { apiErrorMessage } from "../../lib/api";
import { ConfirmDialog } from "./ConfirmDialog";

/** Etiquetas de dificultad, compartidas por listas, sesion y ficha. */
export const DIFFICULTY_LABELS: Record<FlashcardGrade, string> = {
  hard: "Difícil",
  medium: "Medio",
  easy: "Fácil",
};

const GRADES: FlashcardGrade[] = ["hard", "medium", "easy"];

type Counts = Record<FlashcardGrade, number>;

const EMPTY_COUNTS: Counts = { hard: 0, medium: 0, easy: 0 };

export interface ReviewSessionProps {
  /** Tarjetas ya cargadas por la pagina; la sesion no vuelve a pedirlas. */
  cards: FlashcardRead[];
  /** Contexto que se pinta encima de la tarjeta (set o "Test global"). */
  heading: string;
  /** Vuelta a la pagina: se llama al salir y al cerrar el resumen. */
  onExit: () => void;
}

/**
 * Sesion de repaso: revela, puntua contra el endpoint seen y avanza. Al
 * terminar pinta el resumen con el recuento por dificultad.
 *
 * Cada voto se envia de uno en uno; si falla, la tarjeta se queda en pantalla
 * y el usuario puede reintentar. La sesion no se puede salir sin votar: el
 * estado se pierde, pero lo ya votado queda guardado en el backend.
 */
export function ReviewSession({ cards, heading, onExit }: ReviewSessionProps) {
  const { toast } = useToast();
  const formId = useId();
  // Copia local: borrar o editar una tarjeta no debe tocar el array de la
  // pagina, que se recarga al salir.
  const [sessionCards, setSessionCards] = useState(cards);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [finished, setFinished] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editing, setEditing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const total = sessionCards.length;
  const card = sessionCards[index];
  const busy = saving || deleting || editing;

  // Al pasar de tarjeta el boton votado desaparece: el foco vuelve a la zona
  // de la tarjeta para que el teclado siga funcionando (Espacio revela).
  useEffect(() => {
    if (index > 0) cardRef.current?.focus();
  }, [index]);

  const reveal = useCallback(() => setRevealed(true), []);

  const grade = useCallback(
    async (value: FlashcardGrade) => {
      if (!card || saving || deleteOpen || editOpen) return;

      setSaving(true);
      try {
        await markSeenFlashcardFlashcardIdSeenPost({
          path: { flashcard_id: card.id },
          body: { difficulty: value },
          throwOnError: true,
        });

        setCounts((current) => ({ ...current, [value]: current[value] + 1 }));
        setRevealed(false);

        if (index + 1 >= total) {
          setFinished(true);
        } else {
          setIndex(index + 1);
        }
      } catch (error) {
        toast(apiErrorMessage(error), "error");
      } finally {
        setSaving(false);
      }
    },
    [card, deleteOpen, editOpen, index, saving, toast, total],
  );

  /**
   * Borra la tarjeta actual y deja en pantalla la siguiente. Si era la ultima,
   * se pasa al resumen (o a "sin tarjetas" si el set se ha quedado vacio).
   */
  const confirmDelete = async () => {
    if (!card || deleting) return;

    setDeleting(true);
    try {
      await deleteFlashcardFlashcardFlashcardIdDelete({
        path: { flashcard_id: card.id },
        throwOnError: true,
      });

      const remaining = sessionCards.filter((item) => item.id !== card.id);
      setSessionCards(remaining);
      setDeleteOpen(false);
      setRevealed(false);

      if (remaining.length === 0) {
        setFinished(true);
      } else if (index >= remaining.length) {
        setIndex(remaining.length - 1);
      }
      toast("Tarjeta borrada.", "success");
    } catch (error) {
      toast(apiErrorMessage(error), "error");
    } finally {
      setDeleting(false);
    }
  };

  const submitEdit = async () => {
    if (!card || editing) return;

    const frontText = editFront.trim();
    const backText = editBack.trim();
    if (!frontText || !backText) return;

    setEditing(true);
    try {
      const { data } = await updateFlashcardFlashcardFlashcardIdPut({
        path: { flashcard_id: card.id },
        body: { front: frontText, back: backText },
        throwOnError: true,
      });

      setSessionCards((current) =>
        current.map((item) => (item.id === data.id ? data : item)),
      );
      setEditOpen(false);
      toast("Tarjeta actualizada.", "success");
    } catch (error) {
      toast(apiErrorMessage(error), "error");
    } finally {
      setEditing(false);
    }
  };

  if (finished) {
    const reviewed = GRADES.reduce((sum, value) => sum + counts[value], 0);

    return (
      <div className="mx-auto w-full max-w-[640px] px-4 py-8 sm:px-6">
        <p className="text-[11px] uppercase tracking-wide text-onyx-inkFaint">
          {heading}
        </p>
        <h1 className="mt-1 text-[22px] font-medium leading-tight tracking-[-0.02em] text-onyx-ink sm:text-[26px]">
          Repaso terminado
        </h1>
        <p
          role="status"
          className="mt-2 text-[13px] leading-relaxed text-onyx-inkMuted"
        >
          {sessionCards.length === 0
            ? "No queda ninguna tarjeta en esta sesión."
            : `${
                reviewed === 1
                  ? "Has repasado 1 tarjeta."
                  : `Has repasado ${reviewed} tarjetas.`
              } Las próximas fechas de repaso ya están actualizadas.`}
        </p>

        <dl className="mt-6 grid grid-cols-3 gap-2">
          {GRADES.map((value) => (
            <div
              key={value}
              className="min-w-0 rounded-xl border border-onyx-line bg-onyx-surface px-3 py-3 text-center"
            >
              <dt className="truncate text-[11px] uppercase tracking-wide text-onyx-inkFaint">
                {DIFFICULTY_LABELS[value]}
              </dt>
              <dd className="mt-1 text-[22px] font-medium leading-none text-onyx-ink">
                {counts[value]}
              </dd>
            </div>
          ))}
        </dl>

        <Button onClick={onExit} className="mt-6 w-full sm:w-auto">
          Volver
        </Button>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="mx-auto w-full max-w-[640px] px-4 py-8 sm:px-6">
        <p role="alert" className="text-[13px] text-onyx-inkMuted">
          No hay tarjetas en esta sesión.
        </p>
        <Button variant="secondary" onClick={onExit} className="mt-4">
          Volver
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-6 sm:px-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] uppercase tracking-wide text-onyx-inkFaint">
            {heading}
          </p>
          <h1 className="mt-1 text-[20px] font-medium leading-tight tracking-[-0.02em] text-onyx-ink sm:text-[22px]">
            Repaso
          </h1>
        </div>
        <Button variant="ghost" size="sm" onClick={onExit}>
          Salir
        </Button>
      </header>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[12px] text-onyx-inkFaint">
          Tarjeta {index + 1} de {total}
        </p>
        {saving && (
          <span className="flex items-center gap-1.5 text-[12px] text-onyx-inkFaint">
            <Spinner size="sm" label="Guardando" />
            Guardando…
          </span>
        )}
      </div>

      <div
        role="progressbar"
        aria-label="Progreso del repaso"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={index + 1}
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-onyx-surface"
      >
        <div
          className="h-full rounded-full bg-white/80 transition-[width] duration-150"
          style={{ width: `${((index + 1) / total) * 100}%` }}
          aria-hidden
        />
      </div>

      <div ref={cardRef} tabIndex={-1} className="mt-5 outline-none">
        <FlashcardViewer
          front={card.front}
          back={card.back}
          revealed={revealed}
          onReveal={reveal}
          onGrade={(value) => {
            void grade(value);
          }}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-onyx-line pt-3">
        <p className="text-[12px] text-onyx-inkFaint">
          Puedes corregir la tarjeta sin salir del repaso.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setEditFront(card.front);
              setEditBack(card.back);
              setEditOpen(true);
            }}
          >
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setDeleteOpen(true)}
          >
            Borrar y pasar
          </Button>
        </div>
      </div>

      <Modal
        open={editOpen}
        onClose={() => {
          if (!editing) setEditOpen(false);
        }}
        title="Editar tarjeta"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setEditOpen(false)}
              disabled={editing}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form={formId}
              disabled={
                editing ||
                editFront.trim().length === 0 ||
                editBack.trim().length === 0
              }
            >
              {editing && <Spinner size="sm" label="Guardando" />}
              {editing ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            void submitEdit();
          }}
          className="flex min-w-0 flex-col gap-4"
        >
          <Field label="Delante">
            {({ id, invalid, ...aria }) => (
              <Textarea
                id={id}
                rows={4}
                value={editFront}
                onChange={(event) => setEditFront(event.target.value)}
                disabled={editing}
                invalid={invalid}
                {...aria}
              />
            )}
          </Field>
          <Field label="Detrás">
            {({ id, invalid, ...aria }) => (
              <Textarea
                id={id}
                rows={5}
                value={editBack}
                onChange={(event) => setEditBack(event.target.value)}
                disabled={editing}
                invalid={invalid}
                {...aria}
              />
            )}
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="Borrar tarjeta"
        description={`Se borrará «${card.front}» y se pasará a la siguiente. No se puede deshacer.`}
        busy={deleting}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

export default ReviewSession;
