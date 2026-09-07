import { tool } from "ai";
import { z } from "zod";
import { listTree, readProjectFile } from "../files.js";

export async function executeReadFile(rootPath: string, rel: string): Promise<string> {
  return readProjectFile(rootPath, rel);
}

export async function executeListDir(rootPath: string, rel = "."): Promise<string> {
  const tree = await listTree(rootPath, rel);
  return tree
    .map((n) => (n.type === "dir" ? `${n.rel}/` : n.rel))
    .join("\n");
}

export function workbenchTools(rootPath: string) {
  return {
    read_file: tool({
      description: "读取项目内一个文件的文本内容。只读。",
      inputSchema: z.object({ path: z.string().describe("相对项目根的路径") }),
      execute: async ({ path }) => executeReadFile(rootPath, path)
    }),
    list_dir: tool({
      description: "列出项目目录下的文件和子目录。只读。",
      inputSchema: z.object({ path: z.string().optional().describe("相对目录，默认根") }),
      execute: async ({ path }) => executeListDir(rootPath, path || ".")
    })
  };
}
