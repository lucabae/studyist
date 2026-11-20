import { useEffect, useMemo, useState } from "react";
import { updateTemaTemaTemaIdPut, type FileRead, type TemaRead } from "../../api/generated";
import { Button, useToast } from "../../components";
import { apiErrorMessage } from "../../lib/api";
import { isTemarioPdf } from "./subjectProgress";
import { TopicSectionCard } from "./TopicSectionCard";

interface TopicStudyTimelineProps {
  topic: TemaRead;
  files: FileRead[];
  onSaved: (topic: TemaRead) => void;
}

function cleanDocName(name: string): string {
  return name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
}

function compareDocuments(a: FileRead, b: FileRead): number {
  // 1. Prioridad por tipo: teoria primero, luego otros, luego examen
  const kindOrder = (kind?: string) => (kind === "teoria" ? 0 : kind === "otros" ? 1 : 2);
  const kindDiff = kindOrder(a.kind) - kindOrder(b.kind);
  if (kindDiff !== 0) return kindDiff;

  // 2. Numero extraido de "tema_2.1", "tema 11", "2-mips", etc.
  const numA = a.name.match(/(?:tema[_\s-]*)?(\d+(?:\.\d+)*)/i);
  const numB = b.name.match(/(?:tema[_\s-]*)?(\d+(?:\.\d+)*)/i);
  if (numA && numB) {
    const partsA = numA[1].split(".").map(Number);
    const partsB = numB[1].split(".").map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
      if (diff !== 0) return diff;
    }
  } else if (numA) {
    return -1;
  } else if (numB) {
    return 1;
  }

  return a.name.localeCompare(b.name, "es", { numeric: true, sensitivity: "base" });
}

export function TopicStudyTimeline({ topic, files, onSaved }: TopicStudyTimelineProps) {
  const { toast } = useToast();
  const documents = useMemo(
    () =>
      files
        .filter((file) => topic.file_ids?.includes(file.id) && isTemarioPdf(file))
        .sort(compareDocuments),
    [files, topic.file_ids],
  );
  const totalPages = documents.reduce((sum, file) => sum + (file.page_count ?? 0), 0);
  const [teacher, setTeacher] = useState(topic.teacher_progress ?? 0);
  const [student, setStudent] = useState(topic.student_progress ?? 0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTeacher(Math.min(topic.teacher_progress ?? 0, totalPages));
    setStudent(Math.min(topic.student_progress ?? 0, totalPages));
  }, [topic.teacher_progress, topic.student_progress, totalPages]);

  if (totalPages === 0) return null;

  const dirty =
    teacher !== (topic.teacher_progress ?? 0) || student !== (topic.student_progress ?? 0);

  async function save() {
    setSaving(true);
    const { data, error } = await updateTemaTemaTemaIdPut({
      path: { tema_id: topic.id },
      body: { teacher_progress: teacher, student_progress: student },
    });
    setSaving(false);
    if (error || !data) {
      toast(apiErrorMessage(error), "error");
      return;
    }
    onSaved(data);
    toast("Progreso guardado", "success");
  }

  return (
    <TopicSectionCard
      title="Progreso del tema"
      action={
        <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="relative pt-2">
          <div className="flex h-12 overflow-hidden rounded-lg border border-onyx-line bg-onyx-bg">
            {documents.map((file) => {
              const pages = file.page_count ?? 0;
              const ratio = totalPages > 0 ? pages / totalPages : 0;
              const percent = ratio * 100;
              const isTiny = percent < 6;
              const isSmall = percent >= 6 && percent < 16;
              const displayName = cleanDocName(file.name);

              return (
                <div
                  key={file.id}
                  title={`${file.name} · ${pages} páginas (${percent.toFixed(1)}%)`}
                  className="group relative flex min-w-0 flex-col items-center justify-center border-r-2 border-white bg-onyx-surface py-1 text-center transition-colors duration-150 hover:bg-onyx-surfaceHover last:border-r-0"
                  style={{ width: `${percent}%` }}
                >
                  {isTiny ? (
                    <span className="w-full truncate px-0.5 text-[10px] font-medium text-onyx-inkMuted tabular-nums">
                      {pages}p
                    </span>
                  ) : isSmall ? (
                    <>
                      <span className="w-full truncate px-1 text-[11px] font-medium text-onyx-ink">
                        {displayName}
                      </span>
                      <span className="w-full truncate px-0.5 text-[10px] text-onyx-inkFaint tabular-nums">
                        {pages}p
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="w-full truncate px-1 text-[11px] font-medium text-onyx-ink">
                        {displayName}
                      </span>
                      <span className="w-full truncate px-1 text-[10px] text-onyx-inkMuted tabular-nums">
                        {pages} páginas
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.7)]"
            style={{ left: `${(teacher / totalPages) * 100}%` }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-sky-300 shadow-[0_0_6px_rgba(125,211,252,0.7)]"
            style={{ left: `${(student / totalPages) * 100}%` }}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[12px] text-onyx-inkMuted">
            <span className="flex justify-between">
              <span>Va el profesor</span>
              <strong className="font-medium text-amber-300">{teacher}/{totalPages}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={totalPages}
              value={teacher}
              onChange={(event) => setTeacher(Number(event.target.value))}
              className="accent-amber-300"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-onyx-inkMuted">
            <span className="flex justify-between">
              <span>Voy yo</span>
              <strong className="font-medium text-sky-300">{student}/{totalPages}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={totalPages}
              value={student}
              onChange={(event) => setStudent(Number(event.target.value))}
              className="accent-sky-300"
            />
          </label>
        </div>
      </div>
    </TopicSectionCard>
  );
}
