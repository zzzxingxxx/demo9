import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../lib/db/index.js";
import { publicError } from "../lib/env.js";
import { createScheduledTask, listScheduledTasks, tickScheduledTasks } from "../lib/schedule.js";

export const scheduleRoutes = new Hono();

scheduleRoutes.get("/api/schedule", async (c) => {
  try {
    const projectId = c.req.query("projectId");
    if (!projectId) return c.json({ code: "INVALID", error: "缺少 projectId" }, 400);
    const db = await getDb();
    const tasks = await listScheduledTasks(db, projectId);
    return c.json({ tasks });
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
