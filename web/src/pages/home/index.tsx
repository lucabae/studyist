/**
 * Selector de las direcciones visuales de la home.
 *
 * No hay router: la variante activa se guarda en estado local y se cambia
 * desde una barra flotante discreta abajo a la derecha. Pensado solo para
 * comparar estilos, no para produccion.
 *
 * D, E y F siguen los lenguajes de producto de OpenAI y Anthropic (sin color
 * de marca). A, B y C son las propuestas anteriores, se mantienen solo para
 * poder comparar.
 */
import { useState, type ComponentType } from "react";
import HomeA from "./HomeA";
import HomeB from "./HomeB";
import HomeC from "./HomeC";
import HomeD from "./HomeD";
import HomeE from "./HomeE";
import HomeF from "./HomeF";

type Variant = "D" | "E" | "F" | "A" | "B" | "C";

const variants: { key: Variant; label: string; component: ComponentType }[] = [
  { key: "D", label: "Shell (OpenAI, claro)", component: HomeD },
  { key: "E", label: "Cuaderno (Anthropic, claro)", component: HomeE },
  { key: "F", label: "Onyx (OpenAI, oscuro)", component: HomeF },
  { key: "A", label: "Papel", component: HomeA },
  { key: "B", label: "Consola", component: HomeB },
  { key: "C", label: "Vidrio", component: HomeC },
];

export default function HomeShowcase() {
  const [active, setActive] = useState<Variant>("F");
  const activeVariant = variants.find((variant) => variant.key === active) ?? variants[0];
  const ActiveHome = activeVariant.component;

  return (
    <>
      <ActiveHome />

      <div
        role="group"
        aria-label="Elegir variante visual"
        className="fixed bottom-5 right-5 z-50 flex items-center gap-1 rounded-full border border-black/10 bg-white/85 p-1 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.45)] backdrop-blur-md"
      >
        {variants.map((variant) => {
          const isActive = variant.key === active;
          return (
            <button
              key={variant.key}
              type="button"
              onClick={() => setActive(variant.key)}
              aria-pressed={isActive}
              aria-label={`Variante ${variant.key}: ${variant.label}`}
              title={variant.label}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:ring-offset-1 ${
                isActive
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-500 hover:bg-black/5 hover:text-neutral-900"
              }`}
            >
              {variant.key}
            </button>
          );
        })}
      </div>
    </>
  );
}
