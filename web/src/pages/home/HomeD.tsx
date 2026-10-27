/**
 * Variante D: "Shell" — lenguaje de producto de OpenAI (ChatGPT, claro).
 *
 * Spec
 * - Canvas: blanco puro. Nada de degradados ni de color de marca: el unico
 *   "acento" es el negro del texto y de los botones primarios.
 * - Estructura: sidebar fija de 260px sobre #f9f9f9 con hairline a la derecha,
 *   barra superior de 52px y area de contenido centrada a 880px.
 * - Tipografia: sans del sistema, cuerpo 14px / 1.55, titulos 600 con tracking
 *   negativo (-0.01em). Nada de serif ni de versalitas.
 * - Radios: 8px en botones, 10px en filas activas, 12px en tarjetas.
 * - Bordes: 1px #e5e5e5. Sombras: ninguna salvo elevacion de menus.
 * - Hover: relleno gris (#f2f2f2) sin cambiar de tamano ni de color de texto.
 * - Movimiento: 120ms ease-out, solo color y opacidad.
 * - Densidad alta, pero con aire: filas de 52px y separacion de 24-32px.
 */
const t = {
  bg: "#ffffff",
  sidebar: "#f9f9f9",
  text: "#0d0d0d",
  muted: "#5d5d5d",
  faint: "#8f8f8f",
  border: "#e5e5e5",
  hover: "#f2f2f2",
  active: "#ececec",
} as const;

const nav = [
  { label: "Inicio", active: true },
  { label: "Archivos", active: false },
  { label: "Asignaturas", active: false },
  { label: "Eventos", active: false },
  { label: "Flashcards", active: false },
];

const subjects = [
  { initials: "ED", name: "Estructuras de datos", meta: "2º curso · 4 temas", detail: "38 apuntes" },
  { initials: "AL", name: "Álgebra lineal", meta: "2º curso · 6 temas", detail: "51 apuntes" },
  { initials: "SO", name: "Sistemas operativos", meta: "2º curso · 5 temas", detail: "24 apuntes" },
];

const exams = [
  { day: "12", month: "jun", name: "Estructuras de datos", room: "Aula 3.2" },
  { day: "18", month: "jun", name: "Álgebra lineal", room: "Aula 1.4" },
];

