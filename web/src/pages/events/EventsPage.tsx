/**
 * Pagina de Eventos (`/eventos`).
 *
 * Calendario mensual (componente compartido) y, debajo, los eventos del mes
 * agrupados por dia. El rango que se pide al backend va en hora de Madrid y
 * los formularios solo envian los campos que cambian: la fecha nunca se edita.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  createEventoEventoPost,
  deleteEventoEventoEventoIdDelete,
  listAsignaturasAsignaturaGet,
  listEventosEventoGet,
  updateEventoEventoEventoIdPut,
  type AsignaturaRead,
  type EventoRead,
  type EventoUpdate,
} from "../../api/generated";
import {
  Button,
  Calendar,
  EmptyState,
  IconButton,
  Modal,
  Spinner,
  useToast,
} from "../../components";
import { PageHeader } from "../../layout/PageHeader";
import { apiErrorMessage } from "../../lib/api";
import { EventFormModal, type EventFormValues } from "./EventFormModal";
import {
  datetimeLocalToIso,
  defaultDatetimeLocal,
  eventDayKey,
  eventTime,
  firstOfMonth,
  formatDayLabel,
  formatMonthLabel,
  isSameMonth,
  monthOfIso,
  monthRange,
} from "./madrid";

/** Texto cuando el backend guardo el evento pero CalDAV fallo. */
const NOT_SYNCED_WARNING = "Se guardó en Studyist, pero no se pudo añadir a iCloud.";

type FormState = { mode: "create" } | { mode: "edit"; event: EventoRead };

interface DayGroup {
  key: string;
  events: EventoRead[];
}

/** Examen y Tarea se distinguen por forma (punto lleno / anillo) y etiqueta. */
function TypeTag({ type }: { type: EventoRead["type"] }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-onyx-line px-2 py-0.5 text-[11px] uppercase tracking-[0.06em] text-onyx-inkMuted">
      <span
        aria-hidden
        className={
          type === "Examen"
            ? "h-1.5 w-1.5 rounded-full bg-white"
            : "h-1.5 w-1.5 rounded-full border border-onyx-inkMuted"
        }
      />
      {type}
    </span>
  );
}

/** Orden cronologico real (las fechas llevan offset de Madrid) y luego por id. */
function compareEvents(a: EventoRead, b: EventoRead): number {
  const difference = new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
  if (Number.isFinite(difference) && difference !== 0) return difference;
  return a.id - b.id;
}

function groupByDay(events: EventoRead[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const event of events) {
    const key = eventDayKey(event.fecha);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.events.push(event);
    else groups.push({ key, events: [event] });
  }
  return groups;
}

