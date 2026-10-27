/**
 * Variante B: "Consola".
 *
 * Grafito oscuro, alto contraste y un unico acento cian usado con disciplina.
 * Rejilla de fondo muy tenue, micro-etiquetas monoespaciadas y radios medios.
 * La sensacion es la de un panel de control, no la de una landing.
 */
const palette = {
  bg: "#0b0d10",
  surface: "#12161b",
  surfaceRaised: "#171c22",
  border: "#232a33",
  text: "#e9eef3",
  muted: "#8b96a3",
  accent: "#4de3cd",
  accentDim: "rgba(77, 227, 205, 0.12)",
} as const;

const topics = [
  { index: "01", title: "Complejidad y recursión", notes: "8", progress: 90 },
  { index: "02", title: "Listas y pilas", notes: "12", progress: 70 },
  { index: "03", title: "Árboles binarios", notes: "6", progress: 40 },
  { index: "04", title: "Grafos", notes: "0", progress: 0 },
];

export default function HomeB() {
  return (
    <main
      className="relative flex min-h-screen items-center overflow-hidden px-6 py-16 sm:px-10 lg:px-16"
      style={{ backgroundColor: palette.bg, color: palette.text }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse at 60% 40%, black 30%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at 60% 40%, black 30%, transparent 78%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 top-1/2 h-[32rem] w-[32rem] -translate-y-1/2 rounded-full blur-[120px]"
        style={{ backgroundColor: "rgba(77, 227, 205, 0.10)" }}
      />

      <div className="relative mx-auto grid w-full max-w-5xl gap-14 lg:grid-cols-[1fr_0.92fr] lg:items-center lg:gap-20">
        <section>
          <div className="mb-10 flex items-center gap-3">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ backgroundColor: palette.accent }}
            />
            <span className="text-[11px] uppercase tracking-[0.32em]">
              Studyist
            </span>
            <span
              className="text-[11px] tracking-[0.12em]"
              style={{ color: palette.muted }}
            >
              / entorno personal
            </span>
          </div>

          <h1 className="max-w-xl text-[2.5rem] font-semibold leading-[1.05] tracking-tight sm:text-[3.75rem]">
            Un solo sitio para
            <br />
            todo lo que
            <br />
            <span style={{ color: palette.accent }}>estudias</span>
            <span style={{ color: palette.accent }}>_</span>
          </h1>

          <p
            className="mt-8 max-w-md text-base leading-relaxed sm:text-lg"
            style={{ color: palette.muted }}
          >
            Asignaturas, temas y repasos con fecha. Sin ruido, sin pestañas de
            más.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="rounded-lg px-6 py-3 text-sm font-semibold outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#4de3cd] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0d10]"
              style={{
                backgroundColor: palette.accent,
                color: palette.bg,
                boxShadow: "0 0 0 1px rgba(77, 227, 205, 0.35), 0 8px 30px rgba(77, 227, 205, 0.18)",
              }}
            >
              Abrir panel
            </button>
            <button
              type="button"
              className="rounded-lg border px-6 py-3 text-sm font-medium outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[#4de3cd] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0d10]"
              style={{
                borderColor: palette.border,
                color: palette.text,
                backgroundColor: palette.surface,
              }}
            >
              Cargar ejemplo
            </button>
          </div>

          <div
            className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t pt-5 text-[11px] uppercase tracking-[0.18em]"
            style={{ borderColor: palette.border, color: palette.muted }}
          >
            <span>04 asignaturas</span>
            <span>38 apuntes</span>
            <span>62 flashcards</span>
          </div>
        </section>

        <section
          className="overflow-hidden rounded-xl border"
          style={{ backgroundColor: palette.surface, borderColor: palette.border }}
        >
          <header
            className="flex items-center justify-between gap-4 border-b px-5 py-4"
            style={{
              borderColor: palette.border,
              backgroundColor: palette.surfaceRaised,
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em]"
                style={{
                  backgroundColor: palette.accentDim,
                  color: palette.accent,
                }}
              >
                asignatura
              </span>
              <span className="text-sm font-medium">Estructuras de datos</span>
            </div>
            <span
              className="text-[10px] uppercase tracking-[0.18em]"
              style={{ color: palette.muted }}
            >
              2º curso
            </span>
          </header>

          <ul>
            {topics.map((topic) => (
              <li
                key={topic.index}
                className="flex items-center gap-4 border-b px-5 py-4 last:border-b-0"
                style={{ borderColor: palette.border }}
              >
                <span
                  className="text-[11px] tabular-nums"
                  style={{ color: palette.muted }}
                >
                  {topic.index}
                </span>
                <span className="flex-1 text-sm">{topic.title}</span>
                <span
                  className="text-[11px] tabular-nums"
                  style={{ color: palette.muted }}
                >
                  {topic.notes} ap.
                </span>
                <span
                  className="h-1 w-16 overflow-hidden rounded-full"
                  style={{ backgroundColor: palette.border }}
                >
                  <span
                    className="block h-1 rounded-full"
                    style={{
                      width: `${topic.progress}%`,
                      backgroundColor:
                        topic.progress > 0 ? palette.accent : "transparent",
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>

          <footer
            className="flex items-center justify-between gap-4 border-t px-5 py-4 text-[11px] uppercase tracking-[0.16em]"
            style={{ borderColor: palette.border, color: palette.muted }}
          >
            <span>
              examen <span style={{ color: palette.text }}>12 jun</span>
            </span>
            <span style={{ color: palette.accent }}>faltan 18 días</span>
          </footer>
        </section>
      </div>
    </main>
  );
}
