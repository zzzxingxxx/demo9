import path from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../lib/db/index.js";
import { publicError } from "../lib/env.js";
import { citationOffsets } from "../lib/vector.js";
import {
  addKnowledge,
  extractDocumentText,
  getKnowledge,
  listKnowledge,
  parseTags,
  searchProjectKnowledge,
  vectorSearchKnowledge
} from "../lib/knowledge.js";
import { fetchUrlHtml, ingestUrlPayload } from "../lib/urlIngest.js";

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

knowledgeRoutes.get("/api/knowledge/search", async (c) => {
  try {
    const projectId = c.req.query("projectId");
    const q = c.req.query("q") || "";
    if (!projectId) return c.json({ code: "INVALID", error: "缺少 projectId" }, 400);
    const db = await getDb();
    const cards = await searchProjectKnowledge(db, projectId, q);
    return c.json({ cards, query: q });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

knowledgeRoutes.get("/api/knowledge/vector", async (c) => {
  try {
    const projectId = c.req.query("projectId");
    const q = c.req.query("q") || "";
    if (!projectId) return c.json({ code: "INVALID", error: "缺少 projectId" }, 400);
    const db = await getDb();
    const hits = await vectorSearchKnowledge(db, projectId, q);
    return c.json({ hits, query: q });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

knowledgeRoutes.get("/api/knowledge/:id", async (c) => {
  try {
    const db = await getDb();
    const doc = await getKnowledge(db, c.req.param("id"));
    if (!doc) return c.json({ code: "NOT_FOUND", error: "知识不存在" }, 404);
    const q = c.req.query("q") || "";
    const citation = q ? citationOffsets(doc.text, q) : { start: 0, end: 0, snippet: doc.text.slice(0, 80) };
    return c.json({ knowledge: doc, citation });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

knowledgeRoutes.post("/api/knowledge/url", async (c) => {
  try {
    const body = z
      .object({
        projectId: z.string().min(1),
        url: z.string().min(1),
        tags: z.union([z.string(), z.array(z.string())]).optional()
      })
      .parse(await c.req.json());
    const html = await fetchUrlHtml(body.url);
    const ingested = ingestUrlPayload(body.url, html);
    const safeTitle = (ingested.title || "page").replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
    const filename = safeTitle.endsWith(".md") ? safeTitle : `${safeTitle}.md`;
    const bytes = new TextEncoder().encode(ingested.text);
    const db = await getDb();
    const doc = await addKnowledge(db, {
      projectId: body.projectId,
      filename,
      tags: parseTags(body.tags || []),
      text: ingested.text,
      storeDir: storeDir(),
      bytes
    });
    return c.json(
      {
        knowledge: {
          id: doc.id,
          title: doc.title,
          tags: doc.tags,
          sourceName: ingested.sourceName
        }
      },
      201
    );
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
