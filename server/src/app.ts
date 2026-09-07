import { Hono } from "hono";
import { cors } from "hono/cors";
import { getMissingKeyError, readModel } from "./lib/env.js";

export const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"]
  })
);

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/settings", (c) => {
  const keyError = getMissingKeyError(process.env);
  return c.json({
    model: readModel(process.env),
    keyConfigured: keyError === null,
    keyError
  });
});

app.post("/api/chat", async (c) => {
  const keyError = getMissingKeyError(process.env);
  if (keyError) return c.json(keyError, 400);
  return c.json({ error: "对话尚未接入", code: "NOT_IMPLEMENTED" }, 501);
});
