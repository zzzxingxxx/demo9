import { Hono } from "hono";
import { z } from "zod";
import { assembleSystemPrompt, toModelMessages, type ChatTurn } from "../lib/chat/assemble.js";
import { parseAtMentions, resolveChatRefs } from "../lib/chat/refs.js";
import { streamWorkbenchChat } from "../lib/chat/stream.js";
import { getDb } from "../lib/db/index.js";
import { getMissingKeyError, publicError, readModel } from "../lib/env.js";
import { listTree, readProjectFile } from "../lib/files.js";
import { formatSourceCardsPrompt } from "../lib/fts.js";
import { attachKnowledgeSlices, listKnowledge, searchProjectKnowledge } from "../lib/knowledge.js";
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
import { getSkill, listCustomSkills, skillPromptAssembly } from "../lib/skills.js";
import { recordUsage } from "../lib/usage.js";

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
        skillId: z.string().optional(),
        truncateFromMessageId: z.string().optional(),
        images: z
          .array(z.object({ mimeType: z.string().min(1), dataBase64: z.string().min(1) }))
          .optional()
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

    const extras = await listCustomSkills(db, body.projectId);
    const skill = body.skillId ? getSkill(body.skillId, extras) : undefined;
    const packed = skill ? skillPromptAssembly(skill, body.content) : { skillPrompt: "", content: body.content };
    await addMessage(db, session.id, "user", packed.content);
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

    const mentions = parseAtMentions(body.content);
    const root = project.rootPath;
    const refs = await resolveChatRefs(mentions, {
      readFile: root ? (rel) => readProjectFile(root, rel) : undefined,
      listTree: root ? () => listTree(root) : undefined,
      loadRules: root ? () => loadProjectRules(root) : undefined,
      loadKnowledge: async (name) => {
        const docs = await listKnowledge(db, project.id);
        const content = attachKnowledgeSlices(docs, name);
        if (!content) return null;
        return { title: name || "知识", content };
      }
    });

    const history = await listMessages(db, session.id);
    const turns: ChatTurn[] = history.map((m) => ({
      role: m.role as ChatTurn["role"],
      content: m.content
    }));
    const cards = await searchProjectKnowledge(db, project.id, packed.content);
    const skillPrompt = [packed.skillPrompt, formatSourceCardsPrompt(cards)].filter(Boolean).join("\n\n");
    const system = assembleSystemPrompt({ rules, refs, skillPrompt });
    const messages = toModelMessages(system, turns);

    const result = streamWorkbenchChat({
      apiKey: process.env.XAI_API_KEY!,
      model: body.model || readModel(process.env),
      messages,
      abortSignal: c.req.raw.signal,
      rootPath: project.rootPath,
      images: body.images,
      onFinish: async (text, usage) => {
        if (text.trim()) await addMessage(db, session.id, "assistant", text);
        await recordUsage(db, {
          projectId: project.id,
          kind: "chat",
          tokensIn: usage?.tokensIn,
          tokensOut: usage?.tokensOut
        });
      }
    });

    const response = result.toTextStreamResponse();
    response.headers.set("x-session-id", session.id);
    response.headers.set("x-source-cards", encodeURIComponent(JSON.stringify(cards.slice(0, 8))));
    return response;
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
