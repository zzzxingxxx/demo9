import { Hono } from "hono";
import { z } from "zod";
import { boundRoot } from "../lib/bound.js";
import { publicError } from "../lib/env.js";
import { packTerminalCite, runCommand } from "../lib/terminal.js";
import {
  getTerminalSession,
  listTerminalSessions,
  startTerminalSession,
  stopTerminalSession,
  terminalSnapshot
} from "../lib/terminalSessions.js";

export const terminalRoutes = new Hono();

terminalRoutes.get("/api/terminal/sessions", (c) =>
  c.json({ sessions: listTerminalSessions(c.req.query("projectId") || "") })
);
terminalRoutes.post("/api/terminal/sessions", async (c) => {
  try {
    const body = z
      .object({
        projectId: z.string().min(1),
        command: z.string().min(1),
        confirm: z.literal(true),
        cols: z.number().int().min(10).max(400).optional(),
        rows: z.number().int().min(2).max(200).optional()
      })
      .parse(await c.req.json());
    const { root } = await boundRoot(body.projectId);
    return c.json(
      {
        session: startTerminalSession(
          body.projectId,
          root,
          body.command,
          body.confirm,
          body.cols,
          body.rows
        )
      },
      201
    );
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
terminalRoutes.get("/api/terminal/sessions/:id", (c) => {
  try {
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .default(0)
      .parse(c.req.query("offset"));
    return c.json({
      session: terminalSnapshot(
        getTerminalSession(c.req.query("projectId") || "", c.req.param("id")),
        offset
      )
    });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
terminalRoutes.post("/api/terminal/sessions/:id/input", async (c) => {
  try {
    const body = z
      .object({
        projectId: z.string().min(1),
        data: z.string().max(20000).optional(),
        cols: z.number().int().min(10).max(400).optional(),
        rows: z.number().int().min(2).max(200).optional()
      })
      .parse(await c.req.json());
    const session = getTerminalSession(body.projectId, c.req.param("id"));
    if (!session.running)
      return c.json({ code: "EXITED", error: "进程已结束" }, 409);
    if (body.data !== undefined) session.process.write(body.data);
    if (body.cols && body.rows) session.process.resize(body.cols, body.rows);
    return c.json({ ok: true });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
terminalRoutes.delete("/api/terminal/sessions/:id", async (c) => {
  try {
    const body = z
      .object({ projectId: z.string().min(1) })
      .parse(await c.req.json());
    stopTerminalSession(body.projectId, c.req.param("id"));
    return c.json({ ok: true });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

terminalRoutes.post("/api/terminal/run", async (c) => {
  try {
    const body = z
      .object({
        projectId: z.string().min(1),
        command: z.string().min(1),
        confirm: z.boolean().optional()
      })
      .parse(await c.req.json());
    const { root } = await boundRoot(body.projectId);
    const result = await runCommand(root, body.command, body.confirm);
    return c.json({
      cwd: result.cwd,
      command: result.command,
      output: result.output,
      cite: packTerminalCite(result)
    });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
