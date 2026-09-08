import { Hono } from "hono";
import { z } from "zod";
import { generateText } from "ai";
import { createXai } from "@ai-sdk/xai";
import { applyAgentItem, parseAgentPlan } from "../lib/agent.js";
import { boundRoot } from "../lib/bound.js";
import { getMissingKeyError, publicError, readModel } from "../lib/env.js";
import { readProjectFile, writeProjectFile } from "../lib/files.js";

export const agentRoutes = new Hono();

agentRoutes.post("/api/agent/plan", async (c) => {
  try {
    const body = z
      .object({
        projectId: z.string().min(1),
        markdown: z.string().optional(),
        content: z.string().optional()
      })
      .parse(await c.req.json());
    let markdown = body.markdown?.trim() || "";
    if (!markdown && body.content?.trim()) {
      const keyError = getMissingKeyError(process.env);
      if (keyError) return c.json(keyError, 400);
      const xai = createXai({ apiKey: process.env.XAI_API_KEY! });
      const result = await generateText({
        model: xai(readModel(process.env)),
        prompt: `把用户请求拆成多文件改动计划。每个文件用三级标题写相对路径，下面跟一个完整代码块。\n\n${body.content}`
      });
      markdown = result.text;
    }
    if (!markdown) return c.json({ code: "INVALID", error: "需要 markdown 计划或 content" }, 400);
    const items = parseAgentPlan(markdown);
    return c.json({ markdown, items });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

agentRoutes.post("/api/agent/apply", async (c) => {
  try {
    const body = z
      .object({
        projectId: z.string().min(1),
        path: z.string().min(1),
        after: z.string(),
        confirm: z.boolean().optional()
      })
      .parse(await c.req.json());
    const { root } = await boundRoot(body.projectId);
    let current = "";
    try {
      current = await readProjectFile(root, body.path);
    } catch {
      current = "";
    }
    const applied = applyAgentItem(current, { path: body.path, after: body.after }, body.confirm);
    await writeProjectFile(root, applied.path, applied.content, body.confirm);
    return c.json({ ok: true, path: applied.path, diff: applied.diff, content: applied.content });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
