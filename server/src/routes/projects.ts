import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../lib/db/index.js";
import { publicError } from "../lib/env.js";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  loadBoundRules,
  updateProject
} from "../lib/projects.js";

const inputSchema = z.object({
  name: z.string().min(1).optional(),
  rootPath: z.string().nullable().optional(),
  description: z.string().optional(),
  archived: z.boolean().optional()
});

export const projectRoutes = new Hono();

projectRoutes.get("/api/projects", async (c) => {
  const db = await getDb();
  return c.json({ projects: await listProjects(db) });
});

projectRoutes.post("/api/projects", async (c) => {
  try {
    const body = inputSchema.parse(await c.req.json());
    const name = body.name;
    if (!name) {
      return c.json({ code: "NAME_REQUIRED", error: "项目名称不能为空" }, 400);
    }
    const db = await getDb();
    const project = await createProject(db, { ...body, name });
    return c.json({ project }, 201);
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

projectRoutes.get("/api/projects/:id", async (c) => {
  const db = await getDb();
  const project = await getProject(db, c.req.param("id"));
  if (!project) return c.json({ code: "NOT_FOUND", error: "项目不存在" }, 404);
  return c.json({ project });
});

projectRoutes.patch("/api/projects/:id", async (c) => {
  try {
    const body = inputSchema.parse(await c.req.json());
    const db = await getDb();
    const project = await updateProject(db, c.req.param("id"), body);
    return c.json({ project });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

projectRoutes.delete("/api/projects/:id", async (c) => {
  const db = await getDb();
  await deleteProject(db, c.req.param("id"));
  return c.json({ ok: true });
});

projectRoutes.get("/api/projects/:id/rules", async (c) => {
  try {
    const db = await getDb();
    const project = await getProject(db, c.req.param("id"));
    if (!project) return c.json({ code: "NOT_FOUND", error: "项目不存在" }, 404);
    const rules = await loadBoundRules(project);
    return c.json({ projectId: project.id, rootPath: project.rootPath, ...rules });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
