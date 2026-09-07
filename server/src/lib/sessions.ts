import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "./db/index.js";
import { messages, sessions, type Message, type Session } from "./db/schema.js";
import { matchSessionQuery, titleFromPrompt } from "./chat/assemble.js";
import { pathError } from "./paths.js";

export async function listSessions(db: Db, projectId: string, query = ""): Promise<Session[]> {
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.projectId, projectId))
    .orderBy(desc(sessions.pinned), desc(sessions.updatedAt));
  return matchSessionQuery(rows, query);
}

export async function createSession(db: Db, projectId: string, title?: string): Promise<Session> {
  const now = Date.now();
  const row: Session = {
    id: randomUUID(),
    projectId,
    title: (title?.trim() || "新会话").slice(0, 40),
    pinned: false,
    archived: false,
    createdAt: now,
    updatedAt: now
  };
  await db.insert(sessions).values(row);
  return row;
}

export async function getSession(db: Db, id: string): Promise<Session | undefined> {
  const rows = await db.select().from(sessions).where(eq(sessions.id, id));
  return rows[0];
}

export async function updateSession(
  db: Db,
  id: string,
  patch: Partial<Pick<Session, "title" | "pinned" | "archived">>
): Promise<Session> {
  const current = await getSession(db, id);
  if (!current) throw pathError("NOT_FOUND", "会话不存在");
  const next = {
    ...current,
    title: patch.title !== undefined ? patch.title.trim().slice(0, 80) : current.title,
    pinned: patch.pinned ?? current.pinned,
    archived: patch.archived ?? current.archived,
    updatedAt: Date.now()
  };
  if (!next.title) throw pathError("NAME_REQUIRED", "会话名称不能为空");
  await db.update(sessions).set(next).where(eq(sessions.id, id));
  return next;
}

export async function listMessages(db: Db, sessionId: string): Promise<Message[]> {
  return db.select().from(messages).where(eq(messages.sessionId, sessionId));
}

export async function addMessage(
  db: Db,
  sessionId: string,
  role: string,
  content: string
): Promise<Message> {
  const row: Message = {
    id: randomUUID(),
    sessionId,
    role,
    content,
    createdAt: Date.now()
  };
  await db.insert(messages).values(row);
  await db.update(sessions).set({ updatedAt: Date.now() }).where(eq(sessions.id, sessionId));
  return row;
}

export async function truncateFrom(db: Db, sessionId: string, messageId: string): Promise<void> {
  const all = await listMessages(db, sessionId);
  const idx = all.findIndex((m) => m.id === messageId);
  if (idx < 0) return;
  const drop = all.slice(idx);
  for (const msg of drop) {
    await db.delete(messages).where(eq(messages.id, msg.id));
  }
}

export function ensureSessionTitle(session: Session, prompt: string): string {
  if (session.title !== "新会话") return session.title;
  return titleFromPrompt(prompt);
}
