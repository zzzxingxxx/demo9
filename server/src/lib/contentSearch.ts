import fs from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";
import { resolveInside, toPosix } from "./paths.js";

export function parseGitignore(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

function escapeRe(s: string): string {
  return s.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function gitignoreToRegExp(pattern: string): RegExp {
  let p = pattern.replaceAll("\\", "/");
  const neg = p.startsWith("!");
  if (neg) p = p.slice(1);
  const dirOnly = p.endsWith("/");
  if (dirOnly) p = p.slice(0, -1);
  const anchored = p.startsWith("/");
  if (anchored) p = p.slice(1);
  let re = "^";
  if (!anchored && !p.includes("/")) re += "(?:.*/)?";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*" && p[i + 1] === "*") {
      re += ".*";
      i += 1;
      if (p[i + 1] === "/") i += 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += escapeRe(c ?? "");
  }
  re += dirOnly ? "(?:/.*)?$" : "$";
  return new RegExp(re);
}

export function pathIgnored(rel: string, patterns: string[]): boolean {
  const posix = rel.replaceAll("\\", "/").replace(/^\.\//, "");
  let ignored = false;
  for (const raw of patterns) {
    const neg = raw.startsWith("!");
    const re = gitignoreToRegExp(raw);
    if (re.test(posix) || re.test(posix.replace(/\/$/, ""))) {
      ignored = !neg;
    }
  }
  return ignored;
}

export type ContentHit = { rel: string; line: number; text: string };

export function searchContents(
  files: Array<{ rel: string; content: string }>,
  query: string,
  ignorePatterns: string[]
): ContentHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: ContentHit[] = [];
  for (const file of files) {
    if (pathIgnored(file.rel, ignorePatterns)) continue;
    const lines = file.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (line.toLowerCase().includes(q)) {
        hits.push({ rel: file.rel, line: i + 1, text: line.trim() });
      }
    }
  }
  return hits;
}

const MAX_SEARCH_BYTES = 512_000;
const SKIP_DIR_NAMES = new Set(["node_modules", ".git", "dist", "data", ".next"]);

export async function readIgnorePatterns(root: string): Promise<string[]> {
  try {
    const text = await fs.readFile(path.join(root, ".gitignore"), "utf8");
    return parseGitignore(text);
  } catch {
    return [];
  }
}

export async function collectSearchableFiles(
  root: string,
  rel = ".",
  depth = 0,
  patterns: string[] = []
): Promise<Array<{ rel: string; content: string }>> {
  if (depth > 10) return [];
  const dir = resolveInside(root, rel);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Array<{ rel: string; content: string }> = [];
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name) || entry.name === "." || entry.name === "..") continue;
    const childRel = toPosix(path.join(rel === "." ? "" : rel, entry.name));
    if (pathIgnored(childRel, patterns) || pathIgnored(`${childRel}/`, patterns)) continue;
    if (entry.isDirectory()) {
      out.push(...(await collectSearchableFiles(root, childRel, depth + 1, patterns)));
    } else if (entry.isFile()) {
      const target = resolveInside(root, childRel);
      let stat;
      try {
        stat = await fs.stat(target);
      } catch {
        continue;
      }
      if (stat.size > MAX_SEARCH_BYTES) continue;
      const buf = await fs.readFile(target);
      if (buf.includes(0)) continue;
      out.push({ rel: childRel, content: buf.toString("utf8") });
    }
  }
  return out;
}

export async function searchProjectContents(root: string, query: string): Promise<ContentHit[]> {
  const patterns = await readIgnorePatterns(root);
  const files = await collectSearchableFiles(root, ".", 0, patterns);
  return searchContents(files, query, patterns);
}
