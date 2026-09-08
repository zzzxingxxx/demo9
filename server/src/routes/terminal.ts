import { Hono } from "hono";
import { z } from "zod";
import { boundRoot } from "../lib/bound.js";
import { publicError } from "../lib/env.js";
import { packTerminalCite, runCommand } from "../lib/terminal.js";

export const terminalRoutes = new Hono();

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
