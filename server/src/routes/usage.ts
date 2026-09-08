import { Hono } from "hono";
import { z } from "zod";
import { getSettingsMap, setSetting } from "../lib/appSettings.js";
import { getDb } from "../lib/db/index.js";
import { requestLogs, usageEvents } from "../lib/db/schema.js";
import { publicError } from "../lib/env.js";
import { summarizeUsage } from "../lib/usage.js";
import {
  publicSettings,
  saveProviderSettings
} from "../lib/providerSettings.js";

export const usageRoutes = new Hono();

usageRoutes.patch("/api/providers", async (c) => {
  try {
    const body = z
      .object({
        xaiApiKey: z.string().max(4000).optional(),
        embeddingBaseUrl: z
          .string()
          .refine((v) => !v || /^https?:\/\//.test(v), "请输入 HTTP(S) 地址")
          .optional(),
        embeddingModel: z.string().max(200).optional(),
        embeddingApiKey: z.string().max(4000).optional()
      })
      .parse(await c.req.json());
    await saveProviderSettings(await getDb(), body);
    return c.json({ ok: true });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

usageRoutes.get("/api/usage", async (c) => {
  try {
    const db = await getDb();
    const events = await db.select().from(usageEvents);
    return c.json({
      summary: summarizeUsage(events),
      events: events.slice(-200)
    });
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
        if (key.startsWith("provider.")) continue;
        await setSetting(db, key, value);
      }
    }
    return c.json({ settings: publicSettings(await getSettingsMap(db)) });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
