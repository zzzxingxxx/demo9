import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../lib/db/index.js";
import { publicError } from "../lib/env.js";
import {
  createScheduledTask,
  listScheduledTasks,
  tickScheduledTasks,
  updateScheduledTask,
  deleteScheduledTask,
  runScheduledTask,
  isTaskRunning
} from "../lib/schedule.js";

export const scheduleRoutes = new Hono();

scheduleRoutes.get("/api/schedule", async (c) => {
  try {
    const projectId = c.req.query("projectId");
    if (!projectId)
      return c.json({ code: "INVALID", error: "缺少 projectId" }, 400);
    const db = await getDb();
    const tasks = await listScheduledTasks(db, projectId);
    return c.json({
      tasks: tasks.map((t) => ({ ...t, running: isTaskRunning(db, t.id) }))
    });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

scheduleRoutes.patch("/api/schedule/:id", async (c) => {
  try {
    const body = z
      .object({
        title: z.string().trim().min(1).optional(),
        intervalMs: z.number().int().min(30000).optional(),
        action: z.enum(["log", "run"]).optional(),
        payload: z.string().optional(),
        enabled: z.boolean().optional()
      })
      .parse(await c.req.json());
    await updateScheduledTask(await getDb(), c.req.param("id"), body);
    return c.json({ ok: true });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
scheduleRoutes.delete("/api/schedule/:id", async (c) => {
  try {
    await deleteScheduledTask(await getDb(), c.req.param("id"));
    return c.json({ ok: true });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
scheduleRoutes.post("/api/schedule/:id/run", async (c) => {
  try {
    const task = await runScheduledTask(await getDb(), c.req.param("id"));
    if (!task)
      return c.json({ code: "BUSY", error: "任务已运行或项目已归档" }, 409);
    return c.json({ task });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

scheduleRoutes.post("/api/schedule", async (c) => {
  try {
    const body = z
      .object({
        projectId: z.string().min(1),
        title: z.string().min(1),
        intervalMs: z.number().int().positive(),
        action: z.string().optional(),
        payload: z.string().optional()
      })
      .parse(await c.req.json());
    const db = await getDb();
    const task = await createScheduledTask(db, {
      projectId: body.projectId,
      title: body.title,
      intervalMs: body.intervalMs,
      action: body.action || "log",
      payload: body.payload
    });
    return c.json({ task }, 201);
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

scheduleRoutes.post("/api/schedule/tick", async (c) => {
  try {
    const db = await getDb();
    const fired = await tickScheduledTasks(db);
    return c.json({ fired });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
