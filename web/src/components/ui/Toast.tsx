import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { IconButton } from "./IconButton";

export type ToastVariant = "info" | "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

export interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
  dismiss: (id: number) => void;
}

const TOAST_MS = 4000;

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast debe usarse dentro de <ToastProvider>");
  }
  return context;
}

const STYLES: Record<ToastVariant, string> = {
  info: "text-onyx-ink",
  success: "text-onyx-ink",
  error: "border-[#5a3636] text-[#f0a8a1]",
};

/** Avisos efimeros, 4s, apilados sobre la barra inferior en movil. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      counter.current += 1;
      const id = counter.current;
      setItems((current) => [...current, { id, message, variant }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_MS),
      );
    },
    [dismiss],
  );

  // Limpia timers pendientes al desmontar.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-4 bottom-20 z-[60] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[360px]">
            {items.map((item) => (
              <div
                key={item.id}
                role={item.variant === "error" ? "alert" : "status"}
                className={cn(
                  "pointer-events-auto flex items-start gap-2 rounded-xl border border-onyx-line bg-onyx-surface px-3 py-2.5 text-[13px] leading-relaxed shadow-[0_6px_24px_rgba(0,0,0,0.45)]",
                  STYLES[item.variant],
                )}
              >
                <p className="min-w-0 flex-1 break-words">{item.message}</p>
                <IconButton
                  aria-label="Cerrar aviso"
                  size="sm"
                  onClick={() => dismiss(item.id)}
                  className="-mr-1 -mt-1"
                >
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                    <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
                  </svg>
                </IconButton>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
