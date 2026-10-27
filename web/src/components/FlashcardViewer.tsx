import { useEffect } from "react";
import { RichText } from "./RichText";
import { Button } from "./ui/Button";

export type FlashcardGrade = "hard" | "medium" | "easy";

export interface FlashcardViewerProps {
  front: string;
  back: string;
  revealed: boolean;
  onReveal: () => void;
  onGrade: (grade: FlashcardGrade) => void;
  frontImage?: string | null;
  backImage?: string | null;
}

const GRADES: { grade: FlashcardGrade; label: string; shortcut: string }[] = [
  { grade: "hard", label: "Difícil", shortcut: "1" },
  { grade: "medium", label: "Medio", shortcut: "2" },
  { grade: "easy", label: "Fácil", shortcut: "3" },
];

/**
 * Tarjeta de repaso: click o Espacio revela; 1/2/3 (o los botones) puntuan.
 * El estado de la sesion lo lleva la pagina.
 */
export function FlashcardViewer({
  front,
  back,
  revealed,
  onReveal,
  onGrade,
  frontImage,
  backImage,
}: FlashcardViewerProps) {
  useEffect(() => {
    const isFormControl = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isFormControl(event.target)) return;

      if (event.code === "Space" && !revealed) {
        event.preventDefault();
        onReveal();
        return;
      }

      if (revealed) {
        const entry = GRADES.find((item) => item.shortcut === event.key);
        if (entry) {
          event.preventDefault();
          onGrade(entry.grade);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [revealed, onReveal, onGrade]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <button
        type="button"
        onClick={() => {
          if (!revealed) onReveal();
        }}
        aria-expanded={revealed}
        aria-label={revealed ? "Respuesta visible" : "Mostrar respuesta"}
        className="focus-ring min-w-0 rounded-xl border border-onyx-line bg-onyx-surface p-5 text-left transition-colors duration-150 hover:border-onyx-inkFaint/60 sm:p-6"
      >
        <span className="block text-[11px] uppercase tracking-wide text-onyx-inkFaint">
          Pregunta
        </span>
        <RichText
          text={front}
          className="mt-2 block text-[18px] leading-relaxed text-onyx-ink sm:text-[20px]"
        />
        {frontImage && (
          <img
            src={frontImage}
            alt=""
            className="mt-3 max-h-64 w-full rounded-lg border border-onyx-line object-contain"
          />
        )}

        {revealed && (
          <span className="mt-5 block border-t border-onyx-line pt-5">
            <span className="block text-[11px] uppercase tracking-wide text-onyx-inkFaint">
              Respuesta
            </span>
            <RichText
              text={back}
              className="mt-2 block text-[17px] leading-relaxed text-onyx-ink"
            />
            {backImage && (
              <img
                src={backImage}
                alt=""
                className="mt-3 max-h-64 w-full rounded-lg border border-onyx-line object-contain"
              />
            )}
          </span>
        )}

        {!revealed && (
          <span className="mt-4 block text-[12px] text-onyx-inkFaint">
            Pulsa Espacio o toca la tarjeta para ver la respuesta
          </span>
        )}
      </button>

      {revealed && (
        <div>
          <div className="grid grid-cols-3 gap-2">
            {GRADES.map((item) => (
              <Button
                key={item.grade}
                variant="secondary"
                onClick={() => onGrade(item.grade)}
                aria-keyshortcuts={item.shortcut}
                className="w-full px-2"
              >
                {item.label}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-center text-[11px] text-onyx-inkFaint">
            Atajos: 1 Difícil · 2 Medio · 3 Fácil
          </p>
        </div>
      )}
    </div>
  );
}
