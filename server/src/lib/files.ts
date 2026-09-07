import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside, toPosix } from "./paths.js";

export const IGNORE_DIR_NAMES = new Set(["node_modules", ".git", "dist", "data", ".next"]);

export type TreeNode = {
  name: string;
  rel: string;
  type: "file" | "dir";
  children?: TreeNode[];
};

export function shouldIgnore(name: string): boolean {
  return IGNORE_DIR_NAMES.has(name) || name === "." || name === "..";
}

export async function listTree(root: string, rel = ".", depth = 0): Promise<TreeNode[]> {
  if (depth > 8) return [];
  const dir = resolveInside(root, rel);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nodes: TreeNode[] = [];
  const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of sorted) {
    if (shouldIgnore(entry.name)) continue;
    const childRel = toPosix(path.join(rel === "." ? "" : rel, entry.name));
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        rel: childRel,
        type: "dir",
        children: await listTree(root, childRel, depth + 1)
      });
    } else if (entry.isFile()) {
      nodes.push({ name: entry.name, rel: childRel, type: "file" });
    }
  }
  return nodes;
}

export async function readProjectFile(root: string, rel: string): Promise<string> {
  const target = resolveInside(root, rel);
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw Object.assign(new Error("不是文件"), { code: "NOT_FILE", error: "不是文件" });
  return fs.readFile(target, "utf8");
}

export function requireWriteConfirm(confirm: unknown): void {
  if (confirm !== true) {
    throw Object.assign(new Error("写盘必须用户确认"), {
      code: "CONFIRM_REQUIRED",
      error: "写盘必须用户确认"
    });
  }
}

export async function writeProjectFile(
  root: string,
  rel: string,
  content: string,
  confirm: unknown
): Promise<void> {
  requireWriteConfirm(confirm);
  const target = resolveInside(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

export function searchTreeByName(nodes: TreeNode[], query: string): TreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (node.type === "file" && node.name.toLowerCase().includes(q)) hits.push(node);
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return hits;
}
