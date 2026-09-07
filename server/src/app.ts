import { Hono } from "hono";
import { cors } from "hono/cors";
import { getMissingKeyError, readModel } from "./lib/env.js";
import { chatRoutes } from "./routes/chat.js";
import { fileRoutes } from "./routes/files.js";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { projectRoutes } from "./routes/projects.js";
import { sessionRoutes } from "./routes/sessions.js";

export const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    exposeHeaders: ["x-session-id"]
  })
);

app.route("/", projectRoutes);
app.route("/", fileRoutes);
app.route("/", sessionRoutes);
app.route("/", knowledgeRoutes);
app.route("/", chatRoutes);

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/settings", (c) => {
  const keyError = getMissingKeyError(process.env);
  return c.json({
    model: readModel(process.env),
    keyConfigured: keyError === null,
    keyError
  });
});

