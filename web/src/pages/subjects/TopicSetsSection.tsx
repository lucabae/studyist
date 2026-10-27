import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  updateTemaTemaTemaIdPut,
  type FlashcardSetRead,
  type TemaRead,
} from "../../api/generated";
import { Button, useToast } from "../../components";
import { apiErrorMessage } from "../../lib/api";
import { EntityPickerModal } from "./EntityPickerModal";
import { TopicSectionCard } from "./TopicSectionCard";

export interface TopicSetsSectionProps {
  topic: TemaRead;
  sets: FlashcardSetRead[];
  onSaved: (topic: TemaRead) => void;
  /** Abre el formulario de generacion de tarjetas del tema. */
  onGenerate: () => void;
}

/** Flashcard sets vinculados al tema; se abren en su página de entrenamiento. */
export function TopicSetsSection({
  topic,
  sets,
  onSaved,
  onGenerate,
}: TopicSetsSectionProps) {
  const { toast } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);

  const setIds = topic.flashcard_set_ids ?? [];
  const setsById = useMemo(() => new Map(sets.map((set) => [set.id, set])), [sets]);

  const pickerItems = useMemo(
    () =>
      sets.map((set) => ({
        id: set.id,
        name: set.name,
        meta: `${set.flashcard_ids?.length ?? 0} tarjetas`,
      })),
    [sets],
  );

  async function handleSave(ids: number[]) {
    const { data, error } = await updateTemaTemaTemaIdPut({
      path: { tema_id: topic.id },
      body: { flashcard_set_ids: ids },
    });

    if (error || !data) {
      toast(apiErrorMessage(error), "error");
      throw error ?? new Error("No se pudieron guardar los sets");
    }

    onSaved(data);
    setPickerOpen(false);
    toast("Flashcard sets actualizados", "success");
  }

  return (
    <TopicSectionCard
      title="Flashcard sets"
      count={setIds.length}
      action={
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            onClick={onGenerate}
            disabled={(topic.file_ids?.length ?? 0) === 0}
            title={
              (topic.file_ids?.length ?? 0) === 0
                ? "Añade archivos al tema para generar tarjetas"
                : undefined
            }
          >
            Crear flashcards
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
            Gestionar
          </Button>
        </div>
      }
    >
      {setIds.length === 0 ? (
        <p className="px-1 py-2 text-[13px] text-onyx-inkFaint">
          Este tema todavía no tiene flashcard sets.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {setIds.map((setId) => {
            const set = setsById.get(setId);

            return (
              <li key={setId} className="min-w-0">
                <Link
                  to={`/flashcards/${setId}`}
                  className="focus-ring flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-onyx-surfaceHover"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] text-onyx-ink">
                      {set?.name ?? `Set #${setId}`}
                    </span>
                    {set && (
                      <span className="mt-0.5 block text-[12px] text-onyx-inkFaint">
                        {set.flashcard_ids?.length ?? 0} tarjetas
                      </span>
                    )}
                  </span>
                  <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-onyx-inkFaint" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                    <path d="M7.5 5 12.5 10l-5 5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <EntityPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Flashcard sets del tema"
        description="Marca los sets que repasan este tema."
        items={pickerItems}
        initialIds={setIds}
        emptyLabel="No hay sets que coincidan con la búsqueda."
        searchLabel="Buscar set"
        onSave={handleSave}
      />
    </TopicSectionCard>
  );
}
