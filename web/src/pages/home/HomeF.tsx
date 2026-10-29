/**
 * Variante F: "Onyx" — lenguaje de producto de OpenAI (ChatGPT, oscuro).
 *
 * Spec
 * - Canvas: gris grafito neutro (#212121), sidebar (#171717), superficie del
 *   compositor un escalon mas clara (#303030). Cero tinte azul o violeta.
 * - Estructura: raíl de iconos de 52px a la izquierda (solo escritorio),
 *   columna de conversacion centrada a 640px y compositor anclado abajo. La
 *   home es un saludo + una caja de texto, no un dashboard.
 * - Tipografia: sans del sistema. Saludo 30px / 500 con tracking -0.02em,
 *   cuerpo 16px / 1.6, microcopy 12px.
 * - Radios: 28px en el compositor (casi pastilla), 8px en iconos, 999px en
 *   chips y en el boton de enviar.
 * - Bordes: 1px #3a3a3a. Sin sombras de color; el compositor lleva una sombra
 *   negra corta.
 * - Contraste por luminancia, no por color: el unico elemento "blanco puro"
 *   es el boton de enviar.
 * - Movimiento: 150ms ease, solo fondos.
 */
const t = {
  bg: "#212121",
  rail: "#171717",
  surface: "#303030",
  surfaceHover: "#3a3a3a",
  border: "#3f3f3f",
  text: "#ececec",
  muted: "#b4b4b4",
  faint: "#8f8f8f",
} as const;

const railIcons = [
  "M3.5 10.5 10 4l6.5 6.5v6a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z", // inicio
  "M4 5.5h5l2 2h5v7.5H4z", // archivos
  "M10 4.2 3.6 7.2 10 10.2l6.4-3zM6 9.6v3.3c0 1.3 1.8 2.1 4 2.1s4-.8 4-2.1V9.6", // asignaturas
  "M4 5.5h12v11H4zM7 3.5v4M13 3.5v4", // eventos
];

const chips = ["Plan de repaso", "Resumir apuntes", "Crear flashcards"];

export default function HomeF() {
  return (
    <div
      className="flex min-h-screen"
      style={{ backgroundColor: t.bg, color: t.text }}
    >
      <nav
        className="hidden w-[52px] shrink-0 flex-col items-center gap-1 py-3 sm:flex"
        style={{ backgroundColor: t.rail }}
        aria-label="Navegación principal"
      >
        <button
          type="button"
          aria-label="Studyist"
          className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[13px] font-semibold text-black"
        >
          S
        </button>

        {railIcons.map((d, i) => (
          <button
            key={d}
            type="button"
            aria-label={["Inicio", "Archivos", "Asignaturas", "Eventos"][i]}
            aria-current={i === 0 ? "page" : undefined}
            className="flex h-9 w-9 items-center justify-center rounded-lg outline-none transition-colors duration-150 hover:bg-[#2a2a2a] focus-visible:ring-2 focus-visible:ring-white/40"
            style={{ color: i === 0 ? t.text : t.faint }}
          >
            <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d={d} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}

        <span className="mt-auto flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-medium" style={{ backgroundColor: t.surface, color: t.muted }}>
          L
        </span>
      </nav>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center justify-between px-4 sm:hidden">
          <span className="text-[14px] font-medium">Studyist</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px]" style={{ backgroundColor: t.surface, color: t.muted }}>
            L
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-5 py-10">
          <div className="w-full max-w-[640px]">
            <div className="text-center">
              <span
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px]"
                style={{ borderColor: t.border, color: t.muted }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-white/70" aria-hidden />
                Modo estudio
              </span>
              <h1 className="mt-5 text-[26px] font-medium leading-tight tracking-[-0.02em] sm:text-[30px]">
                ¿Qué toca estudiar hoy?
              </h1>
            </div>

            <form
              className="mt-7 rounded-[28px] border p-3 shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
              style={{ backgroundColor: t.surface, borderColor: t.border }}
            >
              <label htmlFor="ask" className="sr-only">
                Escribe tu petición
              </label>
              <textarea
                id="ask"
                rows={2}
                placeholder="Escribe un mensaje…"
                className="w-full resize-none bg-transparent px-2 pt-1 text-[16px] leading-relaxed outline-none placeholder:text-[#9a9a9a]"
                style={{ color: t.text }}
              />

              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Adjuntar archivo"
                    className="flex h-9 w-9 items-center justify-center rounded-full outline-none transition-colors duration-150 hover:bg-[#3f3f3f] focus-visible:ring-2 focus-visible:ring-white/40"
                    style={{ color: t.muted }}
                  >
                    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                      <path d="M10 4v12M4 10h12" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] outline-none transition-colors duration-150 hover:bg-[#3f3f3f] focus-visible:ring-2 focus-visible:ring-white/40"
                    style={{ color: t.muted }}
                  >
                    Repaso
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                      <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>

                <button
                  type="button"
                  aria-label="Enviar mensaje"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-black outline-none transition-opacity duration-150 hover:opacity-85 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#303030]"
                  style={{ backgroundColor: "#ffffff" }}
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M10 15.5v-11M5.5 9 10 4.5 14.5 9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </form>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="rounded-full border px-3.5 py-1.5 text-[13px] outline-none transition-colors duration-150 hover:bg-[#2c2c2c] focus-visible:ring-2 focus-visible:ring-white/40"
                  style={{ borderColor: t.border, color: t.muted }}
                >
                  {chip}
                </button>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px]" style={{ color: t.faint }}>
              <span>2 exámenes esta semana</span>
              <span aria-hidden>·</span>
              <span>38 apuntes</span>
              <span aria-hidden>·</span>
              <span>62 flashcards</span>
            </div>
          </div>
        </div>

        <p className="px-5 pb-5 text-center text-[12px]" style={{ color: t.faint }}>
          Studyist puede cometer errores. Verifica la información importante.
        </p>
      </main>
    </div>
  );
}
