import { Hono } from "hono";
import { listSkills } from "../lib/skills.js";

export const skillRoutes = new Hono();

skillRoutes.get("/api/skills", (c) => c.json({ skills: listSkills() }));
