import { useEffect, useMemo, useState } from "react";
import { updateTemaTemaTemaIdPut, type FileRead, type TemaRead } from "../../api/generated";
import { Button, useToast } from "../../components";
import { apiErrorMessage } from "../../lib/api";
import { TopicSectionCard } from "./TopicSectionCard";

interface TopicStudyTimelineProps {
  topic: TemaRead;
  files: FileRead[];
  onSaved: (topic: TemaRead) => void;
}

function documentNumber(name: string): number[] | null {
  const match = name.trim().match(/^(\d+(?:\.\d+)*)\b/);
  return match ? match[1].split(".").map(Number) : null;
}

function compareDocuments(a: FileRead, b: FileRead): number {
  const left = documentNumber(a.name);
  const right = documentNumber(b.name);
  if (left && right) {
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const difference = (left[index] ?? -1) - (right[index] ?? -1);
      if (difference !== 0) return difference;
    }
  } else if (left) {
    return -1;
  } else if (right) {
    return 1;
  }
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

export function TopicStudyTimeline({ topic, files, onSaved }: TopicStudyTimelineProps) {
  const { toast } = useToast();
  const documents = useMemo(
    () =>
      files
        .filter(
          (file) =>
            topic.file_ids?.includes(file.id) &&
            file.type === "application/pdf" &&
            file.kind !== "ejercicio" &&
            (file.page_count ?? 0) > 0,
        )
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
              return (
                <div
                  key={file.id}
                  title={`${file.name} · ${pages} páginas`}
                  className="flex min-w-0 items-center justify-center border-r border-onyx-bg px-1 text-center text-[11px] text-onyx-inkMuted last:border-r-0"
                  style={{ width: `${(pages / totalPages) * 100}%` }}
                >
                  <span className="truncate">{file.name}</span>
                </div>
              );
            })}
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px bg-amber-300"
            style={{ left: `${(teacher / totalPages) * 100}%` }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px bg-sky-300"
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
