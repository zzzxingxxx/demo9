import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyDiffToProject, listTree, readProjectFile, searchTreeByName, shouldIgnore, writeProjectFile } from "../server/src/lib/files.ts";
import { createUnifiedDiff } from "../shared/src/diff.ts";
import { resolveInside } from "../server/src/lib/paths.ts";

describe("file tree and save", () => {
  const clean: string[] = [];
  afterEach(async () => {
    await Promise.all(clean.splice(0).map((p) => fs.rm(p, { recursive: true, force: true })));
  });

  it("lists files, ignores node_modules, and writes only inside the root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "wb-files-"));
    clean.push(root);
    await fs.mkdir(path.join(root, "src"));
    await fs.mkdir(path.join(root, "node_modules", "x"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "app.ts"), "export const n = 1\n", "utf8");
    await fs.writeFile(path.join(root, "node_modules", "x", "index.js"), "nope\n", "utf8");

    expect(shouldIgnore("node_modules")).toBe(true);
    expect(shouldIgnore("app.ts")).toBe(false);

    const tree = await listTree(root);
    const names = tree.map((n) => n.name);
    expect(names).toContain("src");
    expect(names).not.toContain("node_modules");
    const src = tree.find((n) => n.name === "src");
    expect(src?.children?.some((c) => c.rel === "src/app.ts")).toBe(true);

    const original = await readProjectFile(root, "src/app.ts");
    await expect(writeProjectFile(root, "src/app.ts", "stolen", false)).rejects.toMatchObject({
      code: "CONFIRM_REQUIRED"
    });
    await writeProjectFile(root, "src/app.ts", original.replace("1", "2"), true);
    const saved = await fs.readFile(path.join(root, "src", "app.ts"), "utf8");
    expect(saved).toContain("export const n = 2");
    expect(saved).not.toBe(original);

    expect(() => resolveInside(root, "../escape.ts")).toThrow(/超出项目目录/);
    await expect(writeProjectFile(root, "../escape.ts", "x", true)).rejects.toThrow(/超出项目目录/);
  });

  it("searchTreeByName matches file names from the listed tree", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "wb-search-"));
    clean.push(root);
    await fs.mkdir(path.join(root, "lib"));
    await fs.writeFile(path.join(root, "lib", "env.ts"), "", "utf8");
    await fs.writeFile(path.join(root, "README.md"), "", "utf8");
    const tree = await listTree(root);
    const hits = searchTreeByName(tree, "ENV");
    expect(hits.map((h) => h.rel)).toEqual(["lib/env.ts"]);
    expect(searchTreeByName(tree, "nope")).toEqual([]);
  });

  it("applyDiffToProject treats a missing file as empty before", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "wb-newfile-"));
    clean.push(root);
    const after = "export const n = 1\n";
    const diff = createUnifiedDiff("src/new.ts", "", after);
    await expect(applyDiffToProject(root, "src/new.ts", diff, false)).rejects.toMatchObject({
      code: "CONFIRM_REQUIRED"
    });
    const written = await applyDiffToProject(root, "src/new.ts", diff, true);
    expect(written).toBe(after);
    expect(await fs.readFile(path.join(root, "src", "new.ts"), "utf8")).toBe(after);
  });
});
