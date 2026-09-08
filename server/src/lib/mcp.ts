import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Ajv } from "ajv";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "./db/index.js";
import { mcpServers, type McpServerRow } from "./db/schema.js";
import { pathError } from "./paths.js";

export type McpTool = {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
};
export type McpConfig = {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  allowedTools?: string[];
  tools?: McpTool[];
  error?: string;
};

export function parseMcpConfig(input: {
  name?: string;
  command?: string;
  args?: unknown;
  env?: Record<string, string>;
  allowedTools?: string[];
}): McpConfig {
  const name = (input.name || "").trim();
  const command = (input.command || "").trim();
  if (!name || !command) throw pathError("INVALID_MCP", "MCP 需要名称和命令");
  return {
    name,
    command,
    args: Array.isArray(input.args) ? input.args.map(String) : [],
    ...(input.env ? { env: input.env } : {}),
    ...(input.allowedTools ? { allowedTools: input.allowedTools } : {})
  };
}

export function toolsFromListResult(payload: unknown): McpTool[] {
  const root = payload as { tools?: unknown; result?: { tools?: unknown } };
  const raw = Array.isArray(root.tools)
    ? root.tools
    : Array.isArray(root.result?.tools)
      ? root.result.tools
      : [];
  return raw
    .filter((t) => t && typeof t.name === "string" && t.name.trim())
    .map((t) => ({
      name: t.name.trim(),
      description: typeof t.description === "string" ? t.description : "",
      ...(t.inputSchema ? { inputSchema: t.inputSchema } : {})
    }));
}

export function formatMcpToolsPrompt(
  tools: McpTool[],
  serverName?: string
): string {
  if (!tools.length) return "";
  return [
    `可用 MCP 工具${serverName ? `（${serverName}）` : ""}：`,
    ...tools.map((t) => `- ${t.name}: ${t.description || "(无说明)"}`)
  ].join("\n");
}

export function mcpJsonLine(
  id: number | null,
  method: string,
  params: unknown
): string {
  return (
    JSON.stringify({
      jsonrpc: "2.0",
      ...(id === null ? {} : { id }),
      method,
      params
    }) + "\n"
  );
}

export function parseMcpToolCallResult(payload: unknown): string {
  const root = payload as {
    result?: unknown;
    error?: { message?: string };
    content?: Array<{ text?: string }>;
  };
  if (root.error?.message) return root.error.message;
  const result = (root.result ?? root) as {
    content?: Array<{ text?: string }>;
  };
  return (
    result.content
      ?.map((c) => c.text || "")
      .filter(Boolean)
      .join("\n") || JSON.stringify(result)
  );
}

export function formatMcpServersPrompt(
  servers: Array<{ name: string; tools?: McpTool[]; error?: string }>
): string {
  return servers
    .map((s) =>
      s.error
        ? `MCP ${s.name}：${s.error}`
        : formatMcpToolsPrompt(s.tools || [], s.name)
    )
    .filter(Boolean)
    .join("\n");
}

export async function listMcpServers(db: Db): Promise<McpServerRow[]> {
  return db.select().from(mcpServers);
}

export function mcpConfigFromRow(row: McpServerRow): McpConfig {
  return {
    name: row.name,
    command: row.command,
    args: JSON.parse(row.argsJson),
    env: JSON.parse(row.envJson),
    allowedTools: JSON.parse(row.allowedToolsJson)
  };
}

export async function createMcpServer(
  db: Db,
  input: McpConfig
): Promise<McpServerRow> {
  const cfg = parseMcpConfig(input);
  const row: McpServerRow = {
    id: randomUUID(),
    name: cfg.name,
    command: cfg.command,
    argsJson: JSON.stringify(cfg.args),
    envJson: JSON.stringify(cfg.env || {}),
    allowedToolsJson: JSON.stringify(cfg.allowedTools || []),
    enabled: true,
    createdAt: Date.now()
  };
  await db.insert(mcpServers).values(row);
  return row;
}

