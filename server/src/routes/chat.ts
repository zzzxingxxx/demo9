import { Hono } from "hono";
import { z } from "zod";
import {
  assembleSystemPrompt,
  toModelMessages,
  type ChatTurn
} from "../lib/chat/assemble.js";
import { parseAtMentions, resolveChatRefs } from "../lib/chat/refs.js";
import { streamWorkbenchChat } from "../lib/chat/stream.js";
import { getDb, type Db } from "../lib/db/index.js";
import { getMissingKeyError, publicError, readModel } from "../lib/env.js";
import { listTree, readProjectFile } from "../lib/files.js";
import { formatSourceCardsPrompt } from "../lib/fts.js";
import {
  attachKnowledgeSlices,
  listKnowledge,
  searchProjectKnowledge
} from "../lib/knowledge.js";
import { getProject } from "../lib/projects.js";
import { loadProjectRules } from "../lib/rules.js";
import {
  commitChatTurn,
  createSession,
  getSession,
  listMessages,
  prepareChatHistory
} from "../lib/sessions.js";
import {
  getSkill,
  listCustomSkills,
  skillPromptAssembly
} from "../lib/skills.js";
import { recordUsage } from "../lib/usage.js";
import { pathError } from "../lib/paths.js";
import { discoverChatMcpServers, formatMcpServersPrompt } from "../lib/mcp.js";

export const chatRoutes = new Hono();
const busySessions = new WeakMap<Db, Set<string>>();