export default function EventsPage() {
  const { toast } = useToast();

  const [month, setMonth] = useState(() => firstOfMonth(new Date()));
  const [events, setEvents] = useState<EventoRead[] | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [subjectsToken, setSubjectsToken] = useState(0);

  const [subjects, setSubjects] = useState<AsignaturaRead[] | null>(null);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<EventoRead | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = () => setReloadToken((token) => token + 1);
  const retrySubjects = () => setSubjectsToken((token) => token + 1);

  // Eventos del mes visible. `active` evita que una respuesta vieja pise a la
  // de un mes mas nuevo (y que se escriba estado tras desmontar).
  useEffect(() => {
    let active = true;
    const { from, to } = monthRange(month);

    setEvents(null);
    setLoadingEvents(true);
    setEventsError(null);

    listEventosEventoGet({ query: { from, to } })
      .then((result) => {
        if (!active) return;
        if (result.error) setEventsError(apiErrorMessage(result.error));
        else setEvents(result.data ?? []);
      })
      .catch((cause: unknown) => {
        if (active) setEventsError(apiErrorMessage(cause));
      })
      .finally(() => {
        if (active) setLoadingEvents(false);
      });

    return () => {
      active = false;
    };
  }, [month, reloadToken]);

  // Asignaturas para el formulario: una sola vez (o al reintentar).
  useEffect(() => {
    let active = true;

    listAsignaturasAsignaturaGet()
      .then((result) => {
        if (!active) return;
        if (result.error) setSubjectsError(apiErrorMessage(result.error));
        else {
          setSubjects(result.data ?? []);
          setSubjectsError(null);
        }
      })
      .catch((cause: unknown) => {
        if (active) setSubjectsError(apiErrorMessage(cause));
      });

    return () => {
      active = false;
    };
  }, [subjectsToken]);

  const subjectsById = useMemo(
    () => new Map((subjects ?? []).map((subject) => [subject.id, subject.name])),
    [subjects],
  );

  const sortedEvents = useMemo(
    () => [...(events ?? [])].sort(compareEvents),
    [events],
  );

  const calendarEvents = useMemo(
    () =>
      sortedEvents.map((event) => ({
        id: event.id,
        name: event.name,
        fecha: event.fecha,
        type: event.type,
        asignatura: subjectsById.get(event.asignatura_id),
      })),
    [sortedEvents, subjectsById],
  );

  const groups = useMemo(() => groupByDay(sortedEvents), [sortedEvents]);

  const subjectName = (event: EventoRead) =>
    subjectsById.get(event.asignatura_id) ?? `Asignatura #${event.asignatura_id}`;

  const openCreate = () => {
    setFormError(null);
    setForm({ mode: "create" });
  };

  const openEdit = (event: EventoRead) => {
    setFormError(null);
    setForm({ mode: "edit", event });
  };

  const closeForm = () => {
    if (saving) return;
    setForm(null);
    setFormError(null);
  };

  const handleCreate = async (values: EventFormValues) => {
    const fecha = datetimeLocalToIso(values.fechaInput);
    if (!fecha) {
      setFormError("La fecha no es válida.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const result = await createEventoEventoPost({
        body: {
          type: values.type,
          asignatura_id: values.asignaturaId,
          tema_id: values.temaId,
          name: values.name,
          fecha,
          duration_minutes: values.durationMinutes,
          chats: [],
        },
      });

      if (result.error) {
        setFormError(apiErrorMessage(result.error));
        return;
      }

      const created = result.data;
      const createdMonth = created ? monthOfIso(created.fecha) : null;
      setForm(null);

      if (createdMonth && !isSameMonth(createdMonth, month)) setMonth(createdMonth);
      else refresh();

      const warning =
        created?.calendar_warning ??
        (created && !created.calendar_url ? NOT_SYNCED_WARNING : null);

      toast(
        warning ? `Evento creado. ${warning}` : "Evento creado.",
        warning ? "info" : "success",
      );
    } catch (cause) {
      setFormError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (event: EventoRead, values: EventFormValues) => {
    // Solo lo que ha cambiado: la fecha y los chats quedan fuera.
    const changes: EventoUpdate = {};
    if (values.type !== event.type) changes.type = values.type;
    if (values.asignaturaId !== event.asignatura_id) {
      changes.asignatura_id = values.asignaturaId;
    }
    if (values.name !== event.name) changes.name = values.name;
    if (values.temaId !== (event.tema_id ?? null)) changes.tema_id = values.temaId;
    if (values.durationMinutes !== event.duration_minutes) {
      changes.duration_minutes = values.durationMinutes;
    }

    if (Object.keys(changes).length === 0) {
      setForm(null);
      toast("No has cambiado nada.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const result = await updateEventoEventoEventoIdPut({
        path: { evento_id: event.id },
        body: changes,
      });

      if (result.error) {
        setFormError(apiErrorMessage(result.error));
        return;
      }

      setForm(null);
      refresh();
      toast("Cambios guardados.", "success");
    } catch (cause) {
      setFormError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const result = await deleteEventoEventoEventoIdDelete({
        path: { evento_id: deleteTarget.id },
      });

      if (result.error) {
        setDeleteError(apiErrorMessage(result.error));
        return;
      }

      setDeleteTarget(null);
      refresh();
      toast("Evento borrado.", "success");
    } catch (cause) {
      setDeleteError(apiErrorMessage(cause));
    } finally {
      setDeleting(false);
    }
  };

  const renderList = (): ReactNode => {
    if (eventsError) {
      return (
        <div className="rounded-xl border border-onyx-line bg-onyx-surface p-4">
          <p role="alert" className="text-[13px] leading-relaxed text-[#f0a8a1]">
            No se pudieron cargar los eventos. {eventsError}
          </p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={refresh}>
            Reintentar
          </Button>
        </div>
      );
    }

    if (loadingEvents || events === null) {
      return (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-onyx-line px-4 py-10 text-[13px] text-onyx-inkMuted">
          <Spinner size="sm" label="Cargando eventos" />
          Cargando eventos…
        </div>
      );
    }

    if (sortedEvents.length === 0) {
      return (
        <EmptyState
          title="No hay eventos este mes"
          description={`Nada apuntado en ${formatMonthLabel(month)}. Crea un examen o una tarea y aparecerá aquí y en iCloud.`}
          action={
            <Button variant="secondary" size="sm" onClick={openCreate}>
              Nuevo evento
            </Button>
          }
        />
      );
    }

    return (
      <ul className="flex flex-col gap-4">
        {groups.map((group) => (
          <li key={group.key}>
            <h3 className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-onyx-inkFaint">
              {formatDayLabel(group.key)}
            </h3>

            <ul className="flex flex-col gap-2">
              {group.events.map((event) => {
                const warning =
                  event.calendar_warning ??
                  (event.calendar_url ? null : NOT_SYNCED_WARNING);

                return (
                  <li key={event.id}>
                    <article className="rounded-xl border border-onyx-line bg-onyx-surface p-3">
                      <div className="flex items-start gap-3">
                        <time
                          dateTime={event.fecha}
                          className="w-11 shrink-0 pt-0.5 text-[13px] tabular-nums text-onyx-inkMuted"
                        >
                          {eventTime(event.fecha) ?? "—"}
                        </time>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <TypeTag type={event.type} />
                            <span className="min-w-0 break-words text-[14px] font-medium leading-snug text-onyx-ink">
                              {event.name}
                            </span>
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link
                              to={`/asignaturas/${event.asignatura_id}`}
                              className="focus-ring rounded text-[12px] text-onyx-inkMuted underline-offset-2 hover:text-onyx-ink hover:underline"
                            >
                              {subjectName(event)}
                            </Link>

                            {event.tema_name && (
                              <Link
                                to={`/temas/${event.tema_id}`}
                                className="focus-ring rounded text-[12px] text-onyx-inkFaint underline-offset-2 hover:text-onyx-ink hover:underline"
                              >
                                {event.tema_name}
                              </Link>
                            )}

                            {event.calendar_url && (
                              <Button
                                href={event.calendar_url}
                                target="_blank"
                                rel="noreferrer"
                                variant="ghost"
                                size="sm"
                                aria-label={`Abrir «${event.name}» en iCloud`}
                                className="h-7 gap-1 px-2 text-[12px]"
                              >
                                Abrir en iCloud
                                <svg
                                  viewBox="0 0 20 20"
                                  className="h-3 w-3"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  aria-hidden
                                >
                                  <path
                                    d="M7 5.5h7.5V13M14 6 6 14"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </Button>
                            )}
                          </div>

                          {warning && (
                            <p className="mt-1 text-[12px] leading-relaxed text-onyx-inkFaint">
                              {warning}
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center">
                          <IconButton
                            size="sm"
                            aria-label={`Editar «${event.name}»`}
                            onClick={() => openEdit(event)}
                          >
                            <svg
                              viewBox="0 0 20 20"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              aria-hidden
                            >
                              <path
                                d="M13.5 3.5 16.5 6.5 7 16H4v-3z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </IconButton>

                          <IconButton
                            size="sm"
                            tone="danger"
                            aria-label={`Borrar «${event.name}»`}
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget(event);
                            }}
                          >
                            <svg
                              viewBox="0 0 20 20"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              aria-hidden
                            >
                              <path
                                d="M4.5 6h11M8 6V4.5h4V6M6 6l.6 9.5h6.8L14 6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </IconButton>
                        </div>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Eventos"
        description="Exámenes y tareas del calendario. Se dan de alta en iCloud al crearlos."
        actions={<Button onClick={openCreate}>Nuevo evento</Button>}
      />

      <div className="mt-6">
        <Calendar
          month={month}
          events={calendarEvents}
          onMonthChange={setMonth}
          onEventClick={(id) => {
            const event = sortedEvents.find((item) => item.id === id);
            if (event) openEdit(event);
          }}
        />
      </div>

      <section aria-labelledby="eventos-del-mes" className="mt-8">
        <h2
          id="eventos-del-mes"
          className="mb-3 text-[15px] font-medium tracking-[-0.01em] text-onyx-ink"
        >
          Eventos del mes
        </h2>

        {renderList()}
      </section>

      {form && (
        <EventFormModal
          mode={form.mode}
          event={form.mode === "edit" ? form.event : undefined}
          subjects={subjects ?? []}
          subjectsReady={subjects !== null}
          subjectsError={subjectsError}
          initialFechaInput={defaultDatetimeLocal(month)}
          busy={saving}
          error={formError}
          onClose={closeForm}
          onRetrySubjects={retrySubjects}
          onSubmit={(values) => {
            if (form.mode === "edit") void handleEdit(form.event, values);
            else void handleCreate(values);
          }}
        />
      )}

      <Modal
        open={deleteTarget !== null}
        onClose={() => {
          if (deleting) return;
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        size="sm"
        title="Borrar evento"
        description={
          deleteTarget
            ? `«${deleteTarget.name}» se borrará también de tu calendario de iCloud si estaba sincronizado. No se puede deshacer.`
            : undefined
        }
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteError(null);
              }}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting && <Spinner size="sm" label="Borrando" />}
              Borrar evento
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <p className="text-[13px] leading-relaxed text-onyx-inkMuted">
            {formatDayLabel(eventDayKey(deleteTarget.fecha))}
            {eventTime(deleteTarget.fecha) ? ` · ${eventTime(deleteTarget.fecha)}` : ""}
            {" · "}
            {subjectName(deleteTarget)}
          </p>
        )}

        {deleteError && (
          <p role="alert" className="mt-2 text-[13px] leading-relaxed text-[#f0a8a1]">
            {deleteError}
          </p>
        )}
      </Modal>
    </div>
  );
}
