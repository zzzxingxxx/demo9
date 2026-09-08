import { Hono } from "hono";
import { z } from "zod";
import { exportSessionMarkdown } from "../lib/chat/assemble.js";
import { getDb } from "../lib/db/index.js";
import { publicError } from "../lib/env.js";
import {
  branchSession,
  createSession,
  getSession,
  listMessages,
  listSessions,
  starMessage,
  updateSession
} from "../lib/sessions.js";

export const sessionRoutes = new Hono();

sessionRoutes.get("/api/sessions", async (c) => {
  try {
    const projectId = c.req.query("projectId");
    if (!projectId) return c.json({ code: "INVALID", error: "缺少 projectId" }, 400);
    const db = await getDb();
    const items = await listSessions(db, projectId, c.req.query("q") || "");
    return c.json({ sessions: items });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

sessionRoutes.post("/api/sessions", async (c) => {
  try {
    const body = z.object({ projectId: z.string().min(1), title: z.string().optional() }).parse(await c.req.json());
    const db = await getDb();
    const session = await createSession(db, body.projectId, body.title);
    return c.json({ session }, 201);
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

sessionRoutes.patch("/api/sessions/:id", async (c) => {
  try {
    const body = z
      .object({
        title: z.string().optional(),
        pinned: z.boolean().optional(),
        archived: z.boolean().optional()
      })
      .parse(await c.req.json());
    const db = await getDb();
    const session = await updateSession(db, c.req.param("id"), body);
    return c.json({ session });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

sessionRoutes.get("/api/sessions/:id/messages", async (c) => {
  const db = await getDb();
  const session = await getSession(db, c.req.param("id"));
  if (!session) return c.json({ code: "NOT_FOUND", error: "会话不存在" }, 404);
  const items = await listMessages(db, session.id);
  return c.json({ session, messages: items });
});

sessionRoutes.post("/api/sessions/:id/branch", async (c) => {
  try {
    const body = z.object({ messageId: z.string().min(1) }).parse(await c.req.json());
    const db = await getDb();
    const session = await branchSession(db, c.req.param("id"), body.messageId);
    return c.json({ session }, 201);
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

sessionRoutes.post("/api/messages/:id/star", async (c) => {
  try {
    const body = z.object({ starred: z.boolean() }).parse(await c.req.json());
    const db = await getDb();
    const message = await starMessage(db, c.req.param("id"), body.starred);
    return c.json({ message });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

sessionRoutes.get("/api/sessions/:id/export", async (c) => {
  const db = await getDb();
  const session = await getSession(db, c.req.param("id"));
  if (!session) return c.json({ code: "NOT_FOUND", error: "会话不存在" }, 404);
  const items = await listMessages(db, session.id);
  const markdown = exportSessionMarkdown(
    session.title,
    items.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
  );
  return c.json({ markdown });
});