chatRoutes.post("/api/chat", async (c) => {
  const missingKey = getMissingKeyError(process.env);
  if (missingKey) return c.json(missingKey, 400);
  let release = () => {};
  try {
    const body = z
      .object({
        projectId: z.string().min(1),
        sessionId: z.string().nullish(),
        content: z.string().max(100000).optional(),
        model: z.string().optional(),
        skillId: z.string().optional(),
        truncateFromMessageId: z.string().optional(),
        regenerateFromMessageId: z.string().optional(),
        images: z
          .array(
            z.object({
              mimeType: z.enum([
                "image/png",
                "image/jpeg",
                "image/webp",
                "image/gif"
              ]),
              dataBase64: z.string().min(1).max(14000000)
            })
          )
          .max(4)
          .optional()
      })
      .parse(await c.req.json());
    const db = await getDb();
    const project = await getProject(db, body.projectId);
    if (!project)
      return c.json({ code: "NOT_FOUND", error: "项目不存在" }, 404);
    let session = body.sessionId
      ? await getSession(db, body.sessionId)
      : undefined;
    if (body.sessionId && (!session || session.projectId !== project.id))
      return c.json({ code: "NOT_FOUND", error: "会话不属于当前项目" }, 404);
    const keyError = getMissingKeyError(process.env);
    if (keyError) return c.json(keyError, 400);
    const isRegen = Boolean(body.regenerateFromMessageId);
    const userText = (body.content || "").trim();
    if (!isRegen && !userText) throw pathError("INVALID", "内容不能为空");
    if (!session && (isRegen || body.truncateFromMessageId))
      throw pathError("INVALID", "请先选择会话");
    if (!session) session = await createSession(db, project.id);
    const active = busySessions.get(db) || new Set<string>();
    busySessions.set(db, active);
    if (active.has(session.id))
      return c.json(
        { code: "BUSY", error: "此会话正在生成，请等待或停止后重试" },
        409
      );
    active.add(session.id);
    const sessionId = session.id;
    release = () => {
      active.delete(sessionId);
    };
    const history = await listMessages(db, session.id);
    const kept = prepareChatHistory(history, body);
    const extras = await listCustomSkills(db, project.id);
    const skill = body.skillId ? getSkill(body.skillId, extras) : undefined;
    const packed = skill
      ? skillPromptAssembly(skill, userText || " ")
      : { skillPrompt: "", content: userText };
    const queryText = isRegen
      ? [...kept].reverse().find((m) => m.role === "user")?.content || ""
      : packed.content;
    const root = project.rootPath;
    const rules = root ? (await loadProjectRules(root)).content : "";
    const refs = await resolveChatRefs(
      parseAtMentions(`${queryText}\n${skill?.defaultRefs || ""}`),
      {
        readFile: root ? (rel) => readProjectFile(root, rel) : undefined,
        listTree: root ? () => listTree(root) : undefined,
        loadRules: root ? () => loadProjectRules(root) : undefined,
        loadKnowledge: async (name) => {
          const content = attachKnowledgeSlices(
            await listKnowledge(db, project.id),
            name,
            4000,
            queryText
          );
          return content ? { title: name || "知识", content } : null;
        }
      }
    );
    const cards = await searchProjectKnowledge(db, project.id, queryText);
    const mcpServers = await discoverChatMcpServers(db);
    const system = assembleSystemPrompt({
      rules,
      refs,
      skillPrompt: [
        packed.skillPrompt,
        formatSourceCardsPrompt(cards),
        formatMcpServersPrompt(mcpServers)
      ]
        .filter(Boolean)
        .join("\n\n")
    });
    const turns: ChatTurn[] = kept.map((m) => ({
      role: m.role as ChatTurn["role"],
      content: m.content
    }));
    if (!isRegen) turns.push({ role: "user", content: packed.content });
    const controller = new AbortController();
    const signal = AbortSignal.any([
      c.req.raw.signal,
      controller.signal,
      AbortSignal.timeout(180000)
    ]);
    const result = streamWorkbenchChat({
      apiKey: process.env.XAI_API_KEY!,
      model: body.model || readModel(process.env),
      messages: toModelMessages(system, turns),
      rootPath: root,
      images: isRegen ? undefined : body.images,
      mcpServers,
      abortSignal: signal
    });
    const encoder = new TextEncoder();
    const targetSession = session;
    const stream = new ReadableStream<Uint8Array>({
      start(output) {
        void (async () => {
          const send = (event: unknown) => {
            if (!controller.signal.aborted)
              output.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
              );
          };
          let text = "";
          let finished = false;
          try {
            for await (const part of result.fullStream) {
              if (signal.aborted)
                throw pathError("ABORTED", "生成已停止，原会话已保留");
              if (part.type === "text-delta") {
                text += part.text;
                send({ type: "delta", text: part.text });
              }
              if (part.type === "error") throw part.error;
              if (part.type === "abort")
                throw pathError("ABORTED", "生成已停止，原会话已保留");
              if (part.type === "finish") {
                if (part.finishReason === "error")
                  throw pathError("MODEL_ERROR", "模型生成失败");
                finished = true;
              }
            }
            if (!finished || !text.trim() || signal.aborted)
              throw pathError("INCOMPLETE", "生成未完成，原会话已保留");
            await commitChatTurn(
              db,
              targetSession,
              history,
              kept,
              isRegen ? undefined : packed.content,
              text
            );
            send({ type: "done", sessionId });
            const usage = await result.totalUsage;
            await recordUsage(db, {
              projectId: project.id,
              kind: "chat",
              tokensIn: usage?.inputTokens,
              tokensOut: usage?.outputTokens
            }).catch(() => undefined);
          } catch (err) {
            send({ type: "error", ...publicError(err) });
          } finally {
            release();
            if (!controller.signal.aborted) output.close();
          }
        })();
      },
      cancel() {
        controller.abort();
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "x-session-id": session.id,
        "x-source-cards": encodeURIComponent(
          JSON.stringify(
            cards.slice(0, 4).map((card) => ({
              ...card,
              title: card.title.slice(0, 64),
              snippet: card.snippet.slice(0, 96)
            }))
          )
        )
      }
    });
  } catch (err) {
    release();
    return c.json(publicError(err), 400);
  }
});
