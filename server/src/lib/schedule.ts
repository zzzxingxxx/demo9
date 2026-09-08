import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "./db/index.js";
import { scheduledTasks, type ScheduledTaskRow } from "./db/schema.js";
import { getProject } from "./projects.js";
import { pathError } from "./paths.js";
import { spawnProjectCommand } from "./terminal.js";

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
    lastResult: "",
    enabled: true,
    createdAt: now
  };
  await db.insert(scheduledTasks).values(row);
  return row;
}

export function interpretScheduledAction(task: {
  action: string;
  payload: string;
  title: string;
}): { kind: "log" | "run"; command?: string; message: string } {
  const action = (task.action || "log").trim().toLowerCase();
  const payload = (task.payload || "").trim();
  if (action === "run") {
    return { kind: "run", command: payload, message: payload || task.title };
  }
  const message = [task.title, payload].filter(Boolean).join(" · ");
  return { kind: "log", message: message || "log" };
}

export async function executeScheduledAction(
  task: { action: string; payload: string; title: string; projectId: string },
  ctx: {
    rootPath?: string | null;
    run?: (cwd: string, command: string) => Promise<string>;
  }
): Promise<string> {
  const interpreted = interpretScheduledAction(task);
  if (interpreted.kind === "log") return interpreted.message;
  const command = interpreted.command?.trim() || "";
  if (!command) return "定时运行需要 payload 命令";
  const root = ctx.rootPath;
  if (!root) return "项目未绑定本地目录";
  const run = ctx.run ?? ((cwd, cmd) => spawnProjectCommand(cwd, cmd).then((r) => r.output));
  try {
    const output = await run(root, command);
    return output.slice(0, 4000);
  } catch (err) {
    return err instanceof Error ? err.message : "定时运行失败";
  }
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
    const project = await getProject(db, row.projectId);
    const lastResult = await executeScheduledAction(row, { rootPath: project?.rootPath ?? null });
    const next: ScheduledTaskRow = {
      ...row,
      nextRun: advanced.nextRun,
      lastRun: now,
      lastResult
    };
    await db
      .update(scheduledTasks)
      .set({ nextRun: next.nextRun, lastRun: now, lastResult })
      .where(eq(scheduledTasks.id, row.id));
    fired.push(next);
  }
  return fired;
}
