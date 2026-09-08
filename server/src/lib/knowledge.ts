import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import type { Db } from "./db/index.js";
import { sqlClient } from "./db/index.js";
import {
  knowledge,
  knowledgeVectors,
  type KnowledgeDoc,
  type KnowledgeVectorRow
} from "./db/schema.js";
import { pathError } from "./paths.js";
import {
  assembleSourceCards,
  searchKnowledgeFts,
  snippetAround,
  tokenizeQuery,
  type SourceCard
} from "./fts.js";
import { citationOffsets, rankByEmbedding } from "./vector.js";
import { embedDocuments, embeddingConfig } from "./embeddings.js";
import { getProject } from "./projects.js";

export function sliceText(text: string, maxChars = 1200): string[] {
  if (!Number.isInteger(maxChars) || maxChars < 1)
    throw pathError("INVALID", "切片长度无效");
  const trimmed = text.replace(/\u0000/g, "").trim();
  if (!trimmed) return [];
  const slices: string[] = [];
  for (let i = 0; i < trimmed.length; i += maxChars) {
    slices.push(trimmed.slice(i, i + maxChars));
  }
  return slices;
}

export function parseTags(input: string | string[]): string[] {
  const raw = Array.isArray(input) ? input.join(",") : input;
  return raw
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const joined = Array.isArray(text) ? text.join("\n") : text;
  if (!joined.trim()) throw pathError("PDF_EMPTY", "PDF 中没有可提取的文本");
  return joined;
}

export async function extractDocumentText(
  filename: string,
  bytes: Uint8Array
): Promise<string> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".txt")) {
    return new TextDecoder().decode(bytes);
  }
  if (lower.endsWith(".pdf")) {
    return extractPdfText(bytes);
  }
  throw pathError("UNSUPPORTED", "仅支持 MD / TXT / PDF");
}

