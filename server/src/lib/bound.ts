import { getDb } from "./db/index.js";
import { getProject, type Project } from "./projects.js";

export async function requireProject(projectId: string): Promise<Project> {
  const db = await getDb();
  const project = await getProject(db, projectId);
  if (!project) throw Object.assign(new Error("项目不存在"), { code: "NOT_FOUND", error: "项目不存在" });
  return project;
}

export async function boundRoot(projectId: string): Promise<{ project: Project; root: string }> {
  const project = await requireProject(projectId);
  if (!project.rootPath) {
    throw Object.assign(new Error("项目未绑定本地目录"), { code: "NO_ROOT", error: "项目未绑定本地目录" });
  }
  return { project, root: project.rootPath };
}
