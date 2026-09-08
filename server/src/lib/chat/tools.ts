import { jsonSchema, tool, type ToolSet } from "ai";
import { z } from "zod";
import { listTree, readProjectFile } from "../files.js";
import { callMcpTool, type McpConfig } from "../mcp.js";
import { extractHtmlText, fetchUrlHtml, webSearch } from "../urlIngest.js";

export async function executeReadFile(
  rootPath: string,
  rel: string
): Promise<string> {
  return readProjectFile(rootPath, rel);
}

export async function executeListDir(
  rootPath: string,
  rel = "."
): Promise<string> {
  const tree = await listTree(rootPath, rel);
  return tree.map((n) => (n.type === "dir" ? `${n.rel}/` : n.rel)).join("\n");
}

export function mcpTools(servers: McpConfig[]): ToolSet {
  const out: ToolSet = {};
  servers.forEach((server, i) =>
    server.tools?.forEach((entry, j) => {
      if (!server.allowedTools?.includes(entry.name)) return;
      out[`mcp_${i}_${j}`] = tool({
        description: `${server.name} / ${entry.name}: ${entry.description}`,
        inputSchema: jsonSchema<Record<string, unknown>>(
          entry.inputSchema || { type: "object", properties: {} }
        ),
        execute: async (args) => callMcpTool(server, entry.name, args)
      });
    })
  );
  return out;
}

export function webTools(servers: McpConfig[] = []): ToolSet {
  return {
    web_search: tool({
      description: "搜索网页，返回标题和链接。",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => JSON.stringify(await webSearch(query))
    }),
    fetch_page: tool({
      description: "抓取一个 http(s) 页面的文本。只读。",
      inputSchema: z.object({ url: z.string() }),
      execute: async ({ url }) => {
        const html = await fetchUrlHtml(url);
        const extracted = extractHtmlText(html);
        return `${extracted.title}\n${extracted.text.slice(0, 8000)}`;
      }
    }),
    ...mcpTools(servers)
  };
}

export function workbenchTools(
  rootPath: string,
  servers: McpConfig[] = []
): ToolSet {
  return {
    read_file: tool({
      description: "读取项目内一个文件的文本内容。只读。",
      inputSchema: z.object({ path: z.string().describe("相对项目根的路径") }),
      execute: async ({ path }) => executeReadFile(rootPath, path)
    }),
    list_dir: tool({
      description: "列出项目目录下的文件和子目录。只读。",
      inputSchema: z.object({
        path: z.string().optional().describe("相对目录，默认根")
      }),
      execute: async ({ path }) => executeListDir(rootPath, path || ".")
    }),
    ...webTools(servers)
  };
}
