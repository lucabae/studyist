import type { TemaRead } from "../../api/generated";

export interface TopicRow {
  topic: TemaRead;
  depth: number;
}

/** Orden natural por nombre, igual que el que aplica el backend. */
export function byName(a: TemaRead, b: TemaRead): number {
  return a.name.localeCompare(b.name, "es", { numeric: true });
}

/**
 * Aplana el arbol de temas en filas con su profundidad.
 *
 * Pasos: agrupar los temas por parent_id y ordenar cada grupo por nombre;
 * recorrer desde las raices (parent_id null) saltando los nodos plegados; al
 * final anadir los temas cuyo padre no esta en la lista (o que forman un
 * ciclo) como raices, para no perder ninguno.
 */
export function flattenTopics(
  topics: TemaRead[],
  collapsed: Set<number> = new Set(),
): TopicRow[] {
  const children = new Map<number | null, TemaRead[]>();
  for (const topic of topics) {
    const key = topic.parent_id ?? null;
    const bucket = children.get(key);
    if (bucket) bucket.push(topic);
    else children.set(key, [topic]);
  }
  for (const bucket of children.values()) bucket.sort(byName);

  const rows: TopicRow[] = [];
  const visited = new Set<number>();

  function walk(parentId: number | null, depth: number) {
    for (const topic of children.get(parentId) ?? []) {
      if (visited.has(topic.id)) continue;
      visited.add(topic.id);
      rows.push({ topic, depth });
      if (!collapsed.has(topic.id)) walk(topic.id, depth + 1);
    }
  }

  walk(null, 0);

  for (const topic of topics.filter((item) => !visited.has(item.id)).sort(byName)) {
    if (visited.has(topic.id)) continue;
    visited.add(topic.id);
    rows.push({ topic, depth: 0 });
    if (!collapsed.has(topic.id)) walk(topic.id, 1);
  }

  return rows;
}

/** Ids del tema y de todos sus descendientes, para borrarlos en local. */
export function collectSubtreeIds(topics: TemaRead[], rootId: number): Set<number> {
  const ids = new Set<number>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const topic of topics) {
      const parentId = topic.parent_id;
      if (parentId != null && ids.has(parentId) && !ids.has(topic.id)) {
        ids.add(topic.id);
        changed = true;
      }
    }
  }
  return ids;
}

/**
 * Opciones para un `<select>` de tema padre: el propio tema y sus descendientes
 * quedan fuera, porque colgar de ellos cerraria un ciclo.
 */
export function parentOptions(topics: TemaRead[], topicId?: number): TopicRow[] {
  const excluded =
    topicId === undefined ? new Set<number>() : collectSubtreeIds(topics, topicId);
  return flattenTopics(topics).filter((row) => !excluded.has(row.topic.id));
}

/** Etiqueta con sangria (espacios duros) para el desplegable de tema padre. */
export function optionLabel(row: TopicRow): string {
  return `${"\u00a0\u00a0".repeat(row.depth)}${row.topic.name}`;
}
