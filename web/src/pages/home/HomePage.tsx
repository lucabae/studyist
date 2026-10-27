/**
 * Principal: chat con el hilo global, atendido por el modelo general.
 *
 * Red (SDK generado, sin fetch a mano):
 * - getThreadChatThreadGet + listMessagesChatMessagesGet al montar. La primera
 *   crea el hilo vacio si no existe, asi que se piden juntas.
 * - streamChatMessage (lib/chatStream) al enviar: el texto del modelo se pinta
 *   segun llega y, al cerrar el stream, el par user/assistant persistido
 *   sustituye a los mensajes temporales. Si el modelo falla, el mensaje del
 *   usuario se conserva y se puede reintentar.
 * - clearMessagesChatMessagesDelete al borrar el historial (el hilo sigue).
 *
 * Altura: AppShell deja `main` con pb-14 en movil por la barra inferior fija,
 * asi que la pagina mide el viewport menos esos 56px; desde sm ocupa todo el
 * alto. El compositor de ChatPanel queda fijado abajo y solo scrollea la lista.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearMessagesChatMessagesDelete,
  getThreadChatThreadGet,
  listMessagesChatMessagesGet,
  type ChatMessageRead,
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

export default function HomePage() {
  const { toast } = useToast();

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  /** Mensaje optimista que el backend ya guardo pero sin respuesta aun. */
  const [failed, setFailed] = useState<{ id: string; content: string } | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const tempSeq = useRef(0);
  // Descarta respuestas de una carga anterior (StrictMode monta dos veces).
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setStatus("loading");
    setLoadError(null);

    const [thread, list] = await Promise.all([
      getThreadChatThreadGet(),
      listMessagesChatMessagesGet(),
    ]);

    if (seq !== loadSeq.current) return;

    const failure = thread.error ?? list.error;
    if (failure) {
      setLoadError(apiErrorMessage(failure));
      setStatus("error");
      return;
    }

    setMessages((list.data ?? []).map(toChatMessage));
    setFailed(null);
    setSendError(null);
    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Un intento de envio. `tempId` identifica el mensaje optimista a sustituir. */
  const deliver = useCallback(async (content: string, tempId: string) => {
    setSendError(null);
    setFailed(null);
    setSending(true);
    setStreaming(false);

    const streamId = `${tempId}-assistant`;
    let started = false;

    try {
      const result = await streamChatMessage(
        { content },
        {
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
    } catch (cause) {
      // El mensaje del usuario ya esta guardado en el backend: se deja tal cual
      // y se ofrece reintentar con el mismo id.
      setMessages((current) => current.filter((message) => message.id !== streamId));
      setSendError(apiErrorMessage(cause));
      setFailed({ id: tempId, content });
    } finally {
      setSending(false);
      setStreaming(false);
    }
  }, []);

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
    void deliver(failed.content, failed.id);
  };

  const clearConversation = async () => {
    if (clearing) return;
    setClearing(true);
    setClearError(null);

    const { error } = await clearMessagesChatMessagesDelete();

    setClearing(false);

    if (error) {
      setClearError(apiErrorMessage(error));
      return;
    }

    setMessages([]);
    setFailed(null);
    setSendError(null);
    setConfirmOpen(false);
    toast("Conversación borrada", "success");
  };

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

  return (
    <div className="flex h-[calc(100dvh_-_3.5rem)] min-h-0 flex-col sm:h-[100dvh]">
      <div className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="mx-auto w-full max-w-[688px]">
          <PageHeader
            title="Studyist"
            description="Modo estudio: apuntes, repasos y flashcards en un mismo hilo."
            actions={
              hasMessages ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setClearError(null);
                    setConfirmOpen(true);
                  }}
                  disabled={sending || clearing}
                >
                  Borrar conversación
                </Button>
              ) : undefined
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
            <Button variant="secondary" onClick={() => void load()}>
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

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (!clearing) setConfirmOpen(false);
        }}
        title="Borrar conversación"
        description="Se borrarán todos los mensajes de este hilo."
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={clearing}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => void clearConversation()}
              disabled={clearing}
            >
              {clearing ? (
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
          El hilo se mantiene vacío; solo se elimina el historial. Esta acción no
          se puede deshacer.
        </p>
        {clearError && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-[#5a3636] px-3 py-2 text-[13px] leading-relaxed text-[#f0a8a1]"
          >
            {clearError}
          </p>
        )}
      </Modal>
    </div>
  );
}
