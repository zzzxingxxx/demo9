import { Hono } from "hono";
import { getDb } from "../lib/db/index.js";
import { publicError } from "../lib/env.js";
import { listTree } from "../lib/files.js";
import { listKnowledge } from "../lib/knowledge.js";
import { listProjects } from "../lib/projects.js";
import { flattenFileNames, matchSearch, type SearchItem } from "../lib/search.js";
import { listSessions } from "../lib/sessions.js";
import { listAllSkills } from "../lib/skills.js";

export const searchRoutes = new Hono();

searchRoutes.get("/api/search", async (c) => {
  try {
    const q = c.req.query("q") || "";
    const projectId = c.req.query("projectId");
    const db = await getDb();
    const items: SearchItem[] = [];
    const projects = await listProjects(db);
    for (const p of projects) items.push({ kind: "project", id: p.id, title: p.name, hint: p.rootPath || "" });
    for (const s of await listAllSkills(db, projectId)) {
      items.push({ kind: "skill", id: s.id, title: s.name, hint: s.prompt });
    }
    if (projectId) {
      const sessions = await listSessions(db, projectId, "");
      for (const s of sessions) items.push({ kind: "session", id: s.id, title: s.title });
      const docs = await listKnowledge(db, projectId);
      for (const d of docs) items.push({ kind: "knowledge", id: d.id, title: d.title, hint: d.tags });
      const project = projects.find((p) => p.id === projectId);
      if (project?.rootPath) {
        try {
          const tree = await listTree(project.rootPath);
          flattenFileNames(tree, items);
        } catch {
          /* bound dir missing */
        }
      }
    }
    return c.json({ items: matchSearch(q, items) });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
