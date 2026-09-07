import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "./db/index.js";
import { projects, type Project } from "./db/schema.js";
import { pathError } from "./paths.js";
import { loadProjectRules, type RulesLoad } from "./rules.js";

export type ProjectInput = {
  name: string;
  rootPath?: string | null;
  description?: string;
  archived?: boolean;
};

async function assertDirectory(rootPath: string): Promise<string> {
  const abs = path.resolve(rootPath);
  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    throw pathError("DIR_MISSING", "绑定目录不存在");
  }
  if (!stat.isDirectory()) {
    throw pathError("NOT_DIRECTORY", "绑定路径不是目录");
  }
  return abs;
}

export async function listProjects(db: Db): Promise<Project[]> {
  return db.select().from(projects);
}

export async function getProject(db: Db, id: string): Promise<Project | undefined> {
  const rows = await db.select().from(projects).where(eq(projects.id, id));
  return rows[0];
}

export async function createProject(db: Db, input: ProjectInput): Promise<Project> {
  const name = input.name.trim();
  if (!name) throw pathError("NAME_REQUIRED", "项目名称不能为空");
  const now = Date.now();
  const rootPath = input.rootPath ? await assertDirectory(input.rootPath) : null;
  const row = {
    id: randomUUID(),
    name,
    rootPath,
    description: input.description?.trim() || "",
    archived: false,
    createdAt: now,
    updatedAt: now
  };
  await db.insert(projects).values(row);
  return row;
}

export async function updateProject(db: Db, id: string, input: Partial<ProjectInput>): Promise<Project> {
  const current = await getProject(db, id);
  if (!current) throw pathError("NOT_FOUND", "项目不存在");
  const name = input.name !== undefined ? input.name.trim() : current.name;
  if (!name) throw pathError("NAME_REQUIRED", "项目名称不能为空");
  let rootPath = current.rootPath;
  if (input.rootPath !== undefined) {
    rootPath = input.rootPath ? await assertDirectory(input.rootPath) : null;
  }
  const next = {
    ...current,
    name,
    rootPath,
    description: input.description !== undefined ? input.description.trim() : current.description,
    archived: input.archived ?? current.archived,
    updatedAt: Date.now()
  };
  await db.update(projects).set(next).where(eq(projects.id, id));
  return next;
}

export async function deleteProject(db: Db, id: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, id));
}

export async function loadBoundRules(project: Project): Promise<RulesLoad> {
  if (!project.rootPath) return { file: null, content: "" };
  try {
    return await loadProjectRules(project.rootPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw pathError("DIR_MISSING", "绑定目录不存在");
    throw err;
  }
}
