/**
 * Variante E: "Cuaderno" — lenguaje de producto de Anthropic (Claude, claro).
 *
 * Spec
 * - Canvas: hueso cálido (#faf9f5), nunca blanco puro ni gris azulado. Las
 *   superficies que se levantan son blancas, con borde de 1px.
 * - Estructura: sin sidebar. Columna única centrada a 672px, mucho aire
 *   arriba y el compositor como pieza central. El contenido se lee de arriba
 *   abajo, como una página.
 * - Tipografia: display serif (Copernicus / Georgia) para el saludo y los
 *   títulos de sección; sans del sistema para el resto. Cuerpo 15px / 1.6.
 *   Interlineado amplio y tracking ligeramente negativo solo en el display.
 * - Radios: 12px en compositor y tarjetas, 8px en chips. Nunca pastillas
 *   gigantes.
 * - Bordes: 1px calido (#e6e2d7). Sombra única y muy baja en el compositor.
 * - Acento: verde musgo apagado, usado solo en el botón de enviar, el punto de
 *   estado y las barras de progreso. Nada de naranja.
 * - Movimiento: 150ms ease, solo color de fondo y borde.
 */
const t = {
  canvas: "#faf9f5",
  raised: "#ffffff",
  sidebar: "#f2f0e9",
  text: "#1a1915",
  muted: "#6b6a61",
  faint: "#8f8d81",
  border: "#e6e2d7",
  borderStrong: "#d8d3c5",
  accent: "#3d5a52",
  accentSoft: "#e8ede9",
} as const;

const serif = 'ui-serif, Georgia, "Times New Roman", serif';

const suggestions = [
  { title: "Repasar un tema", body: "Convierte los apuntes de Árboles binarios en preguntas." },
  { title: "Preparar el examen", body: "Plan de repaso de 5 días para Estructuras de datos." },
  { title: "Ordenar archivos", body: "Clasifica lo que subí esta semana por asignatura." },
  { title: "Crear flashcards", body: "20 tarjetas a partir del PDF de Grafos." },
];

const recent = [
  { name: "Árboles binarios", subject: "Estructuras de datos", when: "hace 2 h" },
  { name: "Diagonalización", subject: "Álgebra lineal", when: "ayer" },
  { name: "Planificación de procesos", subject: "Sistemas operativos", when: "lun" },
];

export default function HomeE() {
  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ backgroundColor: t.canvas, color: t.text }}
    >
      <header className="flex h-16 items-center justify-between px-6 sm:px-10">
        <div className="flex items-center gap-2">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-[7px] text-[11px] font-semibold"
            style={{ backgroundColor: t.accent, color: t.canvas }}
            aria-hidden
          >
            S
          </span>
          <span className="text-[15px] font-medium tracking-[-0.01em]">Studyist</span>
        </div>

        <nav className="flex items-center gap-6 text-[14px]" aria-label="Navegación principal">
          <a href="#" className="hidden transition-colors duration-150 hover:text-[#1a1915] sm:block" style={{ color: t.muted }}>
            Archivos
          </a>
          <a href="#" className="hidden transition-colors duration-150 hover:text-[#1a1915] sm:block" style={{ color: t.muted }}>
            Asignaturas
          </a>
          <a href="#" className="hidden transition-colors duration-150 hover:text-[#1a1915] sm:block" style={{ color: t.muted }}>
            Eventos
          </a>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] outline-none transition-colors duration-150 hover:bg-white focus-visible:ring-2 focus-visible:ring-[#3d5a52]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf9f5]"
            style={{ borderColor: t.border, backgroundColor: "transparent" }}
          >
            <span className="h-5 w-5 rounded-full" style={{ backgroundColor: t.accentSoft }} aria-hidden />
            Luca
          </button>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[672px] flex-1 px-5 pb-16 pt-10 sm:px-0 sm:pt-16">
        <h1
          className="text-[2rem] leading-[1.15] tracking-[-0.01em] sm:text-[2.35rem]"
          style={{ fontFamily: serif, fontWeight: 400 }}
        >
          Buenas tardes, Luca
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: t.muted }}>
          Tienes dos exámenes esta semana. ¿Por dónde empezamos?
        </p>

        <form
          className="mt-8 rounded-xl border bg-white p-1.5 shadow-[0_1px_2px_rgba(26,25,21,0.04)]"
          style={{ borderColor: t.borderStrong }}
        >
          <label htmlFor="composer" className="sr-only">
            Pedir algo a Studyist
          </label>
          <textarea
            id="composer"
            rows={2}
            placeholder="Pregunta, resume o pide un repaso…"
            className="w-full resize-none bg-transparent px-3 pt-2.5 text-[15px] leading-relaxed outline-none placeholder:text-[#8f8d81]"
            style={{ color: t.text }}
          />
          <div className="flex items-center justify-between gap-3 px-1.5 pb-0.5 pt-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] outline-none transition-colors duration-150 hover:bg-[#f2f0e9] focus-visible:ring-2 focus-visible:ring-[#3d5a52]/40"
                style={{ color: t.muted }}
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <path d="M10 4.5v11M4.5 10h11" />
                </svg>
                Adjuntar
              </button>
              <span
                className="hidden h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] sm:flex"
                style={{ backgroundColor: t.accentSoft, color: t.accent }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.accent }} aria-hidden />
                Repaso
              </span>
            </div>
            <button
              type="button"
              aria-label="Enviar"
              className="flex h-8 w-8 items-center justify-center rounded-lg outline-none transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#3d5a52]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              style={{ backgroundColor: t.accent, color: "#ffffff" }}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                <path d="M10 15.5v-11M5.5 9 10 4.5 14.5 9" />
              </svg>
            </button>
          </div>
        </form>

        <section className="mt-8" aria-labelledby="sugerencias">
          <h2
            id="sugerencias"
            className="text-[13px] uppercase tracking-[0.14em]"
            style={{ color: t.faint }}
          >
            Para empezar
          </h2>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {suggestions.map((item) => (
              <button
                key={item.title}
                type="button"
                className="rounded-xl border bg-transparent p-4 text-left outline-none transition-colors duration-150 hover:bg-white focus-visible:ring-2 focus-visible:ring-[#3d5a52]/40"
                style={{ borderColor: t.border }}
              >
                <span className="block text-[14px] font-medium">{item.title}</span>
                <span className="mt-1 block text-[13px] leading-relaxed" style={{ color: t.muted }}>
                  {item.body}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-10" aria-labelledby="reciente">
          <div className="flex items-baseline justify-between">
            <h2
              id="reciente"
              className="text-[19px]"
              style={{ fontFamily: serif, fontWeight: 400 }}
            >
              Seguir donde lo dejaste
            </h2>
            <a href="#" className="text-[13px] underline-offset-2 hover:underline" style={{ color: t.muted }}>
              Ver todo
            </a>
          </div>

          <ul className="mt-4 border-t" style={{ borderColor: t.border }}>
            {recent.map((item) => (
              <li key={item.name}>
                <a
                  href="#"
                  className="flex items-baseline gap-3 border-b py-3.5 outline-none transition-colors duration-150 hover:bg-white focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3d5a52]/40"
                  style={{ borderColor: t.border }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{item.name}</span>
                    <span className="block text-[13px]" style={{ color: t.muted }}>
                      {item.subject}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums" style={{ color: t.faint }}>
                    {item.when}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-12 text-center text-[12px]" style={{ color: t.faint }}>
          Studyist puede equivocarse. Comprueba siempre contra tus apuntes.
        </p>
      </main>
    </div>
  );
}
