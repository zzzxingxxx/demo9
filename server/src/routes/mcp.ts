import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../lib/db/index.js";
import { publicError } from "../lib/env.js";
import {
  createMcpServer,
  deleteMcpServer,
  formatMcpToolsPrompt,
  listMcpServers,
  listMcpToolsFromProcess,
  toolsFromListResult
} from "../lib/mcp.js";

export const mcpRoutes = new Hono();

mcpRoutes.get("/api/mcp", async (c) => {
  try {
    const db = await getDb();
    const servers = await listMcpServers(db);
    return c.json({
      servers: servers.map((s) => ({
        id: s.id,
        name: s.name,
        command: s.command,
        args: JSON.parse(s.argsJson) as string[],
        enabled: s.enabled
      }))
    });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

mcpRoutes.post("/api/mcp", async (c) => {
  try {
    const body = z
      .object({
        name: z.string().min(1),
        command: z.string().min(1),
        args: z.array(z.string()).optional()
      })
      .parse(await c.req.json());
    const db = await getDb();
    const server = await createMcpServer(db, { name: body.name, command: body.command, args: body.args || [] });
    return c.json({ server }, 201);
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

mcpRoutes.delete("/api/mcp/:id", async (c) => {
  try {
    const db = await getDb();
    await deleteMcpServer(db, c.req.param("id"));
    return c.json({ ok: true });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

mcpRoutes.post("/api/mcp/:id/tools", async (c) => {
  try {
    const db = await getDb();
    const servers = await listMcpServers(db);
    const server = servers.find((s) => s.id === c.req.param("id"));
    if (!server) return c.json({ code: "NOT_FOUND", error: "MCP 不存在" }, 404);
    const tools = await listMcpToolsFromProcess({
      name: server.name,
      command: server.command,
      args: JSON.parse(server.argsJson) as string[]
    });
    return c.json({ tools, prompt: formatMcpToolsPrompt(tools) });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

mcpRoutes.post("/api/mcp/from-list", async (c) => {
  try {
    const body = await c.req.json();
    const tools = toolsFromListResult(body);
    return c.json({ tools, prompt: formatMcpToolsPrompt(tools) });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
