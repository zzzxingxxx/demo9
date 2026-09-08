import { spawn } from "node:child_process";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "./db/index.js";
import { mcpServers, type McpServerRow } from "./db/schema.js";
import { pathError } from "./paths.js";

export type McpConfig = {
  name: string;
  command: string;
  args: string[];
};

export function parseMcpConfig(input: { name?: string; command?: string; args?: unknown }): McpConfig {
  const name = (input.name || "").trim();
  const command = (input.command || "").trim();
  if (!name || !command) {
    throw Object.assign(new Error("MCP 需要名称和命令"), { code: "INVALID_MCP", error: "MCP 需要名称和命令" });
  }
  const args = Array.isArray(input.args) ? input.args.map((a) => String(a)) : [];
  return { name, command, args };
}

export type McpTool = { name: string; description: string };

export function toolsFromListResult(payload: unknown): McpTool[] {
  const root = payload as { tools?: unknown; result?: { tools?: unknown } };
  const raw = Array.isArray(root.tools) ? root.tools : Array.isArray(root.result?.tools) ? root.result.tools : [];
  const tools: McpTool[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { name?: unknown; description?: unknown };
    if (typeof rec.name !== "string" || !rec.name.trim()) continue;
    tools.push({
      name: rec.name.trim(),
      description: typeof rec.description === "string" ? rec.description : ""
    });
  }
  return tools;
}

export function formatMcpToolsPrompt(tools: McpTool[], serverName?: string): string {
  if (tools.length === 0) return "";
  const head = serverName ? `可用 MCP 工具（${serverName}）：` : "可用 MCP 工具：";
  return [head, ...tools.map((t) => `- ${t.name}: ${t.description || "(无说明)"}`)].join("\n");
}

export function mcpJsonLine(id: number | null, method: string, params: unknown): string {
  const body =
    id === null
      ? { jsonrpc: "2.0", method, params }
      : { jsonrpc: "2.0", id, method, params };
  return `${JSON.stringify(body)}\n`;
}

export function parseMcpToolCallResult(payload: unknown): string {
  const root = payload as {
    result?: { content?: Array<{ type?: string; text?: string }> };
    error?: { message?: string };
  };
  if (root.error?.message) return root.error.message;
  const content = root.result?.content;
  if (Array.isArray(content)) {
    const text = content.map((c) => (typeof c.text === "string" ? c.text : "")).filter(Boolean).join("\n");
    if (text) return text;
  }
  if (root.result !== undefined) return JSON.stringify(root.result);
  return JSON.stringify(payload);
}

export function formatMcpServersPrompt(
  servers: Array<{ name: string; tools: McpTool[]; error?: string }>
): string {
  if (servers.length === 0) return "";
  return servers
    .map((s) => {
      if (s.error) return `MCP ${s.name}：${s.error}`;
      return formatMcpToolsPrompt(s.tools, s.name) || `MCP ${s.name}：可用，通过 mcp_call 调用`;
    })
    .join("\n");
}

export async function listMcpServers(db: Db): Promise<McpServerRow[]> {
  return db.select().from(mcpServers);
}

export async function createMcpServer(db: Db, input: McpConfig): Promise<McpServerRow> {
  const cfg = parseMcpConfig(input);
  const row: McpServerRow = {
    id: randomUUID(),
    name: cfg.name,
    command: cfg.command,
    argsJson: JSON.stringify(cfg.args),
    enabled: true,
    createdAt: Date.now()
  };
  await db.insert(mcpServers).values(row);
  return row;
}

export async function deleteMcpServer(db: Db, id: string): Promise<void> {
  await db.delete(mcpServers).where(eq(mcpServers.id, id));
}

export async function listMcpToolsFromProcess(config: McpConfig, timeoutMs = 5000): Promise<McpTool[]> {
  const cfg = parseMcpConfig(config);
  return new Promise((resolve, reject) => {
    const child = spawn(cfg.command, cfg.args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let buf = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(pathError("MCP_TIMEOUT", "MCP 列出工具超时"));
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as { id?: number; result?: unknown };
          if (parsed.id === 1) {
            child.stdin?.write(mcpJsonLine(null, "notifications/initialized", {}));
            child.stdin?.write(mcpJsonLine(2, "tools/list", {}));
          } else if (parsed.id === 2) {
            clearTimeout(timer);
            child.kill();
            resolve(toolsFromListResult(parsed));
          }
        } catch {
          /* wait for more */
        }
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(pathError("MCP_FAILED", err.message));
    });
    child.on("close", () => {
      clearTimeout(timer);
    });
    child.stdin?.write(
      mcpJsonLine(1, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "ai-workbench", version: "0.0.1" }
      })
    );
  });
}

export async function callMcpTool(
  config: McpConfig,
  toolName: string,
  args: Record<string, unknown> = {},
  timeoutMs = 8000
): Promise<string> {
  const cfg = parseMcpConfig(config);
  const name = toolName.trim();
  if (!name) throw pathError("INVALID_MCP", "MCP 工具名不能为空");
  return new Promise((resolve, reject) => {
    const child = spawn(cfg.command, cfg.args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let buf = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(pathError("MCP_TIMEOUT", "MCP 调用超时"));
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as { id?: number; result?: unknown; error?: { message?: string } };
          if (parsed.id === 1) {
            child.stdin?.write(mcpJsonLine(null, "notifications/initialized", {}));
            child.stdin?.write(
              mcpJsonLine(2, "tools/call", { name, arguments: args })
            );
          } else if (parsed.id === 2) {
            clearTimeout(timer);
            child.kill();
            resolve(parseMcpToolCallResult(parsed));
          }
        } catch {
          /* wait for more */
        }
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(pathError("MCP_FAILED", err.message));
    });
    child.on("close", () => {
      clearTimeout(timer);
    });
    child.stdin?.write(
      mcpJsonLine(1, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "ai-workbench", version: "0.0.1" }
      })
    );
  });
}
