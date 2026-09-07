import { Hono } from "hono";
import { z } from "zod";
import { assembleSystemPrompt, toModelMessages, type ChatTurn } from "../lib/chat/assemble.js";
import { streamWorkbenchChat } from "../lib/chat/stream.js";
import { getDb } from "../lib/db/index.js";
import { getMissingKeyError, publicError, readModel } from "../lib/env.js";
import { getProject } from "../lib/projects.js";
import { loadProjectRules } from "../lib/rules.js";
import {
  addMessage,
  createSession,
  ensureSessionTitle,
  getSession,
  listMessages,
  truncateFrom,
  updateSession
} from "../lib/sessions.js";

export const chatRoutes = new Hono();

chatRoutes.post("/api/chat", async (c) => {
  const keyError = getMissingKeyError(process.env);
  if (keyError) return c.json(keyError, 400);

  try {
    const body = z
      .object({
        projectId: z.string().min(1),
        sessionId: z.string().optional(),
        content: z.string().min(1),
        model: z.string().optional(),
        truncateFromMessageId: z.string().optional()
      })
      .parse(await c.req.json());

    const db = await getDb();
    const project = await getProject(db, body.projectId);
    if (!project) return c.json({ code: "NOT_FOUND", error: "项目不存在" }, 404);

    let session = body.sessionId ? await getSession(db, body.sessionId) : undefined;
    if (!session) session = await createSession(db, body.projectId);

    if (body.truncateFromMessageId) {
      await truncateFrom(db, session.id, body.truncateFromMessageId);
    }

    await addMessage(db, session.id, "user", body.content);
    const title = ensureSessionTitle(session, body.content);
    if (title !== session.title) await updateSession(db, session.id, { title });

    let rules = "";
    if (project.rootPath) {
      try {
        rules = (await loadProjectRules(project.rootPath)).content;
      } catch {
        rules = "";
      }
    }

    const history = await listMessages(db, session.id);
    const turns: ChatTurn[] = history.map((m) => ({
      role: m.role as ChatTurn["role"],
      content: m.content
    }));
    const system = assembleSystemPrompt({ rules });
    const messages = toModelMessages(system, turns);

    const result = streamWorkbenchChat({
      apiKey: process.env.XAI_API_KEY!,
      model: body.model || readModel(process.env),
      messages,
      abortSignal: c.req.raw.signal,
      onFinish: async (text) => {
        if (text.trim()) await addMessage(db, session.id, "assistant", text);
      }
    });

    const response = result.toTextStreamResponse();
    response.headers.set("x-session-id", session.id);
    return response;
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
