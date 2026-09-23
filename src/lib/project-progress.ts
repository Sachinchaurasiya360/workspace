import { db } from "@/lib/db";

/** Progress % is never stored — always computed from linked tasks so it can't drift. */
export async function getProjectProgress(projectId: string) {
  const [total, completed] = await Promise.all([
    db.task.count({ where: { projectId } }),
    db.task.count({ where: { projectId, status: "COMPLETED" } }),
  ]);
  return { total, completed, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
}

export async function getProjectProgressMap(projectIds: string[]) {
  if (projectIds.length === 0) return new Map<string, { total: number; completed: number; percent: number }>();
  const tasks = await db.task.findMany({
    where: { projectId: { in: projectIds } },
    select: { projectId: true, status: true },
  });
  const map = new Map<string, { total: number; completed: number }>();
  for (const t of tasks) {
    const key = t.projectId!;
    const entry = map.get(key) ?? { total: 0, completed: 0 };
    entry.total++;
    if (t.status === "COMPLETED") entry.completed++;
    map.set(key, entry);
  }
  const result = new Map<string, { total: number; completed: number; percent: number }>();
  for (const id of projectIds) {
    const entry = map.get(id) ?? { total: 0, completed: 0 };
    result.set(id, { ...entry, percent: entry.total === 0 ? 0 : Math.round((entry.completed / entry.total) * 100) });
  }
  return result;
}
