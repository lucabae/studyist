/**
 * Formulario de evento (crear y editar) sobre el Modal compartido.
 *
 * Al crear se elige tambien fecha y hora; al editar el campo queda
 * deshabilitado porque las fechas se fijan con antelacion y el calendario de
 * iCloud solo se escribe al crear (el proyecto es unidireccional).
 */
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { AsignaturaRead, EventoRead } from "../../api/generated";
import {
  Button,
  Chip,
  Field,
  Input,
  Modal,
  Spinner,
  TemaPicker,
} from "../../components";
import { datetimeLocalToIso, toDatetimeLocalValue } from "./madrid";

export interface EventFormValues {
  type: EventoRead["type"];
  asignaturaId: number;
  /** Tema vinculado; null si el evento no tiene tema. */
  temaId: number | null;
  name: string;
  /** Duracion en minutos; solo se usa en los examenes. */
  durationMinutes: number;
  /** Valor de `datetime-local`; en edicion se ignora. */
  fechaInput: string;
}

export interface EventFormModalProps {
  mode: "create" | "edit";
  event?: EventoRead;
  subjects: AsignaturaRead[];
  /** `false` mientras se cargan: evita decir "sin asignaturas" antes de tiempo. */
  subjectsReady: boolean;
  subjectsError: string | null;
  /** Fecha por defecto del alta (hora de pared de Madrid). */
  initialFechaInput: string;
  busy: boolean;
  /** Error del envio, ya traducido por `apiErrorMessage`. */
  error: string | null;
  onClose: () => void;
  onRetrySubjects: () => void;
  onSubmit: (values: EventFormValues) => void;
}

const FORM_ID = "evento-form";

const SELECT_CLASS =
  "focus-ring h-10 w-full rounded-lg border border-onyx-line bg-onyx-surface px-3 text-[16px] text-onyx-ink transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 sm:text-[15px]";

interface FieldErrors {
  name?: string;
  subject?: string;
  fecha?: string;
}

