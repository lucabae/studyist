import { useId, useMemo, useState, type FormEvent } from "react";
import {
  updateTemaTemaTemaIdPut,
  type TemaRead,
  type TemaUpdate,
} from "../../api/generated";
import { Button, Field, Input, MarkdownEditor, useToast } from "../../components";
import { apiErrorMessage } from "../../lib/api";
import { TopicSectionCard } from "./TopicSectionCard";
import { optionLabel, parentOptions } from "./topicTree";

export interface TopicDetailsFormProps {
  topic: TemaRead;
  /** Todos los temas de la asignatura, para poder moverlo de sitio. */
  topics?: TemaRead[];
  onSaved: (topic: TemaRead) => void;
}

/**
 * Nombre, notas y tema padre. Solo viaja al backend lo que ha cambiado: el
 * endpoint aplica las claves presentes (`exclude_unset`) y `null` vacía las
 * notas o devuelve el tema a la raiz.
 */
export function TopicDetailsForm({ topic, topics = [], onSaved }: TopicDetailsFormProps) {
  const { toast } = useToast();
  const formId = useId();
  const [name, setName] = useState(topic.name);
  const [notes, setNotes] = useState(topic.notes ?? "");
  const [parentId, setParentId] = useState(topic.parent_id ?? null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const originalNotes = topic.notes ?? "";
  const dirty =
    name !== topic.name || notes !== originalNotes || parentId !== (topic.parent_id ?? null);

  const options = useMemo(() => parentOptions(topics, topic.id), [topics, topic.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Ponle un nombre al tema.");
      return;
    }
    setNameError(null);

    const body: TemaUpdate = {};
    if (trimmed !== topic.name) body.name = trimmed;
    if (notes !== originalNotes) body.notes = notes.trim() ? notes : null;
    if (parentId !== (topic.parent_id ?? null)) body.parent_id = parentId;

    if (Object.keys(body).length === 0) {
      toast("No hay cambios que guardar.");
      return;
    }

    setSaving(true);
    const { data, error } = await updateTemaTemaTemaIdPut({
      path: { tema_id: topic.id },
      body,
    });
    setSaving(false);

    if (error || !data) {
      toast(apiErrorMessage(error), "error");
      return;
    }

    onSaved(data);
    toast("Tema guardado", "success");
  }

  return (
    <TopicSectionCard
      title="Detalles"
      action={
        <Button type="submit" form={formId} size="sm" disabled={!dirty || saving}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nombre" error={nameError}>
          {({ id, invalid, "aria-describedby": describedBy }) => (
            <Input
              id={id}
              value={name}
              onChange={(event) => setName(event.target.value)}
              invalid={invalid}
              aria-describedby={describedBy}
              autoComplete="off"
              maxLength={160}
            />
          )}
        </Field>

        <Field
          label="Tema padre"
          hint={
            options.length === 0
              ? "No hay otros temas donde colgarlo; queda en el primer nivel."
              : "Cambiarlo mueve el tema (y sus subtemas) dentro del temario."
          }
        >
          {({ id, "aria-describedby": describedBy }) => (
            <select
              id={id}
              value={parentId === null ? "" : String(parentId)}
              onChange={(event) =>
                setParentId(event.target.value ? Number(event.target.value) : null)
              }
              aria-describedby={describedBy}
              className="focus-ring h-10 w-full rounded-lg border border-onyx-line bg-onyx-surface px-3 text-[16px] text-onyx-ink outline-none"
            >
              <option value="">Sin padre (primer nivel)</option>
              {options.map((row) => (
                <option key={row.topic.id} value={row.topic.id}>
                  {optionLabel(row)}
                </option>
              ))}
            </select>
          )}
        </Field>

        <MarkdownEditor label="Notas" value={notes} onChange={setNotes} />
      </form>
    </TopicSectionCard>
  );
}
