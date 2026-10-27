import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "../lib/cn";

export interface FileDropZoneProps {
  onFiles: (files: File[]) => void;
  /** Igual que el atributo accept: "image/*,.pdf". */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  hint?: string;
  className?: string;
}

/** Comprueba el accept con extensiones o MIME, sin depender del selector. */
function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;

  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  return accept
    .split(",")
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => {
      if (rule.startsWith(".")) return name.endsWith(rule);
      if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
      return type === rule;
    });
}

/**
 * Zona de subida: drag & drop, click para el selector y pegar desde el
 * portapapeles mientras esta montada. No sube nada: entrega los File.
 */
export function FileDropZone({
  onFiles,
  accept,
  multiple = true,
  disabled = false,
  hint,
  className,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [announce, setAnnounce] = useState("");
  const hintId = useId();

  const deliver = useCallback(
    (incoming: File[]) => {
      const valid = incoming.filter((file) => matchesAccept(file, accept));
      const accepted = multiple ? valid : valid.slice(0, 1);
      if (accepted.length === 0) return;
      onFiles(accepted);
      setAnnounce(
        accepted.length === 1
          ? `1 archivo listo: ${accepted[0].name}`
          : `${accepted.length} archivos listos`,
      );
    },
    [accept, multiple, onFiles],
  );

  // Pegar desde el portapapeles: solo actua si trae archivos.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (disabled) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      deliver(files);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [deliver, disabled]);

  const openPicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (disabled) return;
    deliver(Array.from(event.dataTransfer.files ?? []));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openPicker();
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label="Subir archivos"
      aria-describedby={hint ? hintId : undefined}
      onClick={openPicker}
      onKeyDown={onKeyDown}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "focus-ring flex min-w-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors duration-150",
        dragging
          ? "border-white/60 bg-onyx-surface"
          : "border-onyx-line bg-onyx-bg/40 hover:border-onyx-inkFaint/60 hover:bg-onyx-surface/60",
        disabled && "pointer-events-none cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          deliver(Array.from(event.target.files ?? []));
          // Permite volver a elegir el mismo archivo.
          event.target.value = "";
        }}
        className="sr-only"
        aria-hidden
      />

      <svg
        viewBox="0 0 20 20"
        className="h-5 w-5 text-onyx-inkMuted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <path d="M10 13.5V4.5M6.5 8 10 4.5 13.5 8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 13v2.5h12V13" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <p className="text-[14px] font-medium text-onyx-ink">
        {dragging ? "Suelta para añadir" : "Arrastra archivos aquí"}
      </p>
      <p className="text-[12px] leading-relaxed text-onyx-inkFaint">
        o haz clic para elegirlos · también puedes pegarlos
      </p>

      {hint && (
        <p id={hintId} className="text-[12px] text-onyx-inkFaint">
          {hint}
        </p>
      )}

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