export function EventFormModal({
  mode,
  event,
  subjects,
  subjectsReady,
  subjectsError,
  initialFechaInput,
  busy,
  error,
  onClose,
  onRetrySubjects,
  onSubmit,
}: EventFormModalProps) {
  const isEdit = mode === "edit";

  const [type, setType] = useState<EventoRead["type"]>(event?.type ?? "Examen");
  const [name, setName] = useState(event?.name ?? "");
  const [subjectId, setSubjectId] = useState(event ? String(event.asignatura_id) : "");
  const [temaId, setTemaId] = useState<number | null>(event?.tema_id ?? null);
  const [durationMinutes, setDurationMinutes] = useState(
    String(event?.duration_minutes ?? 120),
  );
  const [fechaInput, setFechaInput] = useState(
    isEdit && event ? toDatetimeLocalValue(event.fecha) : initialFechaInput,
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const subjectValue = subjects.some((subject) => String(subject.id) === subjectId)
    ? subjectId
    : "";

  const handleSubmit = (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();

    const trimmed = name.trim();
    const asignaturaId = Number(subjectValue);
    const nextErrors: FieldErrors = {};

    if (!trimmed) nextErrors.name = "Escribe un nombre para el evento.";
    if (!subjectValue || !Number.isInteger(asignaturaId)) {
      nextErrors.subject = "Elige una asignatura.";
    }
    if (!isEdit && !datetimeLocalToIso(fechaInput)) {
      nextErrors.fecha = "Indica la fecha y la hora.";
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const parsedDuration = Number(durationMinutes);
    const duration = Number.isFinite(parsedDuration)
      ? Math.min(1440, Math.max(5, Math.round(parsedDuration)))
      : 120;

    onSubmit({ type, asignaturaId, temaId, name: trimmed, durationMinutes: duration, fechaInput });
  };

  const noSubjects = subjectsReady && subjects.length === 0 && !subjectsError;

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Editar evento" : "Nuevo evento"}
      description={
        isEdit
          ? "Puedes cambiar el tipo, la asignatura, el tema, el nombre y la duración."
          : "Se creará también en tu calendario de iCloud."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID} disabled={busy || noSubjects}>
            {busy && <Spinner size="sm" label="Guardando" />}
            {isEdit ? "Guardar cambios" : "Crear evento"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span id="evento-tipo" className="text-[13px] font-medium text-onyx-inkMuted">
            Tipo
          </span>
          <div role="group" aria-labelledby="evento-tipo" className="flex gap-2">
            <Chip active={type === "Examen"} onClick={() => setType("Examen")}>
              Examen
            </Chip>
            <Chip active={type === "Tarea"} onClick={() => setType("Tarea")}>
              Tarea
            </Chip>
          </div>
        </div>

        <Field label="Asignatura" error={fieldErrors.subject}>
          {({ id, invalid, "aria-describedby": describedBy }) => (
            <select
              id={id}
              value={subjectValue}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              onChange={(changeEvent) => {
                setSubjectId(changeEvent.target.value);
                // El tema de otra asignatura no vale: al cambiarla se limpia.
                setTemaId(null);
              }}
              disabled={busy || noSubjects}
              className={SELECT_CLASS}
            >
              <option value="">{noSubjects ? "Sin asignaturas" : "Elige una asignatura"}</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        {noSubjects && (
          <p className="text-[13px] leading-relaxed text-onyx-inkMuted">
            Todavía no hay asignaturas.{" "}
            <Link
              to="/asignaturas"
              className="focus-ring rounded text-onyx-ink underline underline-offset-2"
            >
              Crea una primero
            </Link>
            .
          </p>
        )}

        {subjectsError && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p role="alert" className="text-[12px] text-[#f0a8a1]">
              {subjectsError}
            </p>
            <Button variant="ghost" size="sm" onClick={onRetrySubjects} disabled={busy}>
              Reintentar
            </Button>
          </div>
        )}

        <TemaPicker
          value={temaId}
          onChange={setTemaId}
          asignaturaId={Number(subjectValue) || null}
          disabled={busy || !subjectValue}
          hint={
            subjectValue
              ? "Opcional. Busca por nombre; por defecto solo salen los temas de la asignatura."
              : "Elige antes una asignatura."
          }
        />

        <Field label="Nombre" error={fieldErrors.name}>
          {({ id, invalid, "aria-describedby": describedBy }) => (
            <Input
              id={id}
              value={name}
              invalid={invalid}
              aria-describedby={describedBy}
              autoComplete="off"
              placeholder="Examen de Cálculo"
              onChange={(changeEvent) => setName(changeEvent.target.value)}
              disabled={busy}
            />
          )}
        </Field>

        {type === "Examen" && (
          <Field
            label="Duración (minutos)"
            hint="Marca cuánto dura el examen en el calendario. Por defecto, 120."
          >
            {({ id, "aria-describedby": describedBy }) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={5}
                max={1440}
                step={5}
                value={durationMinutes}
                aria-describedby={describedBy}
                onChange={(changeEvent) => setDurationMinutes(changeEvent.target.value)}
                onBlur={() => {
                  const parsed = Number(durationMinutes);
                  setDurationMinutes(
                    String(
                      Number.isFinite(parsed) && parsed > 0
                        ? Math.min(1440, Math.max(5, Math.round(parsed)))
                        : 120,
                    ),
                  );
                }}
                disabled={busy}
              />
            )}
          </Field>
        )}

        <Field
          label="Fecha y hora"
          hint={
            isEdit
              ? "La fecha de un evento no se cambia."
              : "Hora de Madrid. Se guarda y se sincroniza en el calendario."
          }
          error={fieldErrors.fecha}
        >
          {({ id, invalid, "aria-describedby": describedBy }) => (
            <Input
              id={id}
              type="datetime-local"
              value={fechaInput}
              invalid={invalid}
              aria-describedby={describedBy}
              onChange={(changeEvent) => setFechaInput(changeEvent.target.value)}
              disabled={busy || isEdit}
            />
          )}
        </Field>

        {error && (
          <p role="alert" className="text-[13px] leading-relaxed text-[#f0a8a1]">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

export default EventFormModal;