export function attachKnowledgeSlices(
  docs: KnowledgeDoc[],
  queryName: string,
  maxChars = 4000,
  query = ""
): string {
  const q = queryName.trim().toLowerCase();
  const matched = q
    ? docs.filter(
        (d) =>
          d.title.toLowerCase().includes(q) || d.tags.toLowerCase().includes(q)
      )
    : docs;
  const parts: string[] = [];
  let used = 0;
  for (const doc of matched) {
    const header = `# ${doc.title}`;
    const remaining =
      maxChars - used - (parts.length ? 2 : 0) - header.length - 1;
    if (remaining < 1) continue;
    const tokens = tokenizeQuery(query);
    const chunks = sliceText(doc.text, Math.min(1200, remaining))
      .map((text, index) => ({
        text,
        index,
        score: tokens.reduce(
          (sum, token) => sum + (text.toLowerCase().includes(token) ? 1 : 0),
          0
        )
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    const body = chunks
      .map((c) => c.text)
      .join("\n")
      .slice(0, remaining);
    const chunk = `${header}\n${body}`;
    parts.push(chunk);
    used += chunk.length + (parts.length > 1 ? 2 : 0);
  }
  return parts.join("\n\n");
}

export async function listKnowledge(
  db: Db,
  projectId: string
): Promise<KnowledgeDoc[]> {
  return db.select().from(knowledge).where(eq(knowledge.projectId, projectId));
}

export async function getKnowledge(
  db: Db,
  id: string
): Promise<KnowledgeDoc | undefined> {
  const rows = await db.select().from(knowledge).where(eq(knowledge.id, id));
  return rows[0];
}

export async function upsertKnowledgeFts(
  db: Db,
  doc: KnowledgeDoc
): Promise<void> {
  const client = sqlClient(db);
  if (!client) return;
  try {
    await client.execute({
      sql: "DELETE FROM knowledge_fts WHERE doc_id = ?",
      args: [doc.id]
    });
    await client.execute({
      sql: "INSERT INTO knowledge_fts (title, tags, body, project_id, doc_id) VALUES (?, ?, ?, ?, ?)",
      args: [doc.title, doc.tags, doc.text, doc.projectId, doc.id]
    });
  } catch {
    /* FTS5 may be unavailable */
  }
}

export async function searchKnowledgeFtsSql(
  db: Db,
  projectId: string,
  query: string
): Promise<SourceCard[] | null> {
  const client = sqlClient(db);
  if (!client) return null;
  const tokens = tokenizeQuery(query)
    .map((t) => t.replace(/"/g, ""))
    .filter(Boolean);
  if (tokens.length === 0) return [];
  const match = tokens.map((t) => `"${t}"`).join(" AND ");
  try {
    const result = await client.execute({
      sql: "SELECT doc_id AS id, title, body AS text FROM knowledge_fts WHERE knowledge_fts MATCH ? AND project_id = ?",
      args: [match, projectId]
    });
    const rows = result.rows as unknown as Array<{
      id: string;
      title: string;
      text: string;
    }>;
    return assembleSourceCards(
      rows.map((r) => ({
        id: String(r.id),
        title: String(r.title ?? ""),
        tags: "",
        text: String(r.text ?? ""),
        score: 1,
        snippet: snippetAround(String(r.text ?? r.title ?? ""), query)
      }))
    );
  } catch {
    return null;
  }
}

export async function searchProjectKnowledge(
  db: Db,
  projectId: string,
  query: string
): Promise<SourceCard[]> {
  if (embeddingConfig() && query.trim()) {
    const hits = await vectorSearchKnowledge(db, projectId, query);
    const cards = hits
      .filter((h) => h.score > 0.15)
      .map((h) => ({
        id: h.docId,
        title: h.title,
        snippet: h.text,
        score: h.score
      }));
    if (cards.length)
      return [...new Map(cards.map((c) => [c.id, c])).values()].slice(0, 8);
  }
  const viaSql = await searchKnowledgeFtsSql(db, projectId, query);
  if (viaSql && viaSql.length > 0) return viaSql;
  const docs = await listKnowledge(db, projectId);
  return searchKnowledgeFts(docs, query);
}

export async function vectorSearchKnowledge(
  db: Db,
  projectId: string,
  query: string,
  limit = 8
) {
  if (!query.trim()) return [];
  if (!embeddingConfig()) return [];
  const docs = await listKnowledge(db, projectId);
  if (!docs.length) return [];
  const embedded = await embedDocuments([query]);
  for (const doc of docs) await indexKnowledgeVectors(db, doc, embedded.model);
  const rows = await db
    .select()
    .from(knowledgeVectors)
    .where(eq(knowledgeVectors.projectId, projectId));
  const qv = embedded.vectors[0]!;
  const ranked = rankByEmbedding(
    qv,
    rows.map((r) => ({
      id: r.id,
      vector: (JSON.parse(r.vectorJson) as { vector: number[] }).vector,
      text: r.text
    }))
  ).slice(0, limit);
  const byId = new Map(docs.map((d) => [d.id, d]));
  return ranked.map((hit) => {
    const row = rows.find((r) => r.id === hit.id);
    const doc = row ? byId.get(row.docId) : undefined;
    const text = row?.text || "";
    return {
      id: hit.id,
      docId: row?.docId || "",
      title: doc?.title || row?.docId || hit.id,
      score: hit.score,
      text,
      citation: citationOffsets(text, query)
    };
  });
}

export async function addKnowledge(
  db: Db,
  input: {
    projectId: string;
    filename: string;
    tags: string[];
    text: string;
    storeDir: string;
    bytes: Uint8Array;
  }
): Promise<KnowledgeDoc> {
  if (!(await getProject(db, input.projectId)))
    throw pathError("NOT_FOUND", "项目不存在");
  const id = randomUUID();
  const dir = path.join(input.storeDir, input.projectId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${id}-${path.basename(input.filename)}`),
    input.bytes
  );
  const row: KnowledgeDoc = {
    id,
    projectId: input.projectId,
    title: input.filename,
    tags: input.tags.join(","),
    sourceName: input.filename,
    text: input.text,
    createdAt: Date.now()
  };
  await db.insert(knowledge).values(row);
  await upsertKnowledgeFts(db, row);
  return row;
}

export async function indexKnowledgeVectors(
  db: Db,
  doc: KnowledgeDoc,
  model: string
): Promise<void> {
  const existing = await db
    .select()
    .from(knowledgeVectors)
    .where(eq(knowledgeVectors.docId, doc.id));
  if (
    existing.length &&
    existing.every((r) => JSON.parse(r.vectorJson).model === model)
  )
    return;
  const chunks = sliceText(doc.text, 800);
  const records: KnowledgeVectorRow[] = [];
  for (let offset = 0; offset < chunks.length; offset += 32) {
    const batch = chunks.slice(offset, offset + 32);
    const embedded = await embedDocuments(
      batch.map((chunk) => `${doc.title}\n${chunk}`)
    );
    records.push(
      ...batch.map((text, i) => ({
        id: randomUUID(),
        docId: doc.id,
        projectId: doc.projectId,
        chunkIndex: offset + i,
        text,
        vectorJson: JSON.stringify({
          model: embedded.model,
          vector: embedded.vectors[i]
        })
      }))
    );
  }
  await db.transaction(async (tx) => {
    const latest = (
      await tx.select().from(knowledge).where(eq(knowledge.id, doc.id))
    )[0];
    if (!latest || latest.text !== doc.text || latest.title !== doc.title)
      throw pathError("CONFLICT", "知识内容已改变，请重新检索");
    await tx.delete(knowledgeVectors).where(eq(knowledgeVectors.docId, doc.id));
    for (const record of records)
      await tx.insert(knowledgeVectors).values(record);
  });
}

export async function updateKnowledge(
  db: Db,
  id: string,
  patch: { title: string; tags: string; text: string }
): Promise<KnowledgeDoc> {
  const current = await getKnowledge(db, id);
  if (!current) throw pathError("NOT_FOUND", "知识不存在");
  const next = {
    ...current,
    ...patch,
    title: patch.title.trim(),
    tags: parseTags(patch.tags).join(",")
  };
  if (!next.title) throw pathError("INVALID", "标题不能为空");
  await db.transaction(async (tx) => {
    await tx.update(knowledge).set(next).where(eq(knowledge.id, id));
    await tx.delete(knowledgeVectors).where(eq(knowledgeVectors.docId, id));
  });
  await upsertKnowledgeFts(db, next);
  return next;
}

export async function deleteKnowledge(db: Db, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(knowledgeVectors).where(eq(knowledgeVectors.docId, id));
    await tx.delete(knowledge).where(eq(knowledge.id, id));
  });
  await sqlClient(db)?.execute({
    sql: "DELETE FROM knowledge_fts WHERE doc_id = ?",
    args: [id]
  });
}
