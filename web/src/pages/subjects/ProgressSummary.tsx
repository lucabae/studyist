import { formatMinutes } from "../../lib/format";
import { ProgressBar } from "../../components";
import type { ProgressStats } from "./subjectProgress";

export interface ProgressSummaryProps {
  stats: ProgressStats;
  className?: string;
}

/**
 * Resumen de progreso de una asignatura: porcentaje, tiempo restante y
 * desglose entre paginas de temario y hojas de ejercicios.
 */
export function ProgressSummary({ stats, className }: ProgressSummaryProps) {
  return (
    <section
      aria-label="Progreso de la asignatura"
      className={`rounded-xl border border-onyx-line bg-onyx-surface p-4 ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] text-onyx-inkMuted">Progreso general</p>
          <p className="mt-0.5 text-[26px] font-medium leading-none tabular-nums text-onyx-ink">
            {stats.percent}
            <span className="text-[15px] text-onyx-inkMuted">%</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[12px] text-onyx-inkMuted">Tiempo restante</p>
          <p className="mt-0.5 text-[15px] font-medium tabular-nums text-onyx-ink">
            ≈ {formatMinutes(stats.remainingMinutes)}
          </p>
          <p className="text-[11px] text-onyx-inkFaint">
            de {formatMinutes(stats.totalMinutes)} en total
          </p>
        </div>
      </div>

      <ProgressBar value={stats.percent} className="mt-3" />

      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-onyx-line/70 bg-onyx-bg/40 px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wide text-onyx-inkFaint">
            Temario
          </dt>
          <dd className="mt-0.5 text-[13px] text-onyx-ink">
            {stats.temarioPagesDone}/{stats.temarioPages} páginas
            <span className="text-onyx-inkMuted">
              {" "}
              · quedan {formatMinutes(stats.temarioRemainingMinutes)}
            </span>
          </dd>
          <dd className="text-[11px] text-onyx-inkFaint">1 página = 1 minuto</dd>
        </div>
        <div className="rounded-lg border border-onyx-line/70 bg-onyx-bg/40 px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wide text-onyx-inkFaint">
            Ejercicios
          </dt>
          <dd className="mt-0.5 text-[13px] text-onyx-ink">
            {stats.exerciseSheets} {stats.exerciseSheets === 1 ? "hoja" : "hojas"}
            <span className="text-onyx-inkMuted">
              {" "}
              · quedan {formatMinutes(stats.exerciseRemainingMinutes)}
            </span>
          </dd>
          <dd className="text-[11px] text-onyx-inkFaint">30 minutos por hoja</dd>
        </div>
      </dl>
    </section>
  );
}
