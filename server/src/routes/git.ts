import { Hono } from "hono";
import { z } from "zod";
import { generateText } from "ai";
import { createXai } from "@ai-sdk/xai";
import { boundRoot } from "../lib/bound.js";
import { getMissingKeyError, publicError, readModel } from "../lib/env.js";
import {
  commitMessageDraft,
  loadGitDiff,
  loadGitStatus,
  performCommit
} from "../lib/gitWork.js";

export const gitRoutes = new Hono();

gitRoutes.get("/api/git/status", async (c) => {
  try {
    const projectId = c.req.query("projectId");
    if (!projectId)
      return c.json({ code: "INVALID", error: "缺少 projectId" }, 400);
    const { root } = await boundRoot(projectId);
    const status = await loadGitStatus(root);
    return c.json({ entries: status.entries, text: status.text });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

gitRoutes.get("/api/git/diff", async (c) => {
  try {
    const projectId = c.req.query("projectId");
    if (!projectId)
      return c.json({ code: "INVALID", error: "缺少 projectId" }, 400);
    const { root } = await boundRoot(projectId);
    const diff = await loadGitDiff(root, c.req.query("path") || undefined);
    return c.json({ diff });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

gitRoutes.post("/api/git/commit-message", async (c) => {
  try {
    const body = z
      .object({
        projectId: z.string().min(1),
        paths: z.array(z.string()).optional()
      })
      .parse(await c.req.json());
    const { root } = await boundRoot(body.projectId);
    const status = await loadGitStatus(root);
    const diff = body.paths?.length
      ? (
          await Promise.all(body.paths.map((rel) => loadGitDiff(root, rel)))
        ).join("\n")
      : await loadGitDiff(root);
    const statusText = body.paths?.length
      ? status.entries
          .filter((e) => body.paths!.includes(e.path))
          .map((e) => `${e.index}${e.working_dir} ${e.path}`)
          .join("\n")
      : status.text;
    const draft = commitMessageDraft(statusText, diff);
    if (getMissingKeyError(process.env))
      return c.json({ message: draft, draft });
    try {
      const xai = createXai({ apiKey: process.env.XAI_API_KEY! });
      const result = await generateText({
        model: xai(readModel(process.env)),
        prompt: `根据 git status 和 diff 写一条 Conventional Commits 提交说明，只要正文，第一行不超过 72 字。\n\nstatus:\n${statusText}\n\ndiff:\n${diff.slice(0, 6000)}`
      });
      const message = result.text.trim() || draft;
      return c.json({ message, draft });
    } catch {
      return c.json({ message: draft, draft });
    }
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

gitRoutes.post("/api/git/commit", async (c) => {
  try {
    const body = z
      .object({
        projectId: z.string().min(1),
        message: z.string().min(1),
        paths: z.array(z.string().min(1)).min(1),
        confirm: z.boolean().optional()
      })
      .parse(await c.req.json());
    const { root } = await boundRoot(body.projectId);
    const done = await performCommit(
      root,
      body.message,
      body.confirm,
      body.paths
    );
    return c.json({ ok: true, message: done.message });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
