/**
 * Paleta fija de colores de asignatura.
 *
 * El backend guarda un HEX de 6 digitos sin `#`. No hay selector nativo de
 * color: se elige entre estos tonos apagados, legibles sobre la superficie
 * Onyx (#303030) y sin competir con el unico blanco de la interfaz.
 */

export interface SubjectColor {
  /** HEX sin `#`, tal y como se envia al backend. */
  hex: string;
  /** Nombre accesible del color. */
  name: string;
}

export const SUBJECT_COLORS: readonly SubjectColor[] = [
  { hex: "8f9b9e", name: "Pizarra" },
  { hex: "9a8f7d", name: "Arena" },
  { hex: "8d9a7f", name: "Oliva" },
  { hex: "7f8fa6", name: "Azul" },
  { hex: "9b8aa6", name: "Malva" },
  { hex: "a68a8a", name: "Arcilla" },
  { hex: "7fa69b", name: "Agua" },
  { hex: "a69f7f", name: "Caqui" },
] as const;

/** Color neutro para valores que no vengan en la paleta (datos antiguos). */
const FALLBACK_HEX = "#6f6f6f";

/** Normaliza cualquier valor del backend a un `#rrggbb` usable en CSS. */
export function colorToHex(color: string): string {
  const clean = color.trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(clean) ? `#${clean.toLowerCase()}` : FALLBACK_HEX;
}

/**
 * Opciones del formulario: la paleta fija mas el color actual si no esta en
 * ella, para no cambiar en silencio el color de una asignatura ya creada.
 */
export function paletteWith(color: string | undefined): SubjectColor[] {
  const clean = (color ?? "").trim().replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(clean)) return [...SUBJECT_COLORS];
  if (SUBJECT_COLORS.some((option) => option.hex === clean)) return [...SUBJECT_COLORS];
  return [{ hex: clean, name: "Color actual" }, ...SUBJECT_COLORS];
}
