import { Button, Modal } from "../../components";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Consecuencias concretas del borrado. */
  description: string;
  confirmLabel?: string;
  /** Mientras la peticion esta en vuelo se deshabilitan los botones. */
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmacion de borrado compartida por las tres pantallas de asignaturas.
 * Es un dialogo destructivo: el boton de confirmar va en tono `danger`.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Borrar",
  pending = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? "Borrando…" : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-onyx-inkMuted">
        Esta acción no se puede deshacer.
      </p>
    </Modal>
  );
}
