import { useEffect, useId, useState, type FormEvent } from "react";
import {
  createAsignaturaAsignaturaPost,
  updateAsignaturaAsignaturaAsignaturaIdPut,
  type AsignaturaRead,
} from "../../api/generated";
import { Button, Field, Input, Modal } from "../../components";
import { apiErrorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { colorToHex, paletteWith } from "./subjectColor";

export interface SubjectFormModalProps {
  open: boolean;
  onClose: () => void;
  /** `null` crea una asignatura nueva; con valor, edita esa. */
  subject?: AsignaturaRead | null;
  onSaved: (subject: AsignaturaRead) => void;
}

const YEARS = [1, 2, 3, 4, 5, 6] as const;

const SELECT_CLASS =
  "focus-ring h-10 w-full rounded-lg border border-onyx-line bg-onyx-surface px-3 text-[16px] text-onyx-ink sm:text-[15px]";

/**
 * Formulario de asignatura compartido por el listado y la cabecera del
 * detalle. Crea con POST y edita con PUT enviando la fila completa.
 */
export function SubjectFormModal({ open, onClose, subject, onSaved }: SubjectFormModalProps) {
  const formId = useId();
  const [name, setName] = useState("");
  const [year, setYear] = useState<number>(1);
  const [semester, setSemester] = useState<1 | 2>(1);
  const [color, setColor] = useState<string>("8f9b9e");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Cada apertura parte de los datos actuales (o de los valores por defecto).
  useEffect(() => {
    if (!open) return;
    setName(subject?.name ?? "");
    setYear(subject?.year ?? 1);
    setSemester(subject?.semester ?? 1);
    setColor(subject?.color?.replace(/^#/, "").toLowerCase() ?? "8f9b9e");
    setNameError(null);
    setFormError(null);
    setSaving(false);
  }, [open, subject]);

  const palette = paletteWith(subject?.color ?? color);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Ponle un nombre a la asignatura.");
      return;
    }
    setNameError(null);
    setFormError(null);
    setSaving(true);

    const body = { name: trimmed, year, semester, color };
    const result = subject
      ? await updateAsignaturaAsignaturaAsignaturaIdPut({
          path: { asignatura_id: subject.id },
          body,
        })
      : await createAsignaturaAsignaturaPost({ body });

    setSaving(false);

    if (result.error || !result.data) {
      setFormError(apiErrorMessage(result.error));
      return;
    }

    onSaved(result.data);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={subject ? "Editar asignatura" : "Nueva asignatura"}
      description={
        subject
          ? "Cambia los datos; los temas y eventos se mantienen."
          : "El nombre no se puede repetir."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? "Guardando…" : subject ? "Guardar cambios" : "Crear asignatura"}
          </Button>
        </>
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
              placeholder="Cálculo II"
              autoComplete="off"
              maxLength={120}
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Año">
            {({ id }) => (
              <select
                id={id}
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
                className={SELECT_CLASS}
              >
                {YEARS.map((option) => (
                  <option key={option} value={option}>
                    {option}º año
                  </option>
                ))}
              </select>
            )}
          </Field>

          {/* Grupo de radios: el `Field` pintaria un label apuntando a un id
              inexistente, asi que la etiqueta va en el propio radiogroup. */}
          <div className="flex min-w-0 flex-col gap-1.5">
            <span id={`${formId}-semester-label`} className="text-[13px] font-medium text-onyx-inkMuted">
              Semestre
            </span>
            <div
              role="radiogroup"
              aria-labelledby={`${formId}-semester-label`}
              className="flex gap-2"
            >
              {([1, 2] as const).map((option) => (
                <label
                  key={option}
                  className={cn(
                    "focus-within:ring-2 focus-within:ring-white/40 focus-within:ring-offset-2 focus-within:ring-offset-onyx-bg flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg border text-[14px] transition-colors duration-150",
                    semester === option
                      ? "border-onyx-inkFaint bg-onyx-surfaceHover text-onyx-ink"
                      : "border-onyx-line text-onyx-inkMuted hover:bg-onyx-surfaceHover",
                  )}
                >
                  <input
                    type="radio"
                    name={`${formId}-semester`}
                    value={option}
                    checked={semester === option}
                    onChange={() => setSemester(option)}
                    className="sr-only"
                  />
                  {option}º
                </label>
              ))}
            </div>
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-medium text-onyx-inkMuted">Color</legend>
          <div className="flex flex-wrap gap-2">
            {palette.map((option) => (
              <label
                key={option.hex}
                title={option.name}
                className={cn(
                  "focus-within:ring-2 focus-within:ring-white/40 focus-within:ring-offset-2 focus-within:ring-offset-onyx-bg flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border transition-colors duration-150",
                  color === option.hex ? "border-onyx-ink" : "border-onyx-line hover:border-onyx-inkFaint",
                )}
              >
                <input
                  type="radio"
                  name={`${formId}-color`}
                  value={option.hex}
                  checked={color === option.hex}
                  onChange={() => setColor(option.hex)}
                  aria-label={option.name}
                  className="sr-only"
                />
                <span
                  className="h-6 w-6 rounded-full"
                  style={{ backgroundColor: colorToHex(option.hex) }}
                  aria-hidden
                />
              </label>
            ))}
          </div>
        </fieldset>

        {formError && (
          <p role="alert" className="text-[13px] leading-relaxed text-[#f0a8a1]">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  );
}
