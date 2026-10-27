import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Chip, Field, Input, Modal } from "../../components";
import { cn } from "../../lib/cn";

export interface PickerItem {
  id: number;
  name: string;
  /** Texto secundario: tamaño del archivo, nº de tarjetas… */
  meta?: string;
  /** Valor para el filtro (tipo de archivo). */
  group?: string;
}

export interface EntityPickerModalProps {
  open: boolean;
  title: string;
  description?: string;
  items: PickerItem[];
  /** Seleccion actual del tema; se copia al abrir. */
  initialIds: number[];
  emptyLabel: string;
  /** Texto del buscador. */
  searchLabel?: string;
  onClose: () => void;
  /** Si lanza, el modal sigue abierto; el padre ya ha avisado del error. */
  onSave: (ids: number[]) => Promise<void>;
}

const ALL = "todos";

/**
 * Selector multiple con busqueda local y filtro por grupo.
 *
 * Se usa para los archivos y los flashcard sets de un tema. No guarda nada:
 * entrega los ids y el padre llama a la API.
 */
export function EntityPickerModal({
  open,
  title,
  description,
  items,
  initialIds,
  emptyLabel,
  searchLabel = "Buscar",
  onClose,
  onSave,
}: EntityPickerModalProps) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(ALL);
  const [selectedIds, setSelectedIds] = useState<number[]>(initialIds);
  const [saving, setSaving] = useState(false);

  // La seleccion se reinicia solo al abrir, no en cada render del padre.
  const initialRef = useRef(initialIds);
  initialRef.current = initialIds;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setGroup(ALL);
    setSelectedIds(initialRef.current);
    setSaving(false);
  }, [open]);

  const groups = useMemo(() => {
    const unique = new Map<string, string>();
    items.forEach((item) => {
      if (item.group) unique.set(item.group, item.group.toUpperCase());
    });
    return [...unique.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [items]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (group !== ALL && item.group !== group) return false;
      return !needle || item.name.toLowerCase().includes(needle);
    });
  }, [items, query, group]);

  function toggle(id: number) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(selectedIds);
    } catch {
      // El padre muestra el error con un toast; aqui solo se rearma el boton.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Guardando…" : `Guardar (${selectedIds.length})`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={searchLabel}>
          {({ id }) => (
            <Input
              id={id}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Escribe para filtrar…"
              autoComplete="off"
            />
          )}
        </Field>

        {groups.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo">
            <Chip active={group === ALL} onClick={() => setGroup(ALL)}>
              Todos
            </Chip>
            {groups.map(([value, label]) => (
              <Chip key={value} active={group === value} onClick={() => setGroup(value)}>
                {label}
              </Chip>
            ))}
          </div>
        )}

        <div className="max-h-[45dvh] overflow-y-auto rounded-lg border border-onyx-line">
          {visible.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-onyx-inkFaint">
              {emptyLabel}
            </p>
          ) : (
            <ul className="flex flex-col p-1">
              {visible.map((item) => {
                const checked = selectedIds.includes(item.id);
                return (
                  <li key={item.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors duration-150 hover:bg-onyx-surfaceHover",
                        checked && "bg-onyx-surfaceHover",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(item.id)}
                        className="focus-ring h-4 w-4 shrink-0 accent-white"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-onyx-ink">
                          {item.name}
                        </span>
                        {item.meta && (
                          <span className="block truncate text-[12px] text-onyx-inkFaint">
                            {item.meta}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="text-[12px] text-onyx-inkFaint">
          {selectedIds.length} seleccionado{selectedIds.length === 1 ? "" : "s"}
        </p>
      </div>
    </Modal>
  );
}
