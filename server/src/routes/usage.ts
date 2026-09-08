import { Hono } from "hono";
import { z } from "zod";
import { getSettingsMap, setSetting } from "../lib/appSettings.js";
import { getDb } from "../lib/db/index.js";
import { requestLogs, usageEvents } from "../lib/db/schema.js";
import { publicError } from "../lib/env.js";
import { summarizeUsage } from "../lib/usage.js";

export const usageRoutes = new Hono();

usageRoutes.get("/api/usage", async (c) => {
  try {
    const db = await getDb();
    const events = await db.select().from(usageEvents);
    return c.json({ summary: summarizeUsage(events), events: events.slice(-200) });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

usageRoutes.get("/api/logs", async (c) => {
  try {
    const db = await getDb();
    const logs = await db.select().from(requestLogs);
    return c.json({ logs: logs.slice(-200) });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

usageRoutes.patch("/api/settings", async (c) => {
  try {
    const body = z
      .object({
        requestLog: z.boolean().optional(),
        settings: z.record(z.string()).optional()
      })
      .parse(await c.req.json());
    const db = await getDb();
    if (body.requestLog !== undefined) {
      await setSetting(db, "requestLog", body.requestLog ? "1" : "0");
    }
    if (body.settings) {
      for (const [key, value] of Object.entries(body.settings)) {
        await setSetting(db, key, value);
      }
    }
    return c.json({ settings: await getSettingsMap(db) });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
