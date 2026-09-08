import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import type { Db } from "./db/index.js";
import { sqlClient } from "./db/index.js";
import { knowledge, knowledgeVectors, type KnowledgeDoc } from "./db/schema.js";
import { pathError } from "./paths.js";
import { assembleSourceCards, searchKnowledgeFts, snippetAround, tokenizeQuery, type SourceCard } from "./fts.js";
import { citationOffsets, embedText, rankByEmbedding } from "./vector.js";

export function sliceText(text: string, maxChars = 1200): string[] {
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

export async function extractDocumentText(filename: string, bytes: Uint8Array): Promise<string> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".txt")) {
    return new TextDecoder().decode(bytes);
  }
  if (lower.endsWith(".pdf")) {
    return extractPdfText(bytes);
  }
  throw pathError("UNSUPPORTED", "仅支持 MD / TXT / PDF");
}

export function attachKnowledgeSlices(docs: KnowledgeDoc[], queryName: string, maxChars = 4000): string {
  const q = queryName.trim().toLowerCase();
  const matched = q
    ? docs.filter((d) => d.title.toLowerCase().includes(q) || d.tags.toLowerCase().includes(q))
    : docs;
  const parts: string[] = [];
  let used = 0;
  for (const doc of matched) {
    const header = `# ${doc.title}`;
    const body = sliceText(doc.text, maxChars)[0] || "";
    const chunk = `${header}\n${body}`;
    if (used + chunk.length > maxChars) break;
    parts.push(chunk);
    used += chunk.length;
  }
  return parts.join("\n\n");
}

export async function listKnowledge(db: Db, projectId: string): Promise<KnowledgeDoc[]> {
  return db.select().from(knowledge).where(eq(knowledge.projectId, projectId));
}

export async function getKnowledge(db: Db, id: string): Promise<KnowledgeDoc | undefined> {
  const rows = await db.select().from(knowledge).where(eq(knowledge.id, id));
  return rows[0];
}

export async function upsertKnowledgeFts(db: Db, doc: KnowledgeDoc): Promise<void> {
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
    const rows = result.rows as unknown as Array<{ id: string; title: string; text: string }>;
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

export async function searchProjectKnowledge(db: Db, projectId: string, query: string): Promise<SourceCard[]> {
  const viaSql = await searchKnowledgeFtsSql(db, projectId, query);
  if (viaSql && viaSql.length > 0) return viaSql;
  const docs = await listKnowledge(db, projectId);
  return searchKnowledgeFts(docs, query);
}

export async function vectorSearchKnowledge(db: Db, projectId: string, query: string, limit = 8) {
  const rows = await db.select().from(knowledgeVectors).where(eq(knowledgeVectors.projectId, projectId));
  const qv = embedText(query);
  const ranked = rankByEmbedding(
    qv,
    rows.map((r) => ({
      id: r.id,
      vector: JSON.parse(r.vectorJson) as number[],
      text: r.text
    }))
  ).slice(0, limit);
  const docs = await listKnowledge(db, projectId);
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
  input: { projectId: string; filename: string; tags: string[]; text: string; storeDir: string; bytes: Uint8Array }
): Promise<KnowledgeDoc> {
  const id = randomUUID();
  const dir = path.join(input.storeDir, input.projectId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${id}-${input.filename}`), input.bytes);
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
  const chunks = sliceText(input.text, 800);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i] ?? "";
    await db.insert(knowledgeVectors).values({
      id: randomUUID(),
      docId: id,
      projectId: input.projectId,
      chunkIndex: i,
      text: chunk,
      vectorJson: JSON.stringify(embedText(`${input.filename}\n${chunk}`))
    });
  }
  return row;
}
