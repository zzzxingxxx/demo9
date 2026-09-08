import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseGitignore, pathIgnored, searchContents, searchProjectContents } from "../server/src/lib/contentSearch.ts";

describe("gitignore-aware content search", () => {
  it("skips gitignored paths and returns matching lines", () => {
    const patterns = parseGitignore("dist/\n*.log\n!keep.log\n");
    expect(pathIgnored("dist/app.js", patterns)).toBe(true);
    expect(pathIgnored("src/app.ts", patterns)).toBe(false);
    expect(pathIgnored("debug.log", patterns)).toBe(true);
    const files = [
      { rel: "src/app.ts", content: "export const n = 1\nconst needle = true\n" },
      { rel: "dist/app.js", content: "needle in dist\n" },
      { rel: "notes.txt", content: "no hit here\n" }
    ];
    const hits = searchContents(files, "needle", patterns);
    expect(hits.map((h) => `${h.rel}:${h.line}`)).toEqual(["src/app.ts:2"]);
    expect(hits[0]?.text).toContain("needle");
    expect(searchContents(files, "needle", parseGitignore(""))).toHaveLength(2);
  });

  const clean: string[] = [];
  afterEach(async () => {
    await Promise.all(clean.splice(0).map((p) => fs.rm(p, { recursive: true, force: true })));
  });

  it("searchProjectContents skips gitignored files on disk", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wb-cs-"));
    clean.push(dir);
    await fs.mkdir(path.join(dir, "src"));
    await fs.mkdir(path.join(dir, "dist"));
    await fs.writeFile(path.join(dir, ".gitignore"), "dist/\n");
    await fs.writeFile(path.join(dir, "src", "app.ts"), "export const needle = true\n");
    await fs.writeFile(path.join(dir, "dist", "app.js"), "needle in dist\n");
    const hits = await searchProjectContents(dir, "needle");
    expect(hits.map((h) => `${h.rel}:${h.line}`)).toEqual(["src/app.ts:1"]);
    expect(hits[0]?.text).toContain("needle");
  });
});
