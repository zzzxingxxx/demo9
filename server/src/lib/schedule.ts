import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "./db/index.js";
import { scheduledTasks, type ScheduledTaskRow } from "./db/schema.js";
import { pathError } from "./paths.js";

export type ScheduledTask = {
  id: string;
  enabled: boolean;
  nextRun: number;
  intervalMs: number;
  title?: string;
};

export function selectDueTasks(tasks: ScheduledTask[], now: number): ScheduledTask[] {
  return tasks.filter((t) => t.enabled && t.intervalMs > 0 && t.nextRun <= now);
}

export function advanceTask(task: ScheduledTask, now: number): ScheduledTask {
  const step = Math.max(1, task.intervalMs);
  let next = task.nextRun;
  while (next <= now) next += step;
  return { ...task, nextRun: next };
}

export async function listScheduledTasks(db: Db, projectId: string): Promise<ScheduledTaskRow[]> {
  return db.select().from(scheduledTasks).where(eq(scheduledTasks.projectId, projectId));
}

export async function createScheduledTask(
  db: Db,
  input: { projectId: string; title: string; intervalMs: number; action: string; payload?: string }
): Promise<ScheduledTaskRow> {
  const title = input.title.trim();
  if (!title) throw pathError("INVALID", "任务需要标题");
  const intervalMs = Math.max(1000, input.intervalMs);
  const now = Date.now();
  const row: ScheduledTaskRow = {
    id: randomUUID(),
    projectId: input.projectId,
    title,
    intervalMs,
    nextRun: now + intervalMs,
    lastRun: null,
    action: input.action.trim() || "log",
    payload: input.payload || "",
    enabled: true,
    createdAt: now
  };
  await db.insert(scheduledTasks).values(row);
  return row;
}

export async function tickScheduledTasks(db: Db, now = Date.now()): Promise<ScheduledTaskRow[]> {
  const rows = await db.select().from(scheduledTasks);
  const due = selectDueTasks(
    rows.map((r) => ({
      id: r.id,
      enabled: r.enabled,
      nextRun: r.nextRun,
      intervalMs: r.intervalMs,
      title: r.title
    })),
    now
  );
  const fired: ScheduledTaskRow[] = [];
  for (const task of due) {
    const row = rows.find((r) => r.id === task.id);
    if (!row) continue;
    const advanced = advanceTask(task, now);
    const next: ScheduledTaskRow = { ...row, nextRun: advanced.nextRun, lastRun: now };
    await db.update(scheduledTasks).set({ nextRun: next.nextRun, lastRun: now }).where(eq(scheduledTasks.id, row.id));
    fired.push(next);
  }
  return fired;
}
