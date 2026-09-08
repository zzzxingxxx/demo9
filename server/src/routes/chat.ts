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
import { formatMcpServersPrompt, listMcpServers } from "../lib/mcp.js";
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
        content: z.string().optional(),
        model: z.string().optional(),
        skillId: z.string().optional(),
        truncateFromMessageId: z.string().optional(),
        regenerateFromMessageId: z.string().optional(),
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

    const isRegen = Boolean(body.regenerateFromMessageId);
    if (body.regenerateFromMessageId) {
      await truncateFrom(db, session.id, body.regenerateFromMessageId);
    } else if (body.truncateFromMessageId) {
      await truncateFrom(db, session.id, body.truncateFromMessageId);
    }

    const extras = await listCustomSkills(db, body.projectId);
    const skill = body.skillId ? getSkill(body.skillId, extras) : undefined;
    const userText = (body.content || "").trim();
    if (!isRegen && !userText) return c.json({ code: "INVALID", error: "内容不能为空" }, 400);
    const packed = skill
      ? skillPromptAssembly(skill, userText || " ")
      : { skillPrompt: "", content: userText };
    if (!isRegen) {
      await addMessage(db, session.id, "user", packed.content);
      const title = ensureSessionTitle(session, packed.content);
      if (title !== session.title) await updateSession(db, session.id, { title });
    }

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
    const queryText =
      packed.content.trim() || [...history].reverse().find((m) => m.role === "user")?.content || "";
    const mentions = parseAtMentions(queryText);
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
    const cards = await searchProjectKnowledge(db, project.id, queryText);
    const mcpRows = (await listMcpServers(db)).filter((s) => s.enabled);
    const mcpServers = mcpRows.map((s) => ({
      name: s.name,
      command: s.command,
      args: JSON.parse(s.argsJson) as string[]
    }));
    const mcpPrompt = formatMcpServersPrompt(
      mcpServers.map((s) => ({
        name: s.name,
        tools: [{ name: "mcp_call", description: "通过 mcp_call 调用此服务器上的工具" }]
      }))
    );
    const skillPrompt = [packed.skillPrompt, formatSourceCardsPrompt(cards), mcpPrompt]
      .filter(Boolean)
      .join("\n\n");
    const system = assembleSystemPrompt({ rules, refs, skillPrompt });
    const messages = toModelMessages(system, turns);

    const result = streamWorkbenchChat({
      apiKey: process.env.XAI_API_KEY!,
      model: body.model || readModel(process.env),
      messages,
      abortSignal: c.req.raw.signal,
      rootPath: project.rootPath,
      images: isRegen ? undefined : body.images,
      mcpServers,
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
