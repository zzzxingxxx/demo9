import type { Db } from "./db/index.js";
import { getSettingsMap, setSetting } from "./appSettings.js";
import { publicSettings } from "./providerSettings.js";
import { addKnowledge, listKnowledge } from "./knowledge.js";
import { createProject, getProject } from "./projects.js";
import {
  addMessage,
  createSession,
  listMessages,
  listSessions,
  starMessage,
  updateSession
} from "./sessions.js";

export type ProjectBundle = {
  version: 1;
  project: { name: string; description: string };
  sessions: Array<{
    title: string;
    pinned: boolean;
    archived: boolean;
    messages: Array<{ role: string; content: string; starred?: boolean }>;
  }>;
  knowledgeList: Array<{
    title: string;
    tags: string;
    sourceName: string;
    text: string;
  }>;
  settings: Record<string, string>;
};

export function serializeProjectBundle(bundle: ProjectBundle): string {
  return JSON.stringify(bundle);
}

export async function buildProjectBundle(
  db: Db,
  projectId: string
): Promise<ProjectBundle> {
  const project = await getProject(db, projectId);
  if (!project) {
    throw Object.assign(new Error("项目不存在"), {
      code: "NOT_FOUND",
      error: "项目不存在"
    });
  }
  const sessions = await listSessions(db, projectId, "");
  const knowledgeList = await listKnowledge(db, projectId);
  const settings = publicSettings(await getSettingsMap(db));
  return {
    version: 1,
    project: { name: project.name, description: project.description },
    sessions: await Promise.all(
      sessions.map(async (s) => {
        const messages = await listMessages(db, s.id);
        return {
          title: s.title,
          pinned: s.pinned,
          archived: s.archived,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            starred: m.starred
          }))
        };
      })
    ),
    knowledgeList: knowledgeList.map((k) => ({
      title: k.title,
      tags: k.tags,
      sourceName: k.sourceName,
      text: k.text
    })),
    settings
  };
}

export async function applyProjectBundle(
  db: Db,
  bundle: ProjectBundle,
  storeDir: string
): Promise<{ projectId: string }> {
  const project = await createProject(db, {
    name: bundle.project.name || "导入项目",
    description: bundle.project.description
  });
  for (const k of bundle.knowledgeList) {
    const bytes = new TextEncoder().encode(k.text);
    await addKnowledge(db, {
      projectId: project.id,
      filename: k.title || "imported.md",
      tags: k.tags
        ? k.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      text: k.text,
      storeDir,
      bytes
    });
  }
  for (const s of bundle.sessions) {
    const session = await createSession(db, project.id, s.title);
    if (s.pinned || s.archived) {
      await updateSession(db, session.id, {
        pinned: s.pinned,
        archived: s.archived
      });
    }
    for (const m of s.messages) {
      const msg = await addMessage(db, session.id, m.role, m.content);
      if (m.starred) {
        await starMessage(db, msg.id, true);
      }
    }
  }
  for (const [key, value] of Object.entries(publicSettings(bundle.settings))) {
    await setSetting(db, key, value);
  }
  return { projectId: project.id };
}

export function parseProjectBundle(raw: string): ProjectBundle {
  const parsed = JSON.parse(raw) as Partial<ProjectBundle>;
  if (
    parsed.version !== 1 ||
    !parsed.project ||
    !Array.isArray(parsed.sessions) ||
    !Array.isArray(parsed.knowledgeList)
  ) {
    throw Object.assign(new Error("无效的项目导出"), {
      code: "INVALID_BUNDLE",
      error: "无效的项目导出"
    });
  }
  return {
    version: 1,
    project: {
      name: String(parsed.project.name || ""),
      description: String(parsed.project.description || "")
    },
    sessions: parsed.sessions.map((s) => ({
      title: String(s.title || "新会话"),
      pinned: Boolean(s.pinned),
      archived: Boolean(s.archived),
      messages: Array.isArray(s.messages)
        ? s.messages.map((m) => ({
            role: String(m.role || "user"),
            content: String(m.content || ""),
            starred: Boolean(m.starred)
          }))
        : []
    })),
    knowledgeList: parsed.knowledgeList.map((k) => ({
      title: String(k.title || ""),
      tags: String(k.tags || ""),
      sourceName: String(k.sourceName || k.title || ""),
      text: String(k.text || "")
    })),
    settings:
      parsed.settings && typeof parsed.settings === "object"
        ? { ...parsed.settings }
        : {}
  };
}