export default function HomeD() {
  return (
    <div
      className="flex min-h-screen"
      style={{ backgroundColor: t.bg, color: t.text }}
    >
      <aside
        className="hidden w-[260px] shrink-0 flex-col justify-between border-r px-3 py-3 md:flex"
        style={{ backgroundColor: t.sidebar, borderColor: t.border }}
      >
        <div>
          <div className="flex items-center gap-2 px-2 py-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-semibold"
              style={{ backgroundColor: t.text, color: t.bg }}
            >
              S
            </span>
            <span className="text-sm font-semibold tracking-[-0.01em]">
              Studyist
            </span>
          </div>

          <nav className="mt-4 space-y-0.5" aria-label="Navegación principal">
            {nav.map((item) => (
              <a
                key={item.label}
                href="#"
                aria-current={item.active ? "page" : undefined}
                className="flex h-9 items-center rounded-lg px-2.5 text-sm outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-[#0d0d0d]/30"
                style={{
                  backgroundColor: item.active ? t.active : "transparent",
                  color: item.active ? t.text : t.muted,
                  fontWeight: item.active ? 500 : 400,
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="mt-6 px-2.5 pb-1 text-[11px] font-medium" style={{ color: t.faint }}>
            Recientes
          </div>
          <div className="space-y-0.5">
            {["Tema 3 · Árboles binarios", "Repaso de grafos", "Apuntes reMarkable"].map(
              (label) => (
                <a
                  key={label}
                  href="#"
                  className="block truncate rounded-lg px-2.5 py-1.5 text-sm outline-none transition-colors duration-100 hover:bg-[#ededed] focus-visible:ring-2 focus-visible:ring-[#0d0d0d]/30"
                  style={{ color: t.muted }}
                >
                  {label}
                </a>
              ),
            )}
          </div>
        </div>

        <div
          className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors duration-100 hover:bg-[#ededed]"
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-medium"
            style={{ backgroundColor: "#dcdcdc", color: t.text }}
          >
            L
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium">Luca</span>
            <span className="block text-[11px]" style={{ color: t.faint }}>
              Uso personal
            </span>
          </span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex h-[52px] shrink-0 items-center justify-between border-b px-5"
          style={{ borderColor: t.border }}
        >
          <span className="text-[13px]" style={{ color: t.muted }}>
            Inicio
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="hidden items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] outline-none transition-colors duration-100 hover:bg-[#f7f7f7] focus-visible:ring-2 focus-visible:ring-[#0d0d0d]/30 sm:flex"
              style={{ borderColor: t.border, color: t.muted }}
            >
              Buscar
              <kbd className="text-[11px]" style={{ color: t.faint }}>
                ⌘K
              </kbd>
            </button>
            <button
              type="button"
              aria-label="Ajustes"
              className="flex h-8 w-8 items-center justify-center rounded-lg outline-none transition-colors duration-100 hover:bg-[#f2f2f2] focus-visible:ring-2 focus-visible:ring-[#0d0d0d]/30"
              style={{ color: t.muted }}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="10" cy="10" r="2.75" />
                <path d="M10 3.2v1.4M10 15.4v1.4M3.2 10h1.4M15.4 10h1.4M5.2 5.2l1 1M13.8 13.8l1 1M14.8 5.2l-1 1M6.2 13.8l-1 1" />
              </svg>
            </button>
          </div>
        </header>

        <main className="flex-1 px-5 py-8 sm:px-8">
          <div className="mx-auto w-full max-w-[880px]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">
                  Buenas tardes, Luca
                </h1>
                <p className="mt-1.5 text-sm" style={{ color: t.muted }}>
                  Dos exámenes esta semana. Empieza por el que tienes más cerca.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg px-3.5 py-2 text-[13px] font-medium outline-none transition-opacity duration-100 hover:opacity-85 focus-visible:ring-2 focus-visible:ring-[#0d0d0d]/40 focus-visible:ring-offset-2"
                style={{ backgroundColor: t.text, color: t.bg }}
              >
                Nueva asignatura
              </button>
            </div>

            <section className="mt-10" aria-labelledby="examenes">
              <div className="flex items-center justify-between">
                <h2 id="examenes" className="text-[13px] font-semibold tracking-[-0.01em]">
                  Próximos exámenes
                </h2>
                <a href="#" className="text-[13px] underline-offset-2 hover:underline" style={{ color: t.muted }}>
                  Ver calendario
                </a>
              </div>

              <div className="mt-3 overflow-hidden rounded-xl border" style={{ borderColor: t.border }}>
                {exams.map((exam, i) => (
                  <a
                    key={exam.name}
                    href="#"
                    className="flex items-center gap-4 px-4 py-3.5 outline-none transition-colors duration-100 hover:bg-[#fafafa] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0d0d0d]/30"
                    style={{ borderTop: i === 0 ? undefined : `1px solid ${t.border}` }}
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border"
                      style={{ borderColor: t.border }}
                    >
                      <span className="text-[15px] font-semibold leading-none tabular-nums">{exam.day}</span>
                      <span className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: t.faint }}>
                        {exam.month}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{exam.name}</span>
                      <span className="block text-[13px]" style={{ color: t.muted }}>
                        {exam.room} · 09:00
                      </span>
                    </span>
                    <span className="hidden rounded-full px-2 py-0.5 text-[11px] sm:block" style={{ backgroundColor: t.hover, color: t.muted }}>
                      Examen
                    </span>
                  </a>
                ))}
              </div>
            </section>

            <section className="mt-9" aria-labelledby="asignaturas">
              <div className="flex items-center justify-between">
                <h2 id="asignaturas" className="text-[13px] font-semibold tracking-[-0.01em]">
                  Asignaturas
                </h2>
                <a href="#" className="text-[13px] underline-offset-2 hover:underline" style={{ color: t.muted }}>
                  Todas
                </a>
              </div>

              <div className="mt-3 overflow-hidden rounded-xl border" style={{ borderColor: t.border }}>
                {subjects.map((subject, i) => (
                  <a
                    key={subject.name}
                    href="#"
                    className="group flex items-center gap-3.5 px-4 py-3.5 outline-none transition-colors duration-100 hover:bg-[#fafafa] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0d0d0d]/30"
                    style={{ borderTop: i === 0 ? undefined : `1px solid ${t.border}` }}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-medium"
                      style={{ backgroundColor: t.sidebar, color: t.muted }}
                    >
                      {subject.initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{subject.name}</span>
                      <span className="block text-[13px]" style={{ color: t.muted }}>
                        {subject.meta}
                      </span>
                    </span>
                    <span className="text-[13px] tabular-nums" style={{ color: t.faint }}>
                      {subject.detail}
                    </span>
                    <svg
                      viewBox="0 0 20 20"
                      className="h-4 w-4 shrink-0 opacity-0 transition-opacity duration-100 group-hover:opacity-100"
                      fill="none"
                      stroke={t.faint}
                      strokeWidth="1.5"
                      aria-hidden
                    >
                      <path d="M7.5 4.5 13 10l-5.5 5.5" />
                    </svg>
                  </a>
                ))}
              </div>
            </section>

            <p className="mt-10 text-[12px] leading-relaxed" style={{ color: t.faint }}>
              Studyist guarda tus archivos en local. Nada se envía fuera salvo lo que pidas al modelo.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
