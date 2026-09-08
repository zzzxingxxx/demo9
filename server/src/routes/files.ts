import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../lib/db/index.js";
import { publicError } from "../lib/env.js";
import { applyUnifiedDiff } from "@wb/shared";
import { searchProjectContents } from "../lib/contentSearch.js";
import { extractDocumentText } from "../lib/knowledge.js";
import { parseCsv, previewKind } from "../lib/preview.js";
import { listTree, readProjectFile, readProjectFileBytes, searchTreeByName, writeProjectFile } from "../lib/files.js";
import { getProject } from "../lib/projects.js";

export const fileRoutes = new Hono();

async function boundRoot(projectId: string): Promise<string> {
  const db = await getDb();
  const project = await getProject(db, projectId);
  if (!project) throw Object.assign(new Error("项目不存在"), { code: "NOT_FOUND", error: "项目不存在" });
  if (!project.rootPath) {
    throw Object.assign(new Error("项目未绑定本地目录"), { code: "NO_ROOT", error: "项目未绑定本地目录" });
  }
  return project.rootPath;
}

fileRoutes.get("/api/files", async (c) => {
  try {
    const projectId = c.req.query("projectId");
    if (!projectId) return c.json({ code: "INVALID", error: "缺少 projectId" }, 400);
    const root = await boundRoot(projectId);
    const tree = await listTree(root);
    return c.json({ tree });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

fileRoutes.get("/api/files/content-search", async (c) => {
  try {
    const projectId = c.req.query("projectId");
    const q = c.req.query("q") || "";
    if (!projectId) return c.json({ code: "INVALID", error: "缺少 projectId" }, 400);
    const root = await boundRoot(projectId);
    const hits = await searchProjectContents(root, q);
    return c.json({ hits, query: q });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

fileRoutes.get("/api/files/preview", async (c) => {
  try {
    const projectId = c.req.query("projectId");
    const rel = c.req.query("path");
    if (!projectId || !rel) return c.json({ code: "INVALID", error: "缺少 projectId 或 path" }, 400);
    const root = await boundRoot(projectId);
    const kind = previewKind(rel);
    if (kind === "csv") {
      const content = await readProjectFile(root, rel);
      return c.json({ kind, path: rel, rows: parseCsv(content), content });
    }
    if (kind === "pdf") {
      const { bytes } = await readProjectFileBytes(root, rel);
      const text = await extractDocumentText(rel, new Uint8Array(bytes));
      return c.json({ kind, path: rel, text });
    }
    if (kind === "image") {
      return c.json({
        kind,
        path: rel,
        url: `/api/files/raw?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(rel)}`
      });
    }
    const content = await readProjectFile(root, rel);
    return c.json({ kind, path: rel, content });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

fileRoutes.get("/api/files/raw", async (c) => {
  try {
    const projectId = c.req.query("projectId");
    const rel = c.req.query("path");
    if (!projectId || !rel) return c.json({ code: "INVALID", error: "缺少 projectId 或 path" }, 400);
    const root = await boundRoot(projectId);
    const { bytes, contentType } = await readProjectFileBytes(root, rel);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": contentType } });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

fileRoutes.get("/api/files/search", async (c) => {
  try {
    const projectId = c.req.query("projectId");
    const q = c.req.query("q") || "";
    if (!projectId) return c.json({ code: "INVALID", error: "缺少 projectId" }, 400);
    const root = await boundRoot(projectId);
    const tree = await listTree(root);
    return c.json({ files: searchTreeByName(tree, q) });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

fileRoutes.get("/api/files/content", async (c) => {
  try {
    const projectId = c.req.query("projectId");
    const rel = c.req.query("path");
    if (!projectId || !rel) return c.json({ code: "INVALID", error: "缺少 projectId 或 path" }, 400);
    const root = await boundRoot(projectId);
    const content = await readProjectFile(root, rel);
    return c.json({ path: rel, content });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

fileRoutes.put("/api/files/content", async (c) => {
  try {
    const body = z
      .object({
        projectId: z.string().min(1),
        path: z.string().min(1),
        content: z.string(),
        confirm: z.boolean().optional()
      })
      .parse(await c.req.json());
    const root = await boundRoot(body.projectId);
    await writeProjectFile(root, body.path, body.content, body.confirm);
    return c.json({ ok: true, path: body.path });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

fileRoutes.post("/api/files/apply-diff", async (c) => {
  try {
    const body = z
      .object({
        projectId: z.string().min(1),
        path: z.string().min(1),
        diff: z.string().min(1),
        confirm: z.boolean().optional()
      })
      .parse(await c.req.json());
    const root = await boundRoot(body.projectId);
    const before = await readProjectFile(root, body.path);
    const after = applyUnifiedDiff(before, body.diff);
    await writeProjectFile(root, body.path, after, body.confirm);
    return c.json({ ok: true, path: body.path, content: after });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
