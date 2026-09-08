import { asc, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "./db/index.js";
import { messages, sessions, type Message, type Session } from "./db/schema.js";
import { matchSessionQuery, titleFromPrompt } from "./chat/assemble.js";
import { pathError } from "./paths.js";
import { getProject } from "./projects.js";

export async function listSessions(
  db: Db,
  projectId: string,
  query = ""
): Promise<Session[]> {
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.projectId, projectId))
    .orderBy(desc(sessions.pinned), desc(sessions.updatedAt));
  return matchSessionQuery(rows, query);
}

export async function createSession(
  db: Db,
  projectId: string,
  title?: string
): Promise<Session> {
  if (!(await getProject(db, projectId)))
    throw pathError("NOT_FOUND", "项目不存在");
  const now = Date.now();
  const row: Session = {
    id: randomUUID(),
    projectId,
    title: (title?.trim() || "新会话").slice(0, 40),
    pinned: false,
    archived: false,
    parentId: null,
    branchFrom: null,
    createdAt: now,
    updatedAt: now
  };
  await db.insert(sessions).values(row);
  return row;
}

export async function getSession(
  db: Db,
  id: string
): Promise<Session | undefined> {
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
    title:
      patch.title !== undefined
        ? patch.title.trim().slice(0, 80)
        : current.title,
    pinned: patch.pinned ?? current.pinned,
    archived: patch.archived ?? current.archived,
    updatedAt: Date.now()
  };
  if (!next.title) throw pathError("NAME_REQUIRED", "会话名称不能为空");
  await db.update(sessions).set(next).where(eq(sessions.id, id));
  return next;
}

export async function listMessages(
  db: Db,
  sessionId: string
): Promise<Message[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt), sql`rowid`);
}

export function prepareChatHistory(
  history: Message[],
  input: { truncateFromMessageId?: string; regenerateFromMessageId?: string }
): Message[] {
  if (input.truncateFromMessageId && input.regenerateFromMessageId)
    throw pathError("INVALID", "不能同时编辑和重新生成");
  const id = input.truncateFromMessageId || input.regenerateFromMessageId;
  if (!id) return history;
  const index = history.findIndex((m) => m.id === id);
  const role = input.regenerateFromMessageId ? "assistant" : "user";
  if (index < 0 || history[index]?.role !== role)
    throw pathError("INVALID", "消息不属于当前会话或类型不匹配");
  return history.slice(0, index);
}

export async function commitChatTurn(
  db: Db,
  session: Session,
  expected: Message[],
  keep: Message[],
  userContent: string | undefined,
  answer: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const currentSession = (
      await tx.select().from(sessions).where(eq(sessions.id, session.id))
    )[0];
    const current = await tx
      .select()
      .from(messages)
      .where(eq(messages.sessionId, session.id))
      .orderBy(asc(messages.createdAt), sql`rowid`);
    if (
      !currentSession ||
      JSON.stringify(current.map((m) => m.id)) !==
        JSON.stringify(expected.map((m) => m.id))
    ) {
      throw pathError("CONFLICT", "会话已发生变化，请重新发送");
    }
    for (const m of expected.slice(keep.length))
      await tx.delete(messages).where(eq(messages.id, m.id));
    const now = Math.max(Date.now(), (keep.at(-1)?.createdAt || 0) + 1);
    if (userContent !== undefined)
      await tx
        .insert(messages)
        .values({
          id: randomUUID(),
          sessionId: session.id,
          role: "user",
          content: userContent,
          starred: false,
          createdAt: now
        });
    await tx
      .insert(messages)
      .values({
        id: randomUUID(),
        sessionId: session.id,
        role: "assistant",
        content: answer,
        starred: false,
        createdAt: now + 1
      });
    await tx
      .update(sessions)
      .set({
        title: ensureSessionTitle(
          currentSession,
          userContent || keep.at(-1)?.content || ""
        ),
        updatedAt: now + 1
      })
      .where(eq(sessions.id, session.id));
  });
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
    starred: false,
    createdAt: Date.now()
  };
  await db.insert(messages).values(row);
  await db
    .update(sessions)
    .set({ updatedAt: Date.now() })
    .where(eq(sessions.id, sessionId));
  return row;
}

export async function truncateFrom(
  db: Db,
  sessionId: string,
  messageId: string
): Promise<void> {
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

export async function starMessage(
  db: Db,
  messageId: string,
  starred: boolean
): Promise<Message> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId));
  const current = rows[0];
  if (!current) throw pathError("NOT_FOUND", "消息不存在");
  const next = { ...current, starred };
  await db.update(messages).set({ starred }).where(eq(messages.id, messageId));
  return next;
}

export async function branchSession(
  db: Db,
  sessionId: string,
  messageId: string
): Promise<Session> {
  const source = await getSession(db, sessionId);
  if (!source) throw pathError("NOT_FOUND", "会话不存在");
  const all = await listMessages(db, sessionId);
  const idx = all.findIndex((m) => m.id === messageId);
  if (idx < 0) throw pathError("NOT_FOUND", "消息不存在");
  const keep = all.slice(0, idx + 1);
  const now = Date.now();
  const row: Session = {
    id: randomUUID(),
    projectId: source.projectId,
    title: `${source.title} · 分支`,
    pinned: false,
    archived: false,
    parentId: source.id,
    branchFrom: messageId,
    createdAt: now,
    updatedAt: now
  };
  await db.insert(sessions).values(row);
  for (const msg of keep) {
    await db.insert(messages).values({
      id: randomUUID(),
      sessionId: row.id,
      role: msg.role,
      content: msg.content,
      starred: msg.starred,
      createdAt: msg.createdAt
    });
  }
  return row;
}
