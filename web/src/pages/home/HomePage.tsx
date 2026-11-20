/**
 * / — Vista "Hoy": resumen diario que conecta exámenes próximos, ritmo
 * necesario por asignatura, temas atrasados respecto al profesor y flashcards
 * pendientes de repaso.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listAsignaturasAsignaturaGet,
  listEventosEventoGet,
  listFilesFilesGet,
  listTemasTemaGet,
  reviewFlashcardsFlashcardReviewGet,
  type AsignaturaRead,
  type EventoRead,
  type FileRead,
  type FlashcardRead,
  type TemaRead,
} from "../../api/generated";
import { Button, Card, EmptyState, ProgressBar, Spinner } from "../../components";
import { PageHeader } from "../../layout/PageHeader";
import { apiErrorMessage } from "../../lib/api";
import { formatMinutes } from "../../lib/format";
import { eventDayKey, eventTime, formatDayLabel } from "../events/madrid";
import { ReviewSession } from "../flashcards/ReviewSession";
import { colorToHex } from "../subjects/subjectColor";
import { subjectProgress, type ProgressStats } from "../subjects/subjectProgress";

type Status = "loading" | "ready" | "error";

const REVIEW_SESSION_LIMIT = 20;
const REVIEW_FETCH_LIMIT = 200;

function todayKeyMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function daysBetweenKeys(fromKey: string, toKey: string): number {
  const fromMs = Date.parse(`${fromKey}T00:00:00Z`);
  const toMs = Date.parse(`${toKey}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.round((toMs - fromMs) / 86_400_000);
}

function countdownLabel(days: number): string {
  if (days <= 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `En ${days} días`;
}

export default function HomePage() {
  const [subjects, setSubjects] = useState<AsignaturaRead[]>([]);
  const [topics, setTopics] = useState<TemaRead[]>([]);
  const [files, setFiles] = useState<FileRead[]>([]);
  const [events, setEvents] = useState<EventoRead[]>([]);
  const [dueCards, setDueCards] = useState<FlashcardRead[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<FlashcardRead[] | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);
    const [subjectsRes, topicsRes, filesRes, eventsRes, reviewRes] =
      await Promise.all([
        listAsignaturasAsignaturaGet(),
        listTemasTemaGet(),
        listFilesFilesGet({ query: { limit: 500 } }),
        listEventosEventoGet(),
        reviewFlashcardsFlashcardReviewGet({
          query: { limit: REVIEW_FETCH_LIMIT },
        }),
      ]);

    const firstError =
      subjectsRes.error ??
      topicsRes.error ??
      filesRes.error ??
      eventsRes.error ??
      reviewRes.error;

    if (
      firstError ||
      !subjectsRes.data ||
      !topicsRes.data ||
      !filesRes.data ||
      !eventsRes.data ||
      !reviewRes.data
    ) {
      setError(apiErrorMessage(firstError));
      setStatus("error");
      return;
    }

    setSubjects(subjectsRes.data);
    setTopics(topicsRes.data);
    setFiles(filesRes.data);
    setEvents(eventsRes.data);
    setDueCards(reviewRes.data);
    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const todayKey = useMemo(() => todayKeyMadrid(), []);

  const subjectsById = useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject])),
    [subjects],
  );

  const filesById = useMemo(
    () => new Map(files.map((file) => [file.id, file])),
    [files],
  );

  const progressBySubject = useMemo(() => {
    const grouped = new Map<number, TemaRead[]>();
    for (const topic of topics) {
      const bucket = grouped.get(topic.asignatura_id);
      if (bucket) bucket.push(topic);
      else grouped.set(topic.asignatura_id, [topic]);
    }
    const map = new Map<number, ProgressStats>();
    for (const subject of subjects) {
      map.set(
        subject.id,
        subjectProgress(grouped.get(subject.id) ?? [], filesById),
      );
    }
    return map;
  }, [subjects, topics, filesById]);

  const upcomingEvents = useMemo(() => {
    return events
      .filter((event) => eventDayKey(event.fecha) >= todayKey)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [events, todayKey]);

  const behindTopics = useMemo(() => {
    return topics
      .map((topic) => {
        const teacher = topic.teacher_progress ?? 0;
        const student = topic.student_progress ?? 0;
        return {
          topic,
          teacher,
          student,
          gap: teacher - student,
          subject: subjectsById.get(topic.asignatura_id),
        };
      })
      .filter((entry) => entry.gap > 0)
      .sort((a, b) => b.gap - a.gap);
  }, [topics, subjectsById]);

  if (session) {
    return (
      <ReviewSession
        cards={session}
        heading="Repaso de hoy"
        onExit={() => {
          setSession(null);
          void load();
        }}
      />
    );
  }

  const todayLabel = formatDayLabel(todayKey);
  const dueCountLabel =
    dueCards.length >= REVIEW_FETCH_LIMIT
      ? `${REVIEW_FETCH_LIMIT}+`
      : String(dueCards.length);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-6 sm:py-8">
      <PageHeader
        title="Hoy"
        description={todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)}
        actions={
          dueCards.length > 0 ? (
            <Button
              onClick={() => setSession(dueCards.slice(0, REVIEW_SESSION_LIMIT))}
            >
              Repasar ({dueCountLabel})
            </Button>
          ) : undefined
        }
      />

      {status === "loading" && (
        <div className="flex justify-center py-20 text-onyx-inkMuted">
          <Spinner label="Cargando resumen de hoy" />
        </div>
      )}

      {status === "error" && (
        <div role="alert" className="mt-6 rounded-xl border border-[#5a3636] px-4 py-3">
          <p className="text-[13px] leading-relaxed text-[#f0a8a1]">
            {error ?? "No se pudo cargar el resumen."}
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={() => void load()}
          >
            Reintentar
          </Button>
        </div>
      )}

      {status === "ready" && (
        <div className="mt-6 flex flex-col gap-6">
          {/* Flashcards pendientes */}
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-onyx-inkFaint">
                  Flashcards para hoy
                </p>
                {dueCards.length > 0 ? (
                  <p className="mt-1 text-[15px] text-onyx-ink">
                    Tienes{" "}
                    <span className="font-medium tabular-nums">
                      {dueCountLabel}
                    </span>{" "}
                    {dueCards.length === 1
                      ? "tarjeta pendiente"
                      : "tarjetas pendientes"}
                    .
                  </p>
                ) : (
                  <p className="mt-1 text-[14px] text-onyx-inkMuted">
                    Al día — no te toca ninguna tarjeta hoy.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button to="/flashcards" variant="secondary" size="sm">
                  Ver sets
                </Button>
                {dueCards.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() =>
                      setSession(dueCards.slice(0, REVIEW_SESSION_LIMIT))
                    }
                  >
                    Empezar repaso
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Próximos exámenes y tareas */}
          <section aria-labelledby="hoy-eventos">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2
                id="hoy-eventos"
                className="text-[15px] font-medium text-onyx-ink"
              >
                Próximos eventos
              </h2>
              <Link
                to="/eventos"
                className="focus-ring rounded text-[12px] text-onyx-inkMuted hover:text-onyx-ink"
              >
                Ver calendario
              </Link>
            </div>

            {upcomingEvents.length === 0 ? (
              <EmptyState
                title="Sin eventos próximos"
                description="No hay exámenes ni tareas pendientes en el calendario."
                action={
                  <Button to="/eventos" variant="secondary" size="sm">
                    Añadir evento
                  </Button>
                }
              />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {upcomingEvents.slice(0, 6).map((event) => {
                  const dayKey = eventDayKey(event.fecha);
                  const days = daysBetweenKeys(todayKey, dayKey);
                  const time = eventTime(event.fecha);
                  const subject = subjectsById.get(event.asignatura_id);
                  const stats = progressBySubject.get(event.asignatura_id);
                  const remaining = stats?.remainingMinutes ?? 0;
                  const perDay =
                    remaining > 0 ? remaining / Math.max(days, 1) : 0;
                  const tight =
                    remaining > 0 && (days <= 1 || perDay > 120);

                  return (
                    <li key={event.id}>
                      <Card className="relative overflow-hidden p-4 pl-5">
                        {subject && (
                          <span
                            aria-hidden
                            className="absolute inset-y-0 left-0 w-1"
                            style={{ backgroundColor: colorToHex(subject.color) }}
                          />
                        )}
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded border border-onyx-line px-1.5 py-0.5 text-[11px] text-onyx-inkMuted">
                                {event.type}
                              </span>
                              <span className="text-[14px] font-medium text-onyx-ink">
                                {event.name}
                              </span>
                            </div>

                            <p className="mt-1 text-[13px] text-onyx-inkMuted">
                              {subject ? (
                                <Link
                                  to={`/asignaturas/${subject.id}`}
                                  className="hover:text-onyx-ink hover:underline"
                                >
                                  {subject.name}
                                </Link>
                              ) : (
                                "Asignatura"
                              )}
                              {event.tema_id && event.tema_name && (
                                <>
                                  {" · "}
                                  <Link
                                    to={`/temas/${event.tema_id}`}
                                    className="hover:text-onyx-ink hover:underline"
                                  >
                                    {event.tema_name}
                                  </Link>
                                </>
                              )}
                            </p>

                            {event.type === "Examen" &&
                              stats &&
                              stats.totalMinutes > 0 && (
                                <p
                                  className={`mt-1.5 text-[12px] tabular-nums ${
                                    tight
                                      ? "text-[#f0a8a1]"
                                      : "text-onyx-inkFaint"
                                  }`}
                                >
                                  {remaining > 0
                                    ? `Quedan ≈ ${formatMinutes(remaining)} (${stats.percent}%) · ≈ ${formatMinutes(perDay)}/día`
                                    : "Temario al 100%"}
                                </p>
                              )}
                          </div>

                          <div className="shrink-0 text-right">
                            <span
                              className={`inline-block rounded-full border px-2.5 py-0.5 text-[12px] font-medium tabular-nums ${
                                days <= 2
                                  ? "border-[#5a3636] text-[#f0a8a1]"
                                  : "border-onyx-line text-onyx-ink"
                              }`}
                            >
                              {countdownLabel(days)}
                            </span>
                            <p className="mt-1 text-[11px] text-onyx-inkFaint">
                              {formatDayLabel(dayKey)}
                              {time ? ` · ${time}` : ""}
                            </p>
                          </div>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Temas por detrás del profesor */}
          <section aria-labelledby="hoy-atrasados">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2
                id="hoy-atrasados"
                className="text-[15px] font-medium text-onyx-ink"
              >
                Temas por detrás del profesor
              </h2>
              <Link
                to="/asignaturas"
                className="focus-ring rounded text-[12px] text-onyx-inkMuted hover:text-onyx-ink"
              >
                Ver asignaturas
              </Link>
            </div>

            {behindTopics.length === 0 ? (
              <Card className="p-4">
                <p className="text-[13px] text-onyx-inkMuted">
                  Vas al día con todos los temas.
                </p>
              </Card>
            ) : (
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {behindTopics.slice(0, 8).map(({ topic, teacher, student, gap, subject }) => {
                  const pct =
                    teacher > 0 ? Math.round((student / teacher) * 100) : 0;
                  return (
                    <li key={topic.id}>
                      <Link
                        to={`/temas/${topic.id}`}
                        className="focus-ring block rounded-xl border border-onyx-line bg-onyx-surface p-3.5 transition-colors hover:border-onyx-inkFaint/50 hover:bg-onyx-surfaceHover"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2 text-[12px] text-onyx-inkMuted">
                            {subject && (
                              <span
                                aria-hidden
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{
                                  backgroundColor: colorToHex(subject.color),
                                }}
                              />
                            )}
                            <span className="truncate">
                              {subject?.name ?? "Asignatura"}
                            </span>
                          </span>
                          <span className="shrink-0 text-[12px] font-medium tabular-nums text-[#f0a8a1]">
                            -{gap} pág.
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[14px] font-medium text-onyx-ink">
                          {topic.name}
                        </p>
                        <ProgressBar
                          value={pct}
                          hint={`${student}/${teacher} pág.`}
                          className="mt-2"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
