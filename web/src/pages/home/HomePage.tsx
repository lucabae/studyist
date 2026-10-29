/**
 * Principal: chat con el modelo general y su historial de conversaciones.
 *
 * Cada conversacion es un hilo global propio. Entrar en la pagina abre una
 * conversacion nueva (vacia); el historial de la izquierda permite volver a
 * cualquiera de las anteriores.
 *
 * Red (SDK generado, sin fetch a mano):
 * - listThreadsChatThreadsGet al montar para pintar el historial.
 * - listMessagesChatMessagesGet con thread_id al elegir una conversacion.
 * - streamChatMessage (lib/chatStream) al enviar: el texto del modelo se pinta
 *   segun llega y, al cerrar el stream, el par user/assistant persistido
 *   sustituye a los mensajes temporales. La primera respuesta de un chat nuevo
 *   trae el thread_id y el titulo generado por la IA.
 * - deleteThreadChatThreadsThreadIdDelete al borrar una conversacion.
 *
 * Altura: AppShell deja `main` con pb-14 en movil por la barra inferior fija,
 * asi que la pagina mide el viewport menos esos 56px; desde sm ocupa todo el
 * alto. El compositor de ChatPanel queda fijado abajo y solo scrollea la lista.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteThreadChatThreadsThreadIdDelete,
  listMessagesChatMessagesGet,
  listThreadsChatThreadsGet,
  type ChatMessageRead,
  type ChatThreadRead,
} from "../../api/client";
import {
  Button,
  ChatPanel,
  Modal,
  Spinner,
  useToast,
  type ChatMessage,
} from "../../components";
import { PageHeader } from "../../layout/PageHeader";
import { apiErrorMessage } from "../../lib/api";
import { streamChatMessage } from "../../lib/chatStream";

/** Sugerencias del estado vacio: se envian tal cual, sin pasar por el input. */
const SUGGESTIONS = [
  "Resume los apuntes de Árboles binarios",
  "Ponme un plan de repaso para el examen de Estructuras de datos",
  "Crea 10 flashcards sobre grafos",
  "¿Qué tengo esta semana?",
] as const;

const DISCLAIMER = "Studyist puede cometer errores. Verifica la información importante.";

/** Saludo segun la hora local del navegador (no la de Madrid). */
function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 6) return "Buenas noches";
  if (hour < 13) return "Buenos días";
  if (hour < 21) return "Buenas tardes";
  return "Buenas noches";
}

function toChatMessage(message: ChatMessageRead): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    model: message.model ?? null,
  };
}

/** Fecha corta del historial: hora si es hoy, dia de la semana o fecha. */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);

  if (days === 0) {
    return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }
  if (days === 1) return "Ayer";
  if (days > 1 && days < 7) {
    return date.toLocaleDateString("es-ES", { weekday: "long" });
  }
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

interface ThreadListProps {
  threads: ChatThreadRead[];
  activeId: number | null;
  disabled: boolean;
  onSelect: (id: number) => void;
  onDelete: (thread: ChatThreadRead) => void;
}

