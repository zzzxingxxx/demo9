import path from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../lib/db/index.js";
import { publicError } from "../lib/env.js";
import { addKnowledge, extractDocumentText, listKnowledge, parseTags } from "../lib/knowledge.js";

export const knowledgeRoutes = new Hono();

function storeDir(): string {
  const base = process.env.REPO_ROOT || process.cwd();
  return path.join(base, "data", "knowledge");
}

knowledgeRoutes.get("/api/knowledge", async (c) => {
  try {
    const projectId = c.req.query("projectId");
    if (!projectId) return c.json({ code: "INVALID", error: "缺少 projectId" }, 400);
    const db = await getDb();
    const docs = await listKnowledge(db, projectId);
    return c.json({
      knowledge: docs.map((d) => ({
        id: d.id,
        title: d.title,
        tags: d.tags,
        sourceName: d.sourceName,
        createdAt: d.createdAt
      }))
    });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

knowledgeRoutes.post("/api/knowledge", async (c) => {
  try {
    const body = z
      .object({
        projectId: z.string().min(1),
        filename: z.string().min(1),
        tags: z.union([z.string(), z.array(z.string())]).optional(),
        contentBase64: z.string().min(1)
      })
      .parse(await c.req.json());
    const bytes = Uint8Array.from(Buffer.from(body.contentBase64, "base64"));
    const text = await extractDocumentText(body.filename, bytes);
    const db = await getDb();
    const doc = await addKnowledge(db, {
      projectId: body.projectId,
      filename: body.filename,
      tags: parseTags(body.tags || []),
      text,
      storeDir: storeDir(),
      bytes
    });
    return c.json({ knowledge: { id: doc.id, title: doc.title, tags: doc.tags } }, 201);
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
