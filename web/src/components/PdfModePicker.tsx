import { Chip } from "./ui/Chip";

/** Como se manda un PDF al modelo. */
export type PdfMode = "text" | "file";

export interface PdfModePickerProps {
  value: PdfMode;
  onChange: (mode: PdfMode) => void;
  disabled?: boolean;
  /** Sin etiqueta ni ayuda larga: para cabeceras estrechas como el chat. */
  compact?: boolean;
}

const OPTIONS: { value: PdfMode; label: string; hint: string }[] = [
  {
    value: "text",
    label: "Solo texto",
    hint: "Se extrae el texto del PDF. Sin coste de procesado de archivo.",
  },
  {
    value: "file",
    label: "PDF original",
    hint: "OpenRouter procesa el PDF (cobra por página) y conserva imágenes y diseño.",
  },
];

/**
 * Selector del modo de envio de los PDFs. Por defecto "text": el backend
 * extrae el texto con pypdfium2 y no hay coste de file processing.
 */
export function PdfModePicker({
  value,
  onChange,
  disabled = false,
  compact = false,
}: PdfModePickerProps) {
  const active = OPTIONS.find((option) => option.value === value) ?? OPTIONS[0];

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {!compact && (
        <p className="text-[13px] font-medium text-onyx-inkMuted">Envío de los PDF</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {OPTIONS.map((option) => (
          <Chip
            key={option.value}
            active={value === option.value}
            onClick={() => onChange(option.value)}
            disabled={disabled}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      {!compact && (
        <p className="text-[12px] leading-relaxed text-onyx-inkFaint">{active.hint}</p>
      )}
    </div>
  );
}
