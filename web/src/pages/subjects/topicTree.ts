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
  const topicsById = new Map<number, TemaRead>(topics.map((t) => [t.id, t]));
  const children = new Map<number, TemaRead[]>();
  const roots: TemaRead[] = [];

  for (const topic of topics) {
    if (topic.parent_id == null || !topicsById.has(topic.parent_id)) {
      roots.push(topic);
    } else {
      const bucket = children.get(topic.parent_id);
      if (bucket) bucket.push(topic);
      else children.set(topic.parent_id, [topic]);
    }
  }

  for (const bucket of children.values()) bucket.sort(byName);
  roots.sort(byName);

  // Marcar todos los descendientes que forman parte de arboles con raiz conocida,
  // independientemente de si estan plegados o no, para que los plegados no se
  // confundan con huerfanos al final.
  const reachable = new Set<number>();
  function markReachable(topicId: number) {
    if (reachable.has(topicId)) return;
    reachable.add(topicId);
    for (const child of children.get(topicId) ?? []) {
      markReachable(child.id);
    }
  }

  for (const root of roots) {
    markReachable(root.id);
  }

  const rows: TopicRow[] = [];
  const inRow = new Set<number>();

  function walk(topic: TemaRead, depth: number) {
    if (inRow.has(topic.id)) return;
    inRow.add(topic.id);
    rows.push({ topic, depth });
    if (!collapsed.has(topic.id)) {
      for (const child of children.get(topic.id) ?? []) {
        walk(child, depth + 1);
      }
    }
  }

  for (const root of roots) {
    walk(root, 0);
  }

  // Temas que no cuelgan de ninguna raiz (por ejemplo ciclos aislados entre si)
  for (const topic of topics.filter((t) => !reachable.has(t.id)).sort(byName)) {
    if (reachable.has(topic.id)) continue;
    markReachable(topic.id);
    walk(topic, 0);
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
