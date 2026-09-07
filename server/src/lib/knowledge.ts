import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import type { Db } from "./db/index.js";
import { knowledge, type KnowledgeDoc } from "./db/schema.js";
import { pathError } from "./paths.js";

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
  return row;
}
