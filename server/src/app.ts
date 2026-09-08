import { Hono } from "hono";
import { cors } from "hono/cors";
import { getMissingKeyError, readModel } from "./lib/env.js";
import { getSettingsMap } from "./lib/appSettings.js";
import { getDb } from "./lib/db/index.js";
import { recordRequestLog } from "./lib/usage.js";
import { agentRoutes } from "./routes/agent.js";
import { chatRoutes } from "./routes/chat.js";
import { fileRoutes } from "./routes/files.js";
import { gitRoutes } from "./routes/git.js";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { mcpRoutes } from "./routes/mcp.js";
import { projectRoutes } from "./routes/projects.js";
import { scheduleRoutes } from "./routes/schedule.js";
import { sessionRoutes } from "./routes/sessions.js";
import { searchRoutes } from "./routes/search.js";
import { skillRoutes } from "./routes/skills.js";
import { terminalRoutes } from "./routes/terminal.js";
import { usageRoutes } from "./routes/usage.js";
import { webRoutes } from "./routes/web.js";

export const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    exposeHeaders: ["x-session-id", "x-source-cards"]
  })
);

app.use("/api/*", async (c, next) => {
  await next();
  try {
    const db = await getDb();
    const settings = await getSettingsMap(db);
    if (settings.requestLog === "1") {
      await recordRequestLog(db, {
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status: c.res.status
      });
    }
  } catch {
    /* logging must not fail the request */
  }
});

app.route("/", projectRoutes);
app.route("/", fileRoutes);
app.route("/", sessionRoutes);
app.route("/", knowledgeRoutes);
app.route("/", skillRoutes);
app.route("/", searchRoutes);
app.route("/", chatRoutes);
app.route("/", gitRoutes);
app.route("/", terminalRoutes);
app.route("/", webRoutes);
app.route("/", usageRoutes);
app.route("/", agentRoutes);
app.route("/", mcpRoutes);
app.route("/", scheduleRoutes);

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/settings", async (c) => {
  const keyError = getMissingKeyError(process.env);
  let settings: Record<string, string> = {};
  try {
    settings = await getSettingsMap(await getDb());
  } catch {
    settings = {};
  }
  return c.json({
    model: readModel(process.env),
    keyConfigured: keyError === null,
    keyError,
    requestLog: settings.requestLog === "1",
    settings
  });
});

