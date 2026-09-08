import { Hono } from "hono";
import { z } from "zod";
import { generateText, stepCountIs } from "ai";
import { createXai } from "@ai-sdk/xai";
import { commitAgentItem, parseAgentPlan } from "../lib/agent.js";
import { boundRoot } from "../lib/bound.js";
import { getMissingKeyError, publicError, readModel } from "../lib/env.js";
import { listTree, readProjectFileOrEmpty } from "../lib/files.js";
import { workbenchTools } from "../lib/chat/tools.js";
import { loadProjectRules } from "../lib/rules.js";
import { resolveInside, pathError } from "../lib/paths.js";

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
    const { root } = await boundRoot(body.projectId);
    if (!markdown && body.content?.trim()) {
      const keyError = getMissingKeyError(process.env);
      if (keyError) return c.json(keyError, 400);
      const xai = createXai({ apiKey: process.env.XAI_API_KEY! });
      const result = await generateText({
        model: xai(readModel(process.env)),
        tools: workbenchTools(root),
        stopWhen: stepCountIs(8),
        abortSignal: AbortSignal.any([
          c.req.raw.signal,
          AbortSignal.timeout(180000)
        ]),
        system: `你是项目开发助手。先读取相关文件理解现有实现，再规划最小必要变更。每个修改文件用三级标题写项目相对路径，下面跟完整文件内容代码块。不要输出省略号占位或删除文件。最后列出验证建议。\n项目规则：\n${(await loadProjectRules(root)).content.slice(0, 8000)}\n目录：\n${JSON.stringify(await listTree(root)).slice(0, 18000)}`,
        prompt: body.content
      });
      markdown = result.text;
    }
    if (!markdown)
      return c.json(
        { code: "INVALID", error: "需要 markdown 计划或 content" },
        400
      );
    const items = parseAgentPlan(markdown);
    if (!items.length)
      throw pathError("INVALID_PLAN", "未得到文件修改计划，请补充请求后重试");
    const seen = new Set<string>();
    const previews = [];
    for (const item of items) {
      resolveInside(root, item.path);
      if (seen.has(item.path))
        throw pathError("INVALID_PLAN", "计划中存在重复文件");
      seen.add(item.path);
      previews.push({
        ...item,
        before: await readProjectFileOrEmpty(root, item.path)
      });
    }
    return c.json({
      projectId: body.projectId,
      rootPath: root,
      markdown,
      items: previews
    });
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
        expectedContent: z.string().optional(),
        expectedRootPath: z.string().optional(),
        confirm: z.boolean().optional()
      })
      .parse(await c.req.json());
    const { root } = await boundRoot(body.projectId);
    if (body.expectedRootPath !== undefined && body.expectedRootPath !== root)
      throw pathError("CONFLICT", "项目绑定目录已改变，请重新生成计划");
    const current = await readProjectFileOrEmpty(root, body.path);
    if (body.expectedContent !== undefined && current !== body.expectedContent)
      throw pathError("CONFLICT", "文件已变化，请重新生成预览");
    const applied = await commitAgentItem(
      root,
      current,
      { path: body.path, after: body.after },
      body.confirm
    );
    return c.json({
      ok: true,
      written: applied.written,
      path: applied.path,
      before: applied.before,
      after: applied.after,
      content: applied.content,
      diff: applied.diff
    });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
