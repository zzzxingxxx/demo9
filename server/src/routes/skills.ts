import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../lib/db/index.js";
import { publicError } from "../lib/env.js";
import {
  createCustomSkill,
  deleteCustomSkill,
  listAllSkills,
  updateCustomSkill
} from "../lib/skills.js";

export const skillRoutes = new Hono();

skillRoutes.get("/api/skills", async (c) => {
  try {
    const db = await getDb();
    const skills = await listAllSkills(db, c.req.query("projectId"));
    return c.json({ skills });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

skillRoutes.post("/api/skills", async (c) => {
  try {
    const body = z
      .object({
        projectId: z.string().optional(),
        name: z.string().min(1),
        persona: z.string().optional(),
        defaultRefs: z.string().optional(),
        prompt: z.string().min(1)
      })
      .parse(await c.req.json());
    const db = await getDb();
    const skill = await createCustomSkill(db, body);
    return c.json({ skill }, 201);
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

skillRoutes.patch("/api/skills/:id", async (c) => {
  try {
    const body = z
      .object({
        name: z.string().optional(),
        persona: z.string().optional(),
        defaultRefs: z.string().optional(),
        prompt: z.string().optional()
      })
      .parse(await c.req.json());
    const db = await getDb();
    const skill = await updateCustomSkill(db, c.req.param("id"), body);
    return c.json({ skill });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

skillRoutes.delete("/api/skills/:id", async (c) => {
  try {
    const db = await getDb();
    await deleteCustomSkill(db, c.req.param("id"));
    return c.json({ ok: true });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
