import fs from "node:fs/promises";
import path from "node:path";
import { applyUnifiedDiff } from "@wb/shared";
import { pathError, resolveInside, toPosix } from "./paths.js";

export const IGNORE_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "data",
  ".next"
]);

export type TreeNode = {
  name: string;
  rel: string;
  type: "file" | "dir";
  children?: TreeNode[];
};

export function shouldIgnore(name: string): boolean {
  return IGNORE_DIR_NAMES.has(name) || name === "." || name === "..";
}

async function assertRealPathInside(
  root: string,
  target: string
): Promise<void> {
  const realRoot = await fs.realpath(root);
  let ancestor = target;
  while (true) {
    try {
      const real = await fs.realpath(ancestor);
      const relative = path.relative(realRoot, real);
      if (relative.startsWith("..") || path.isAbsolute(relative))
        throw pathError("PATH_ESCAPE", "路径超出项目目录");
      return;
    } catch (err) {
      if (
        (err as NodeJS.ErrnoException).code !== "ENOENT" ||
        ancestor === path.dirname(ancestor)
      )
        throw err;
      ancestor = path.dirname(ancestor);
    }
  }
}

export async function listTree(
  root: string,
  rel = ".",
  depth = 0
): Promise<TreeNode[]> {
  if (depth > 8) return [];
  const dir = resolveInside(root, rel);
  await assertRealPathInside(root, dir);
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

export async function readProjectFile(
  root: string,
  rel: string
): Promise<string> {
  const target = resolveInside(root, rel);
  await assertRealPathInside(root, target);
  const stat = await fs.stat(target);
  if (!stat.isFile())
    throw Object.assign(new Error("不是文件"), {
      code: "NOT_FILE",
      error: "不是文件"
    });
  return fs.readFile(target, "utf8");
}

export async function readProjectFileOrEmpty(
  root: string,
  rel: string
): Promise<string> {
  try {
    return await readProjectFile(root, rel);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

export async function applyDiffToProject(
  root: string,
  rel: string,
  diff: string,
  confirm: unknown,
  expectedContent?: string
): Promise<string> {
  const before = await readProjectFileOrEmpty(root, rel);
  const after = applyUnifiedDiff(before, diff);
  await writeProjectFile(root, rel, after, confirm, expectedContent ?? before);
  return after;
}

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  csv: "text/csv"
};

export async function readProjectFileBytes(
  root: string,
  rel: string
): Promise<{ bytes: Buffer; contentType: string }> {
  const target = resolveInside(root, rel);
  await assertRealPathInside(root, target);
  const stat = await fs.stat(target);
  if (!stat.isFile())
    throw Object.assign(new Error("不是文件"), {
      code: "NOT_FILE",
      error: "不是文件"
    });
  const bytes = await fs.readFile(target);
  const ext = (rel.split(".").pop() || "").toLowerCase();
  return {
    bytes,
    contentType: CONTENT_TYPES[ext] || "application/octet-stream"
  };
}

export function requireWriteConfirm(confirm: unknown): void {
  if (confirm !== true) {
    throw Object.assign(new Error("写盘必须用户确认"), {
      code: "CONFIRM_REQUIRED",
      error: "写盘必须用户确认"
    });
  }
}

const fileWrites = new Map<string, Promise<void>>();

export async function writeProjectFile(
  root: string,
  rel: string,
  content: string,
  confirm: unknown,
  expectedContent?: string
): Promise<void> {
  requireWriteConfirm(confirm);
  const target = resolveInside(root, rel);
  const previous = fileWrites.get(target) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await assertRealPathInside(root, target);
      if (
        expectedContent !== undefined &&
        (await readProjectFileOrEmpty(root, rel)) !== expectedContent
      ) {
        throw pathError("CONFLICT", "文件已被修改，请重新打开并合并修改后保存");
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, "utf8");
    });
  fileWrites.set(target, next);
  try {
    await next;
  } finally {
    if (fileWrites.get(target) === next) fileWrites.delete(target);
  }
}

export function searchTreeByName(nodes: TreeNode[], query: string): TreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (node.type === "file" && node.name.toLowerCase().includes(q))
        hits.push(node);
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return hits;
}
