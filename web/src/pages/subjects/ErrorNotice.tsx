import { Button } from "../../components";

export interface ErrorNoticeProps {
  message: string;
  onRetry: () => void;
}

/** Aviso de fallo de red con reintento; mismo tono que el resto de la app. */
export function ErrorNotice({ message, onRetry }: ErrorNoticeProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-[#5a3636] bg-onyx-surface p-4"
    >
      <p className="text-[14px] leading-relaxed text-[#f0a8a1]">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
