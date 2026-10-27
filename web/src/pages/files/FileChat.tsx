/**
 * Chat de la pagina Archivo.
 *
 * El hilo es propio del archivo (file_id), asi que el backend le manda el
 * archivo como adjunto en cada mensaje. La respuesta llega en streaming y se
 * pinta segun se genera; aqui solo se orquesta la red y los estados, el
 * pintado es de ChatPanel.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  ChatPanel,
  Modal,
  Spinner,
  useToast,
  type ChatMessage,
} from "../../components";
import {
  clearMessagesChatMessagesDelete,
  getThreadChatThreadGet,
  listMessagesChatMessagesGet,
  type ChatMessageRead,
} from "../../api/generated";
import { PdfModePicker, type PdfMode } from "../../components/PdfModePicker";
import { apiErrorMessage } from "../../lib/api";
import { streamChatMessage } from "../../lib/chatStream";

function toChatMessage(message: ChatMessageRead): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    model: message.model,
  };
}

export interface FileChatProps {
  fileId: number;
  fileName: string;
}

export function FileChat({ fileId, fileName }: FileChatProps) {
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [pdfMode, setPdfMode] = useState<PdfMode>("text");

  // El hilo se crea vacio si no existe, asi que pedirlo antes deja el estado
  // listo y detecta un archivo que ya no esta (404).
  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    void (async () => {
      const thread = await getThreadChatThreadGet({ query: { file_id: fileId } });
      if (cancelled) return;

      if (thread.error || !thread.data) {
        setError(apiErrorMessage(thread.error));
        setLoading(false);
        return;
      }
      setCount(thread.data.message_count ?? 0);

      const history = await listMessagesChatMessagesGet({
        query: { file_id: fileId },
      });
      if (cancelled) return;

      if (history.error || !history.data) {
        setError(apiErrorMessage(history.error));
        setLoading(false);
        return;
      }

      setMessages(history.data.map(toChatMessage));
      setCount(history.data.length);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, reloadKey]);

  const isPdf = fileName.toLowerCase().endsWith(".pdf");

  const send = useCallback(
    async (content: string) => {
      // Mensaje optimista: ChatPanel ya ha vaciado el compositor, asi que no
      // se puede perder lo escrito si la peticion falla.
      const localId = `local-${Date.now()}`;
      const streamId = `${localId}-assistant`;
      let started = false;

      setMessages((current) => [
        ...current,
        { id: localId, role: "user", content },
      ]);
      setSending(true);
      setStreaming(false);
      setError(null);

      try {
        const result = await streamChatMessage(
          { content, fileId, fileMode: pdfMode },
          {
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

        setMessages((current) =>
          current.map((message) => {
            if (message.id === localId) return toChatMessage(result.user);
            if (message.id === streamId) return toChatMessage(result.assistant);
            return message;
          }),
        );
        setCount((current) => current + 2);
      } catch (cause) {
        // El backend guarda el mensaje del usuario antes de llamar al modelo.
        setMessages((current) => current.filter((message) => message.id !== streamId));
        setError(apiErrorMessage(cause));
      } finally {
        setSending(false);
        setStreaming(false);
      }
    },
    [fileId, pdfMode],
  );

  const clear = async () => {
    if (clearing) return;

    setClearing(true);
    const { error: clearError } = await clearMessagesChatMessagesDelete({
      query: { file_id: fileId },
    });
    setClearing(false);

    if (clearError) {
      toast(apiErrorMessage(clearError), "error");
      return;
    }

    setMessages([]);
    setCount(0);
    setConfirmClear(false);
    toast("Conversación borrada.", "success");
  };

  const loadFailed = error !== null && messages.length === 0;

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-onyx-ink">
          Chat sobre este archivo
        </p>
        <p className="truncate text-[11px] text-onyx-inkFaint">
          {count === 1 ? "1 mensaje" : `${count} mensajes`} · {fileName}
        </p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setConfirmClear(true)}
        disabled={loading || sending || messages.length === 0}
      >
        Borrar conversación
      </Button>
      {isPdf && (
        <PdfModePicker
          value={pdfMode}
          onChange={setPdfMode}
          disabled={loading || sending}
          compact
        />
      )}
    </div>
  );

  const emptyState = loading ? (
    <div className="flex justify-center py-6">
      <Spinner label="Cargando conversación" />
    </div>
  ) : loadFailed ? (
    <div className="rounded-xl border border-onyx-line bg-onyx-surface px-4 py-6 text-center">
      <p className="text-[15px] font-medium text-onyx-ink">
        No se pudo cargar la conversación
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="mt-3"
        onClick={() => setReloadKey((key) => key + 1)}
      >
        Reintentar
      </Button>
    </div>
  ) : (
    <div className="rounded-xl border border-onyx-line bg-onyx-surface px-4 py-6 text-center">
      <p className="text-[15px] font-medium text-onyx-ink">
        Pregúntale a este archivo
      </p>
      <p className="mx-auto mt-1 max-w-[46ch] text-[13px] leading-relaxed text-onyx-inkFaint">
        Se envía como adjunto al modelo general con cada mensaje.
      </p>
    </div>
  );

  return (
    <>
      <ChatPanel
        messages={messages}
        loading={sending}
        streaming={streaming}
        error={loadFailed ? null : error}
        onSend={send}
        disabled={loading}
        placeholder="Pregunta sobre este archivo…"
        header={header}
        emptyState={emptyState}
      />

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Borrar conversación"
        description="Se borran todos los mensajes de este archivo. El archivo y el hilo se conservan."
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmClear(false)}
              disabled={clearing}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={clear} disabled={clearing}>
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
          Esta acción no se puede deshacer.
        </p>
      </Modal>
    </>
  );
}