export async function updateMcpServer(
  db: Db,
  id: string,
  patch: Partial<McpConfig> & { enabled?: boolean }
): Promise<void> {
  const row = (await listMcpServers(db)).find((s) => s.id === id);
  if (!row) throw pathError("NOT_FOUND", "MCP 不存在");
  const cfg = parseMcpConfig({ ...mcpConfigFromRow(row), ...patch });
  await db
    .update(mcpServers)
    .set({
      name: cfg.name,
      command: cfg.command,
      argsJson: JSON.stringify(cfg.args),
      envJson: JSON.stringify(cfg.env || {}),
      allowedToolsJson: JSON.stringify(cfg.allowedTools || []),
      enabled: patch.enabled ?? row.enabled
    })
    .where(eq(mcpServers.id, id));
}

export async function deleteMcpServer(db: Db, id: string): Promise<void> {
  await db.delete(mcpServers).where(eq(mcpServers.id, id));
}

async function withMcp<T>(
  config: McpConfig,
  timeoutMs: number,
  run: (client: Client, signal: AbortSignal) => Promise<T>
): Promise<T> {
  const cfg = parseMcpConfig(config);
  const client = new Client({ name: "ai-workbench", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: cfg.command,
    args: cfg.args,
    env: cfg.env,
    stderr: "pipe"
  });
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-2000);
  });
  try {
    return await Promise.race([
      (async () => {
        await client.connect(transport, {
          timeout: timeoutMs,
          signal: controller.signal
        });
        return run(client, controller.signal);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(pathError("MCP_TIMEOUT", "MCP 请求超时"));
        }, timeoutMs);
      })
    ]);
  } catch (err) {
    throw pathError(
      "MCP_FAILED",
      `${err instanceof Error ? err.message : "MCP 连接失败"}${stderr ? `: ${stderr.slice(-500)}` : ""}`
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
  }
}

export async function listMcpToolsFromProcess(
  config: McpConfig,
  timeoutMs = 8000
): Promise<McpTool[]> {
  return withMcp(config, timeoutMs, async (client, signal) => {
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    do {
      const result = await client.listTools(
        { cursor },
        { signal, timeout: timeoutMs }
      );
      tools.push(...toolsFromListResult(result));
      cursor = result.nextCursor;
      if (tools.length > 1000)
        throw pathError("MCP_LIMIT", "MCP 工具数量超出限制");
    } while (cursor);
    return tools;
  });
}

export async function callMcpTool(
  config: McpConfig,
  toolName: string,
  args: Record<string, unknown> = {},
  timeoutMs = 15000
): Promise<string> {
  if (!toolName.trim()) throw pathError("INVALID_MCP", "MCP 工具名不能为空");
  return withMcp(config, timeoutMs, async (client, signal) => {
    const result = await client.listTools({}, { signal, timeout: timeoutMs });
    const target = result.tools.find((t) => t.name === toolName);
    if (!target) throw pathError("NOT_FOUND", "MCP 工具不存在");
    const validate = new Ajv({ strict: false }).compile(target.inputSchema);
    if (!validate(args))
      throw pathError(
        "INVALID",
        `参数不符合工具 schema: ${JSON.stringify(validate.errors)}`
      );
    const output = await client.callTool(
      { name: toolName, arguments: args },
      undefined,
      { signal, timeout: timeoutMs }
    );
    if (output.isError)
      throw pathError("MCP_TOOL_ERROR", parseMcpToolCallResult(output));
    return parseMcpToolCallResult(output);
  });
}

export async function discoverChatMcpServers(db: Db): Promise<McpConfig[]> {
  const configs = (await listMcpServers(db))
    .filter((s) => s.enabled)
    .map(mcpConfigFromRow)
    .filter((s) => s.allowedTools?.length);
  return Promise.all(
    configs.map(async (cfg) => {
      try {
        return {
          ...cfg,
          tools: (await listMcpToolsFromProcess(cfg)).filter((t) =>
            cfg.allowedTools!.includes(t.name)
          )
        };
      } catch {
        return { ...cfg, tools: [], error: "连接失败，请在 MCP 面板检查配置" };
      }
    })
  );
}
