/**
 * Variante C: "Vidrio".
 *
 * Claro-azulado con capas translucidas: superficies de vidrio con blur, radios
 * muy grandes y sombras difusas. Un unico acento lavanda y geometria redondeada.
 * El fondo lo forman dos manchas de color desenfocadas, sin imagenes.
 */
const palette = {
  sky: "#eef2fb",
  skyDeep: "#e4e9f8",
  glass: "rgba(255, 255, 255, 0.58)",
  glassStrong: "rgba(255, 255, 255, 0.72)",
  border: "rgba(255, 255, 255, 0.85)",
  ink: "#1f2433",
  muted: "#5d6577",
  accent: "#6a5ad8",
  accentSoft: "rgba(106, 90, 216, 0.12)",
} as const;

const topics = [
  { title: "Complejidad y recursión", meta: "8 apuntes" },
  { title: "Listas y pilas", meta: "12 apuntes" },
  { title: "Árboles binarios", meta: "6 apuntes" },
  { title: "Grafos", meta: "sin apuntes" },
];

export default function HomeC() {
  return (
    <main
      className="relative flex min-h-screen items-center overflow-hidden px-6 py-16 sm:px-10 lg:px-16"
      style={{
        background: `linear-gradient(160deg, ${palette.sky} 0%, ${palette.skyDeep} 100%)`,
        color: palette.ink,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full blur-3xl"
        style={{ backgroundColor: "rgba(167, 139, 250, 0.45)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 right-0 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{ backgroundColor: "rgba(125, 211, 252, 0.45)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-1/3 top-1/4 h-64 w-64 rounded-full blur-3xl"
        style={{ backgroundColor: "rgba(255, 255, 255, 0.7)" }}
      />

      <div className="relative mx-auto grid w-full max-w-5xl gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
        <section>
          <div
            className="mb-8 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] tracking-wide backdrop-blur-md"
            style={{
              backgroundColor: palette.glass,
              borderColor: palette.border,
              color: palette.muted,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: palette.accent }}
            />
            Studyist
          </div>

          <h1 className="max-w-xl text-[2.6rem] font-medium leading-[1.06] tracking-[-0.02em] sm:text-6xl">
            Estudiar debería
            <br />
            sentirse{" "}
            <span
              className="rounded-[1.5rem] px-2 pb-1"
              style={{
                color: palette.accent,
                backgroundColor: palette.accentSoft,
              }}
            >
              ligero
            </span>
            .
          </h1>

          <p
            className="mt-8 max-w-md text-base leading-relaxed sm:text-lg"
            style={{ color: palette.muted }}
          >
            Tus asignaturas, temas y exámenes, reunidos en un espacio
            tranquilo. Nada más a la vista.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="rounded-full px-7 py-3.5 text-sm font-medium outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#6a5ad8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#eef2fb]"
              style={{
                backgroundColor: palette.accent,
                color: "#ffffff",
                boxShadow: "0 18px 38px -18px rgba(106, 90, 216, 0.85)",
              }}
            >
              Empezar
            </button>
            <button
              type="button"
              className="rounded-full border px-7 py-3.5 text-sm font-medium outline-none backdrop-blur-md transition-colors hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-[#6a5ad8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#eef2fb]"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.5)",
                borderColor: palette.border,
                color: palette.ink,
              }}
            >
              Explorar
            </button>
          </div>

          <p className="mt-12 text-xs" style={{ color: palette.muted }}>
            Uso personal. Tus datos, en tu dispositivo.
          </p>
        </section>

        <section
          className="rounded-[2rem] border p-1 backdrop-blur-2xl"
          style={{
            backgroundColor: palette.glass,
            borderColor: palette.border,
            boxShadow: "0 32px 80px -40px rgba(53, 62, 112, 0.45)",
          }}
        >
          <div
            className="rounded-[1.75rem] p-6 sm:p-7"
            style={{ backgroundColor: palette.glassStrong }}
          >
            <div className="flex items-start gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-semibold"
                style={{
                  backgroundColor: palette.accentSoft,
                  color: palette.accent,
                }}
              >
                ED
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-medium tracking-tight">
                  Estructuras de datos
                </h2>
                <p
                  className="mt-0.5 text-xs"
                  style={{ color: palette.muted }}
                >
                  2º curso · 4 temas
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {["38 apuntes", "62 flashcards", "Examen 12 jun"].map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border px-3 py-1 text-[11px]"
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.6)",
                    borderColor: palette.border,
                    color: palette.muted,
                  }}
                >
                  {chip}
                </span>
              ))}
            </div>

            <ul className="mt-5 space-y-1.5">
              {topics.map((topic) => (
                <li
                  key={topic.title}
                  className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3"
                  style={{ backgroundColor: "rgba(255, 255, 255, 0.55)" }}
                >
                  <span className="min-w-0 truncate text-sm">{topic.title}</span>
                  <span
                    className="shrink-0 text-[11px]"
                    style={{ color: palette.muted }}
                  >
                    {topic.meta}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-5">
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ color: palette.muted }}>Repaso del curso</span>
                <span style={{ color: palette.accent }}>62%</span>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full"
                style={{ backgroundColor: "rgba(106, 90, 216, 0.12)" }}
              >
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: "62%",
                    background: "linear-gradient(90deg, #8b7cf0 0%, #6a5ad8 100%)",
                  }}
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
