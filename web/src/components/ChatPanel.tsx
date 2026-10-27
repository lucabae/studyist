import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type TouchEvent,
  type WheelEvent,
} from "react";

export interface ChatMessage {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  model?: string | null;
}

export interface ChatPanelProps {
  messages: ChatMessage[];
  loading: boolean;
  /** Hay texto del modelo llegando: se ocultan los puntos de "escribiendo". */
  streaming?: boolean;
  error?: string | null;
  onSend: (content: string) => void;
  placeholder?: string;
  emptyState?: ReactNode;
  header?: ReactNode;
  disabled?: boolean;
}

/** Altura de linea del compositor (leading-6) y tope de 6 lineas. */
const LINE_HEIGHT = 24;
const MAX_HEIGHT = LINE_HEIGHT * 6;

/**
 * Chat presentacional, compartido por Principal y Archivo.
 * Todo el estado de red vive en la pagina: aqui solo se pinta y se emite.
 */
export function ChatPanel({
  messages,
  loading,
  streaming = false,
  error,
  onSend,
  placeholder = "Escribe un mensaje…",
  emptyState,
  header,
  disabled = false,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [showJump, setShowJump] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  /**
   * Mientras el usuario no se aleje del final, el panel le sigue solo. Si sube,
   * se deja de seguir (nada de secuestrar el scroll) hasta que vuelva abajo o
   * pulse «ir al final».
   */
  const pinnedRef = useRef(true);
  /**
   * Los scrolls que provoca el propio panel no cuentan como «el usuario se ha
   * ido»: mientras dura la animación, la distancia al fondo es grande.
   */
  const programmaticUntil = useRef(0);
  const frameRef = useRef<number | null>(null);

  const follow = useCallback((behavior: ScrollBehavior = "smooth") => {
    const element = scrollRef.current;
    if (!element) return;
    programmaticUntil.current = Date.now() + 900;
    element.scrollTo({ top: element.scrollHeight, behavior });
  }, []);

  // Seguir el texto que llega. Se agrupa por frame: el streaming puede emitir
  // muchos trozos por segundo y no hace falta un scroll por cada uno.
  useEffect(() => {
    if (!pinnedRef.current) return;
    if (frameRef.current !== null) return;

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const element = scrollRef.current;
      if (!element || !pinnedRef.current) return;

      // Saltos muy grandes (historial recién cargado) sin animación.
      const gap = element.scrollHeight - element.scrollTop - element.clientHeight;
      follow(gap > element.clientHeight ? "auto" : "smooth");
    });
  }, [messages, loading, follow]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;

    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distance <= 24) {
      pinnedRef.current = true;
      setShowJump(false);
      return;
    }

    // Scroll en curso del propio panel: se sigue pegado aunque la distancia
    // todavía sea grande.
    if (Date.now() < programmaticUntil.current) return;

    pinnedRef.current = false;
    setShowJump(true);
  };

  // Intención explícita de subir: se corta el seguimiento al instante, aunque
  // el panel estuviera animándose hacia abajo.
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY >= 0) return;
    programmaticUntil.current = 0;
    pinnedRef.current = false;
    setShowJump(true);
  };

  const touchStartY = useRef(0);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartY.current = event.touches[0]?.clientY ?? 0;
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const currentY = event.touches[0]?.clientY ?? 0;
    // El dedo baja => el contenido sube.
    if (currentY - touchStartY.current > 4) {
      programmaticUntil.current = 0;
      pinnedRef.current = false;
      setShowJump(true);
    }
    touchStartY.current = currentY;
  };

  const jumpToBottom = () => {
    pinnedRef.current = true;
    setShowJump(false);
    follow("smooth");
  };

  // Autoexpandir hasta 6 lineas y luego scroll interno.
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`;
    element.style.overflowY = element.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, [draft]);

  const canSend = draft.trim().length > 0 && !loading && !disabled;

  const send = () => {
    const content = draft.trim();
    if (!content || loading || disabled) return;
    onSend(content);
    setDraft("");
    textareaRef.current?.focus();
    // Al enviar siempre se vuelve al final, aunque estuviera leyendo arriba.
    pinnedRef.current = true;
    setShowJump(false);
    follow("smooth");
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envia, Shift+Enter salto. Se respeta la composicion IME.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="flex h-full min-h-[60vh] min-w-0 flex-col">
      {header && (
        <div className="shrink-0 border-b border-onyx-line px-4 py-3">{header}</div>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          className="h-full overflow-y-auto overscroll-contain"
        >
          <div className="mx-auto w-full max-w-[720px] px-4 py-5">
            {messages.length === 0 && !loading && (
              <div className="py-4">{emptyState}</div>
            )}

            <div
              aria-live="polite"
              aria-busy={loading}
              className="flex flex-col gap-4"
            >
              {messages.map((message) =>
                message.role === "user" ? (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-onyx-surface px-4 py-2.5 text-[15px] leading-relaxed text-onyx-ink">
                      {message.content}
                    </div>
                  </div>
                ) : (
                  <div key={message.id} className="flex justify-start">
                    <div className="min-w-0 max-w-[85%]">
                      {message.model && (
                        <p className="mb-1 truncate text-[11px] text-onyx-inkFaint">
                          {message.model}
                        </p>
                      )}
                      <div className="whitespace-pre-wrap break-words rounded-2xl border border-onyx-line px-4 py-2.5 text-[15px] leading-relaxed text-onyx-ink">
                        {message.content}
                      </div>
                    </div>
                  </div>
                ),
              )}

              {loading && !streaming && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl border border-onyx-line px-4 py-3">
                    <span className="sr-only">Cargando respuesta</span>
                    {[0, 1, 2].map((index) => (
                      <span
                        key={index}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-onyx-inkFaint"
                        style={{ animationDelay: `${index * 120}ms` }}
                        aria-hidden
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-[#5a3636] px-3 py-2 text-[13px] leading-relaxed text-[#f0a8a1]"
              >
                {error}
              </p>
            )}

            </div>
        </div>

        {showJump && (
          <button
            type="button"
            onClick={jumpToBottom}
            className="focus-ring absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-onyx-line bg-onyx-surface px-3 py-1.5 text-[12px] text-onyx-ink shadow-lg transition-colors duration-150 hover:bg-onyx-surfaceHover"
          >
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M10 4.5v11M5.5 11 10 15.5 14.5 11" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Ir al final
          </button>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="shrink-0 border-t border-onyx-line px-3 py-3 sm:px-4"
      >
        <div className="mx-auto flex w-full max-w-[720px] items-end gap-2 rounded-2xl border border-onyx-line bg-onyx-surface p-2 transition-colors duration-150 focus-within:border-onyx-inkFaint/70">
          <label htmlFor={inputId} className="sr-only">
            Mensaje
          </label>
          <textarea
            id={inputId}
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            style={{ maxHeight: MAX_HEIGHT }}
            className="min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-[16px] leading-6 text-onyx-ink outline-none placeholder:text-onyx-inkFaint disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="submit"
            aria-label="Enviar mensaje"
            disabled={!canSend}
            className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition-opacity duration-150 hover:opacity-85 disabled:opacity-30"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M10 15.5v-11M5.5 9 10 4.5 14.5 9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-[720px] text-center text-[11px] text-onyx-inkFaint">
          Enter envía · Shift+Enter salto de línea
        </p>
      </form>
    </div>
  );
}