/** Lista de conversaciones: titulo, fecha y boton de borrar. */
function ThreadList({
  threads,
  activeId,
  disabled,
  onSelect,
  onDelete,
}: ThreadListProps) {
  if (threads.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-[12px] leading-relaxed text-onyx-inkFaint">
        Aún no hay conversaciones.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {threads.map((thread) => {
        const active = thread.id === activeId;
        const title = thread.title?.trim() || "Conversación sin título";
        return (
          <li key={thread.id} className="group relative min-w-0">
            <button
              type="button"
              onClick={() => onSelect(thread.id)}
              disabled={disabled}
              aria-current={active ? "page" : undefined}
              className={`focus-ring block w-full rounded-lg py-2 pl-3 pr-10 text-left transition-colors duration-150 disabled:opacity-50 ${
                active
                  ? "bg-onyx-surface text-onyx-ink"
                  : "text-onyx-inkMuted hover:bg-onyx-surface/70 hover:text-onyx-ink"
              }`}
            >
              <span className="block truncate text-[13px] leading-snug">{title}</span>
              <span className="mt-0.5 block text-[11px] text-onyx-inkFaint">
                {formatWhen(thread.updated_at)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(thread)}
              disabled={disabled}
              aria-label={`Borrar "${title}"`}
              title="Borrar conversación"
              className="focus-ring absolute right-1 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-onyx-inkFaint opacity-60 transition-all duration-150 hover:bg-onyx-surfaceHover hover:text-onyx-ink focus-visible:opacity-100 disabled:pointer-events-none sm:opacity-0 sm:group-hover:opacity-100"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path d="M5 6.5h10M8 6.5V5h4v1.5M6.5 6.5l.6 8.5h5.8l.6-8.5M8.5 9v3.5M11.5 9v3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function HomePage() {
  const { toast } = useToast();

  const [threads, setThreads] = useState<ChatThreadRead[]>([]);
  const [threadsStatus, setThreadsStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<number | null>(null);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "ready",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  /** Mensaje optimista que el backend ya guardo pero sin respuesta aun. */
  const [failed, setFailed] = useState<{ id: string; content: string } | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ChatThreadRead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const tempSeq = useRef(0);
  // Descarta respuestas de una carga anterior (StrictMode monta dos veces).
  const loadSeq = useRef(0);

  const refreshThreads = useCallback(async () => {
    const { data, error } = await listThreadsChatThreadsGet();

    if (error) {
      setThreadsError(apiErrorMessage(error));
      setThreadsStatus("error");
      return;
    }

    setThreads(data ?? []);
    setThreadsError(null);
    setThreadsStatus("ready");
  }, []);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  /** Abre una conversacion nueva: nada de reutilizar la mas reciente. */
  const newChat = useCallback(() => {
    loadSeq.current += 1;
    setThreadId(null);
    setMessages([]);
    setStatus("ready");
    setLoadError(null);
    setSendError(null);
    setFailed(null);
    setHistoryOpen(false);
  }, []);

  const selectThread = useCallback(
    async (id: number) => {
      if (sending || id === threadId) {
        setHistoryOpen(false);
        return;
      }

      const seq = ++loadSeq.current;
      setThreadId(id);
      setMessages([]);
      setStatus("loading");
      setLoadError(null);
      setSendError(null);
      setFailed(null);
      setHistoryOpen(false);

      const { data, error } = await listMessagesChatMessagesGet({
        query: { thread_id: id },
      });

      if (seq !== loadSeq.current) return;

      if (error) {
        setLoadError(apiErrorMessage(error));
        setStatus("error");
        return;
      }

      setMessages((data ?? []).map(toChatMessage));
      setStatus("ready");
    },
    [sending, threadId],
  );

  /** Un intento de envio. `tempId` identifica el mensaje optimista a sustituir. */
  const deliver = useCallback(
    async (content: string, tempId: string, retry = false) => {
      setSendError(null);
      setFailed(null);
      setSending(true);
      setStreaming(false);

      const streamId = `${tempId}-assistant`;
      let started = false;
      let targetThreadId = threadId;

      try {
        const result = await streamChatMessage(
          { content, threadId, retry },
          {
            onThread: (id) => {
              targetThreadId = id;
              setThreadId(id);
            },
            onModel: () => {},
            onDelta: (chunk) => {
              if (!started) {
                started = true;
                setStreaming(true);
                setMessages((current) => [
                  ...current,
                  { id: streamId, role: "assistant", content: "", model: null },
                ]);
              }
              setMessages((current) =>
                current.map((message) =>
                  message.id === streamId
                    ? { ...message, content: message.content + chunk }
                    : message,
                ),
              );
            },
          },
        );

        // Los temporales se sustituyen por lo que ya quedo guardado: nunca hay
        // dos copias del mismo mensaje.
        setMessages((current) =>
          current.map((message) => {
            if (message.id === tempId) return toChatMessage(result.user);
            if (message.id === streamId) return toChatMessage(result.assistant);
            return message;
          }),
        );

        if (result.title) {
          setThreads((current) => {
            const exists = current.some((thread) => thread.id === result.thread_id);
            if (!exists) {
              return [
                {
                  id: result.thread_id,
                  file_id: null,
                  title: result.title,
                  created_at: result.user.created_at,
                  updated_at: result.assistant.created_at,
                  message_count: 2,
                },
                ...current,
              ];
            }
            return current.map((thread) =>
              thread.id === result.thread_id
                ? { ...thread, title: result.title }
                : thread,
            );
          });
        }

        // El historial se recarga para traer el titulo y reordenar por actividad.
        void refreshThreads();
      } catch (cause) {
        // El mensaje del usuario ya esta guardado en el backend: se deja tal cual
        // y se ofrece reintentar con el mismo id.
        setMessages((current) => current.filter((message) => message.id !== streamId));
        setSendError(apiErrorMessage(cause));
        setFailed({ id: tempId, content });
        // Si el hilo se creo pero el meta no llego, el historial lo recoge.
        if (targetThreadId === null) void refreshThreads();
      } finally {
        setSending(false);
        setStreaming(false);
      }
    },
    [refreshThreads, threadId],
  );

  const send = useCallback(
    (content: string) => {
      const text = content.trim();
      if (!text || sending || status !== "ready") return;

      tempSeq.current += 1;
      const tempId = `temp-${tempSeq.current}`;

      setMessages((current) => [
        ...current,
        { id: tempId, role: "user", content: text, model: null },
      ]);
      void deliver(text, tempId);
    },
    [deliver, sending, status],
  );

  const retrySend = () => {
    if (!failed || sending) return;
    // Si el hilo ya existe, el backend reutiliza el ultimo mensaje guardado:
    // reintentar no duplica el mensaje del usuario.
    void deliver(failed.content, failed.id, threadId !== null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);

    const { error } = await deleteThreadChatThreadsThreadIdDelete({
      path: { thread_id: pendingDelete.id },
    });

    setDeleting(false);

    if (error) {
      setDeleteError(apiErrorMessage(error));
      return;
    }

    if (pendingDelete.id === threadId) newChat();
    setPendingDelete(null);
    toast("Conversación borrada", "success");
    void refreshThreads();
  };

  // Las conversaciones vacias no aportan nada al historial.
  const visibleThreads = useMemo(
    () => threads.filter((thread) => (thread.message_count ?? 0) > 0),
    [threads],
  );

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === threadId) ?? null,
    [threadId, threads],
  );

  const hasMessages = messages.length > 0;

  // Modelo de la ultima respuesta para el pie discreto.
  const lastModel = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "assistant" && message.model) return message.model;
    }
    return null;
  }, [messages]);

  const emptyState = (
    <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-6 py-8 text-center">
      <div>
        <p className="text-[26px] font-medium leading-tight tracking-[-0.02em] text-onyx-ink sm:text-[30px]">
          {greeting()}
        </p>
        <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed text-onyx-inkMuted">
          Pregunta por tus apuntes, prepara un repaso del próximo examen o genera
          flashcards.
        </p>
      </div>

      <ul className="grid w-full gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion} className="min-w-0">
            <button
              type="button"
              onClick={() => send(suggestion)}
              className="focus-ring h-full w-full rounded-xl border border-onyx-line px-3.5 py-3 text-left text-[14px] leading-snug text-onyx-inkMuted transition-colors duration-150 hover:bg-onyx-surface hover:text-onyx-ink"
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const historyList = (
    <>
      <div className="p-3">
        <Button
          variant="secondary"
          className="w-full justify-start"
          onClick={newChat}
          disabled={sending}
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M10 4.5v11M4.5 10h11" strokeLinecap="round" />
          </svg>
          Nuevo chat
        </Button>
      </div>

      <p className="px-4 pb-2 text-[11px] font-medium uppercase tracking-wide text-onyx-inkFaint">
        Conversaciones
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {threadsStatus === "loading" && visibleThreads.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-3 py-6 text-[12px] text-onyx-inkFaint">
            <Spinner size="sm" label="Cargando historial" />
            Cargando historial…
          </div>
        ) : threadsStatus === "error" && visibleThreads.length === 0 ? (
          <div className="px-2 py-4 text-center">
            <p className="text-[12px] leading-relaxed text-onyx-inkFaint">
              {threadsError}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => void refreshThreads()}
            >
              Reintentar
            </Button>
          </div>
        ) : (
          <ThreadList
            threads={visibleThreads}
            activeId={threadId}
            disabled={sending || deleting}
            onSelect={(id) => void selectThread(id)}
            onDelete={(thread) => {
              setDeleteError(null);
              setPendingDelete(thread);
            }}
          />
        )}
      </div>
    </>
  );

  const chatTitle =
    activeThread?.title?.trim() ||
    (threadId !== null ? "Conversación sin título" : "Nuevo chat");

  return (
    <div className="flex h-[calc(100dvh_-_3.5rem)] min-h-0 sm:h-[100dvh]">
      <aside
        aria-label="Historial de conversaciones"
        className="hidden w-[260px] shrink-0 flex-col border-r border-onyx-line bg-onyx-rail/60 md:flex"
      >
        {historyList}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-5">
          <div className="mx-auto w-full max-w-[688px]">
            <PageHeader
              title={chatTitle}
              description={
                hasMessages
                  ? undefined
                  : "Modo estudio: apuntes, repasos y flashcards en un mismo hilo."
              }
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  className="md:hidden"
                  onClick={() => setHistoryOpen(true)}
                  disabled={sending}
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                    <path d="M4 5.5h12M4 10h12M4 14.5h12" strokeLinecap="round" />
                  </svg>
                  Historial
                </Button>
              }
            />
          </div>
        </div>

        {sendError && (
          <div
            role="alert"
            className="mt-3 shrink-0 border-y border-[#5a3636] px-4 py-2.5 sm:mt-4 sm:px-6"
          >
            <div className="mx-auto flex w-full max-w-[688px] flex-wrap items-center gap-x-3 gap-y-2">
              <p className="min-w-0 flex-1 break-words text-[13px] leading-relaxed text-[#f0a8a1]">
                {sendError}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={retrySend}
                  disabled={sending}
                >
                  Reintentar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSendError(null);
                    setFailed(null);
                  }}
                >
                  Descartar
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="h-full min-h-0 flex-1">
          {status === "loading" ? (
            <div className="flex h-full items-center justify-center gap-3 px-5 text-[14px] text-onyx-inkMuted">
              <Spinner label="Cargando conversación" />
              Cargando conversación…
            </div>
          ) : status === "error" ? (
            <div
              role="alert"
              className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center"
            >
              <p className="text-[15px] font-medium text-onyx-ink">
                No se pudo cargar la conversación
              </p>
              <p className="max-w-[46ch] break-words text-[13px] leading-relaxed text-onyx-inkMuted">
                {loadError}
              </p>
              <Button
                variant="secondary"
                onClick={() => (threadId === null ? void refreshThreads() : void selectThread(threadId))}
              >
                Reintentar
              </Button>
            </div>
          ) : (
            <ChatPanel
              messages={messages}
              loading={sending}
              streaming={streaming}
              onSend={send}
              placeholder="Escribe un mensaje…"
              emptyState={emptyState}
            />
          )}
        </div>

        <footer className="shrink-0 border-t border-onyx-line px-4 py-2 sm:px-6">
          <p className="mx-auto flex w-full max-w-[688px] flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center text-[11px] leading-relaxed text-onyx-inkFaint">
            {lastModel && (
              <>
                <span className="break-all">Modelo: {lastModel}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span>{DISCLAIMER}</span>
          </p>
        </footer>
      </div>

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Conversaciones"
        size="md"
        footer={
          <Button variant="secondary" onClick={() => setHistoryOpen(false)}>
            Cerrar
          </Button>
        }
      >
        <div className="flex max-h-[60dvh] min-h-[200px] flex-col">{historyList}</div>
      </Modal>

      <Modal
        open={pendingDelete !== null}
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
        title="Borrar conversación"
        description="Se borrarán todos sus mensajes."
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Spinner size="sm" label="Borrando" />
                  Borrando…
                </>
              ) : (
                "Borrar"
              )}
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-onyx-inkMuted">
          «{pendingDelete?.title?.trim() || "Conversación sin título"}» se
          eliminará del historial. Esta acción no se puede deshacer.
        </p>
        {deleteError && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-[#5a3636] px-3 py-2 text-[13px] leading-relaxed text-[#f0a8a1]"
          >
            {deleteError}
          </p>
        )}
      </Modal>
    </div>
  );
}
