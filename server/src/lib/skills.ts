import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "./db/index.js";
import { customSkills } from "./db/schema.js";
import { pathError } from "./paths.js";

export type Skill = {
  id: string;
  name: string;
  prompt: string;
  persona?: string;
  defaultRefs?: string;
  builtin?: boolean;
};

export const SKILLS: Skill[] = [
  {
    id: "ask-doc",
    name: "问文档",
    prompt: "只根据用户引用的知识与文件回答，并标出来源标题。没有依据就说不知道。"
  },
  {
    id: "write-doc",
    name: "写说明",
    prompt: "把材料整理成结构清楚的中文说明，使用标题和列表，避免空话。"
  },
  {
    id: "explain-code",
    name: "解释代码",
    prompt: "解释引用代码在做什么、关键路径和风险，按函数/模块分段。"
  },
  {
    id: "commit-msg",
    name: "起草提交说明",
    prompt: "根据改动起草一条 Conventional Commits 风格的提交说明，第一行不超过 72 字。"
  },
  {
    id: "refactor",
    name: "重构建议",
    prompt: "给出可落地的重构建议，说明为什么、改哪里、风险是什么。不要直接大片重写无关代码。"
  },
  {
    id: "find-bugs",
    name: "找问题",
    prompt: "查找明显缺陷、边界情况和错误处理漏洞，按严重程度列出。"
  },
  {
    id: "meeting-notes",
    name: "会议纪要",
    prompt: "整理成会议纪要：结论、待办（负责人/截止如有）、未决问题。"
  },
  {
    id: "translate",
    name: "翻译",
    prompt: "在中英之间准确翻译，保留标识符与代码，不解释，除非用户要求。"
  }
];

export function listSkills(): Skill[] {
  return SKILLS.map((s) => ({ ...s, builtin: true }));
}

export function skillFromRow(row: {
  id: string;
  name: string;
  persona: string;
  defaultRefs: string;
  prompt: string;
}): Skill {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    persona: row.persona,
    defaultRefs: row.defaultRefs,
    builtin: false
  };
}

export async function listCustomSkills(db: Db, projectId?: string | null): Promise<Skill[]> {
  const rows = await db.select().from(customSkills);
  const filtered = projectId
    ? rows.filter((r) => !r.projectId || r.projectId === projectId)
    : rows;
  return filtered.map(skillFromRow);
}

export async function listAllSkills(db: Db, projectId?: string | null): Promise<Skill[]> {
  const extras = await listCustomSkills(db, projectId);
  return [...listSkills(), ...extras];
}

export async function createCustomSkill(
  db: Db,
  input: { projectId?: string | null; name: string; persona?: string; defaultRefs?: string; prompt: string }
): Promise<Skill> {
  const name = input.name.trim();
  const prompt = input.prompt.trim();
  if (!name || !prompt) throw pathError("INVALID", "技能需要名称和提示词");
  const row = {
    id: randomUUID(),
    projectId: input.projectId ?? null,
    name,
    persona: (input.persona || "").trim(),
    defaultRefs: (input.defaultRefs || "").trim(),
    prompt,
    createdAt: Date.now()
  };
  await db.insert(customSkills).values(row);
  return skillFromRow(row);
}

export async function updateCustomSkill(
  db: Db,
  id: string,
  patch: { name?: string; persona?: string; defaultRefs?: string; prompt?: string }
): Promise<Skill> {
  const rows = await db.select().from(customSkills).where(eq(customSkills.id, id));
  const current = rows[0];
  if (!current) throw pathError("NOT_FOUND", "技能不存在");
  const next = {
    ...current,
    name: patch.name !== undefined ? patch.name.trim() : current.name,
    persona: patch.persona !== undefined ? patch.persona.trim() : current.persona,
    defaultRefs: patch.defaultRefs !== undefined ? patch.defaultRefs.trim() : current.defaultRefs,
    prompt: patch.prompt !== undefined ? patch.prompt.trim() : current.prompt
  };
  if (!next.name || !next.prompt) throw pathError("INVALID", "技能需要名称和提示词");
  await db.update(customSkills).set(next).where(eq(customSkills.id, id));
  return skillFromRow(next);
}

export async function deleteCustomSkill(db: Db, id: string): Promise<void> {
  await db.delete(customSkills).where(eq(customSkills.id, id));
}

export function getSkill(id: string, extra: Skill[] = []): Skill | undefined {
  return [...listSkills(), ...extra].find((s) => s.id === id || s.name === id);
}

export function skillPromptAssembly(skill: Skill, userText: string): { skillPrompt: string; content: string } {
  return customSkillPromptAssembly(skill, userText);
}

export function customSkillPromptAssembly(
  skill: Skill,
  userText: string
): { skillPrompt: string; content: string } {
  const parts = [`当前技能：${skill.name}`];
  if (skill.persona?.trim()) parts.push(`人设：${skill.persona.trim()}`);
  if (skill.defaultRefs?.trim()) parts.push(`默认引用：${skill.defaultRefs.trim()}`);
  parts.push(skill.prompt);
  return {
    skillPrompt: parts.join("\n"),
    content: userText.trim() || `请执行「${skill.name}」。`
  };
}
