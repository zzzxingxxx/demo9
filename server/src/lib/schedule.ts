import { and, eq } from "drizzle-orm";
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

export function selectDueTasks(
  tasks: ScheduledTask[],
  now: number
): ScheduledTask[] {
  return tasks.filter((t) => t.enabled && t.intervalMs > 0 && t.nextRun <= now);
}

export function advanceTask(task: ScheduledTask, now: number): ScheduledTask {
  const step = Math.max(1, task.intervalMs);
  const next =
    task.nextRun +
    Math.max(0, Math.floor((now - task.nextRun) / step) + 1) * step;
  return { ...task, nextRun: next };
}

export async function listScheduledTasks(
  db: Db,
  projectId: string
): Promise<ScheduledTaskRow[]> {
  return db
    .select()
    .from(scheduledTasks)
    .where(eq(scheduledTasks.projectId, projectId));
}

export async function createScheduledTask(
  db: Db,
  input: {
    projectId: string;
    title: string;
    intervalMs: number;
    action: string;
    payload?: string;
  }
): Promise<ScheduledTaskRow> {
  const title = input.title.trim();
  if (!title) throw pathError("INVALID", "任务需要标题");
  if (!Number.isInteger(input.intervalMs) || input.intervalMs < 30000)
    throw pathError("INVALID", "间隔至少为 30 秒");
  if (!["log", "run"].includes(input.action))
    throw pathError("INVALID", "不支持的任务动作");
  if (input.action === "run" && !input.payload?.trim())
    throw pathError("INVALID", "命令不能为空");
  if (!(await getProject(db, input.projectId)))
    throw pathError("NOT_FOUND", "项目不存在");
  const intervalMs = input.intervalMs;
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
  const run =
    ctx.run ??
    ((cwd, cmd) =>
      spawnProjectCommand(cwd, cmd).then(
        (r) => `[exit ${r.exitCode}]\n${r.output}`
      ));
  try {
    const output = await run(root, command);
    return output.slice(0, 4000);
  } catch (err) {
    return err instanceof Error ? err.message : "定时运行失败";
  }
}

export async function tickScheduledTasks(
  db: Db,
  now = Date.now()
): Promise<ScheduledTaskRow[]> {
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
  await Promise.all(
    due.map(async (task) => {
      const row = rows.find((r) => r.id === task.id);
      if (!row) return;
      const result = await runScheduledTask(db, row.id, now, row.nextRun);
      if (result) fired.push(result);
    })
  );
  return fired;
}

const running = new WeakMap<Db, Set<string>>();
export function isTaskRunning(db: Db, id: string): boolean {
  return running.get(db)?.has(id) || false;
}

export async function runScheduledTask(
  db: Db,
  id: string,
  now = Date.now(),
  expectedNextRun?: number
): Promise<ScheduledTaskRow | null> {
  const active = running.get(db) || new Set<string>();
  running.set(db, active);
  if (active.has(id)) return null;
  active.add(id);
  try {
    const row = (
      await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, id))
    )[0];
    if (!row) throw pathError("NOT_FOUND", "任务不存在");
    const project = await getProject(db, row.projectId);
    if (!project || project.archived) return null;
    const nextRun = advanceTask(row, now).nextRun;
    const claimed = await db
      .update(scheduledTasks)
      .set({ nextRun, lastRun: now, lastResult: "运行中" })
      .where(
        and(
          eq(scheduledTasks.id, id),
          ...(expectedNextRun === undefined
            ? []
            : [
                eq(scheduledTasks.nextRun, expectedNextRun),
                eq(scheduledTasks.enabled, true)
              ])
        )
      )
      .returning();
    if (!claimed.length) return null;
    const lastResult = await executeScheduledAction(row, {
      rootPath: project.rootPath
    });
    await db
      .update(scheduledTasks)
      .set({ lastResult })
      .where(eq(scheduledTasks.id, id));
    return { ...row, nextRun, lastRun: now, lastResult };
  } finally {
    active.delete(id);
  }
}

export async function updateScheduledTask(
  db: Db,
  id: string,
  patch: Partial<
    Pick<
      ScheduledTaskRow,
      "title" | "intervalMs" | "action" | "payload" | "enabled"
    >
  >
): Promise<void> {
  const row = (
    await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, id))
  )[0];
  if (!row) throw pathError("NOT_FOUND", "任务不存在");
  const next = { ...row, ...patch };
  if (
    !next.title.trim() ||
    next.intervalMs < 30000 ||
    !["run", "log"].includes(next.action) ||
    (next.action === "run" && !next.payload.trim())
  )
    throw pathError("INVALID", "任务标题、间隔或命令无效");
  await db
    .update(scheduledTasks)
    .set({
      ...patch,
      ...(patch.intervalMs !== undefined || patch.enabled === true
        ? { nextRun: Date.now() + next.intervalMs }
        : {})
    })
    .where(eq(scheduledTasks.id, id));
}

export async function deleteScheduledTask(db: Db, id: string): Promise<void> {
  if (isTaskRunning(db, id))
    throw pathError("BUSY", "任务运行中，请结束后删除");
  await db.delete(scheduledTasks).where(eq(scheduledTasks.id, id));
}
