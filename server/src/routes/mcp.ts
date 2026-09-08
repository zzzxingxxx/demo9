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
  toolsFromListResult,
  callMcpTool,
  mcpConfigFromRow,
  updateMcpServer
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
        enabled: s.enabled,
        env: JSON.parse(s.envJson),
        allowedTools: JSON.parse(s.allowedToolsJson)
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
        args: z.array(z.string()).optional(),
        env: z.record(z.string()).optional()
      })
      .parse(await c.req.json());
    const db = await getDb();
    const server = await createMcpServer(db, {
      ...body,
      args: body.args || []
    });
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
    if (!server.enabled)
      return c.json({ code: "DISABLED", error: "MCP 已停用" }, 400);
    const tools = await listMcpToolsFromProcess(mcpConfigFromRow(server));
    return c.json({ tools, prompt: formatMcpToolsPrompt(tools) });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

mcpRoutes.patch("/api/mcp/:id", async (c) => {
  try {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        command: z.string().min(1).optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string()).optional(),
        enabled: z.boolean().optional(),
        allowedTools: z.array(z.string()).optional()
      })
      .parse(await c.req.json());
    await updateMcpServer(await getDb(), c.req.param("id"), body);
    return c.json({ ok: true });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

mcpRoutes.post("/api/mcp/:id/call", async (c) => {
  try {
    const body = z
      .object({
        name: z.string().min(1),
        arguments: z.record(z.unknown()),
        confirm: z.literal(true)
      })
      .parse(await c.req.json());
    const row = (await listMcpServers(await getDb())).find(
      (s) => s.id === c.req.param("id")
    );
    if (!row || !row.enabled)
      return c.json({ code: "NOT_FOUND", error: "MCP 不存在或已停用" }, 404);
    const output = await callMcpTool(
      mcpConfigFromRow(row),
      body.name,
      body.arguments
    );
    return c.json({ output });
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
