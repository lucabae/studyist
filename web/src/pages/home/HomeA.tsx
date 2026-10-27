/**
 * Variante A: "Papel".
 *
 * Lenguaje editorial y cálido: papel hueso, tinta verde, filetes finos de 1px,
 * radios mínimos y sombras practicamente inexistentes. La jerarquia la sostiene
 * la tipografia y el aire, no los contenedores.
 */
const palette = {
  paper: "#f7f4ec",
  paperRaised: "#fbf9f3",
  ink: "#22231e",
  inkMuted: "#6b685c",
  rule: "#ddd7c7",
  accent: "#2f5d4a",
  accentSoft: "#e6ebe1",
} as const;

const topics = [
  { index: "01", title: "Complejidad y recursión", meta: "8 apuntes" },
  { index: "02", title: "Listas y pilas", meta: "12 apuntes" },
  { index: "03", title: "Árboles binarios", meta: "6 apuntes" },
  { index: "04", title: "Grafos", meta: "borrador" },
];

export default function HomeA() {
  return (
    <main
      className="flex min-h-screen items-center px-6 py-16 sm:px-10 lg:px-16"
      style={{ backgroundColor: palette.paper, color: palette.ink }}
    >
      <div className="mx-auto grid w-full max-w-5xl gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-20">
        <section>
          <p
            className="mb-8 text-[11px] uppercase tracking-[0.28em]"
            style={{ color: palette.inkMuted }}
          >
            Studyist · cuaderno de curso
          </p>

          <h1 className="max-w-xl text-[2.6rem] font-normal leading-[1.05] tracking-tight sm:text-6xl">
            Todo tu curso,
            <br />
            ordenado como un
            <br />
            <span className="italic" style={{ color: palette.accent }}>
              cuaderno
            </span>
            .
          </h1>

          <p
            className="mt-8 max-w-md text-base leading-relaxed sm:text-lg"
            style={{ color: palette.inkMuted }}
          >
            Asignaturas, temas, apuntes y exámenes en un mismo sitio. Sin
            pestañas sueltas ni fechas que se escapan.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              className="rounded-[3px] px-6 py-3 text-sm font-medium tracking-wide outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#2f5d4a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f4ec]"
              style={{
                backgroundColor: palette.accent,
                color: palette.paperRaised,
              }}
            >
              Empezar
            </button>
            <button
              type="button"
              className="rounded-[3px] border px-6 py-3 text-sm font-medium tracking-wide outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#2f5d4a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f4ec]"
              style={{
                borderColor: palette.rule,
                color: palette.ink,
                backgroundColor: "transparent",
              }}
            >
              Ver un ejemplo
            </button>
          </div>

          <p
            className="mt-12 border-t pt-5 text-xs tracking-wide"
            style={{ borderColor: palette.rule, color: palette.inkMuted }}
          >
            Uso personal · sin cuentas ni sincronización
          </p>
        </section>

        <section
          className="border p-6 sm:p-8"
          style={{
            backgroundColor: palette.paperRaised,
            borderColor: palette.rule,
            borderRadius: "4px",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p
                className="text-[10px] uppercase tracking-[0.24em]"
                style={{ color: palette.inkMuted }}
              >
                2º curso · semestre 2
              </p>
              <h2 className="mt-2 text-xl font-medium tracking-tight">
                Estructuras de datos
              </h2>
            </div>
            <span
              className="shrink-0 border px-2 py-1 text-[10px] uppercase tracking-[0.14em]"
              style={{
                borderColor: palette.rule,
                color: palette.accent,
                borderRadius: "2px",
              }}
            >
              En curso
            </span>
          </div>

          <ul className="mt-6 border-t" style={{ borderColor: palette.rule }}>
            {topics.map((topic) => (
              <li
                key={topic.index}
                className="flex items-baseline gap-4 border-b py-3"
                style={{ borderColor: palette.rule }}
              >
                <span
                  className="text-[11px] tabular-nums"
                  style={{ color: palette.accent }}
                >
                  {topic.index}
                </span>
                <span className="flex-1 text-sm">{topic.title}</span>
                <span
                  className="text-[11px]"
                  style={{ color: palette.inkMuted }}
                >
                  {topic.meta}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex items-center justify-between gap-4">
            <div>
              <p
                className="text-[10px] uppercase tracking-[0.2em]"
                style={{ color: palette.inkMuted }}
              >
                Examen
              </p>
              <p className="mt-1 text-sm">12 de junio</p>
            </div>
            <div className="flex-1 pl-6">
              <div
                className="h-[3px] w-full"
                style={{ backgroundColor: palette.accentSoft }}
              >
                <div
                  className="h-[3px]"
                  style={{ width: "62%", backgroundColor: palette.accent }}
                />
              </div>
              <p
                className="mt-2 text-right text-[10px] uppercase tracking-[0.18em]"
                style={{ color: palette.inkMuted }}
              >
                62% repasado
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
