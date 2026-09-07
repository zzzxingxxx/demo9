import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "../server/src/lib/db/index.ts";
import { createProject, loadBoundRules, updateProject } from "../server/src/lib/projects.ts";
import { pickRulesFile } from "../server/src/lib/rules.ts";
import { resolveInside } from "../server/src/lib/paths.ts";

async function tempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("project bind and rules", () => {
  const clean: string[] = [];
  const closers: Array<() => void> = [];

  afterEach(async () => {
    for (const close of closers.splice(0)) close();
    await Promise.all(
      clean.splice(0).map((p) => fs.rm(p, { recursive: true, force: true }).catch(() => undefined))
    );
  });

  it("pickRulesFile prefers AGENTS.md over .workbench.md", () => {
    expect(pickRulesFile(["README.md", ".workbench.md"])).toBe(".workbench.md");
    expect(pickRulesFile(["AGENTS.md", ".workbench.md"])).toBe("AGENTS.md");
    expect(pickRulesFile(["README.md"])).toBeNull();
  });

  it("binds a real directory and loads AGENTS.md from it", async () => {
    const root = await tempDir("wb-proj-");
    const data = await tempDir("wb-db-");
    clean.push(root, data);
    await fs.writeFile(path.join(root, "AGENTS.md"), "# 规则\n只用中文回答\n", "utf8");
    const opened = await openDb(path.join(data, "app.db"));
    closers.push(opened.close);
    const project = await createProject(opened.db, { name: "demo", rootPath: root });
    expect(project.rootPath).toBe(path.resolve(root));
    const rules = await loadBoundRules(project);
    expect(rules.file).toBe("AGENTS.md");
    expect(rules.content).toContain("只用中文回答");
  });

  it("falls back to .workbench.md and errors when the bound dir is gone", async () => {
    const root = await tempDir("wb-proj-");
    const data = await tempDir("wb-db-");
    clean.push(root, data);
    await fs.writeFile(path.join(root, ".workbench.md"), "keep diffs\n", "utf8");
    const opened = await openDb(path.join(data, "app.db"));
    closers.push(opened.close);
    const project = await createProject(opened.db, { name: "demo", rootPath: root });
    const rules = await loadBoundRules(project);
    expect(rules.file).toBe(".workbench.md");
    expect(rules.content).toContain("keep diffs");
    await fs.rm(root, { recursive: true, force: true });
    await expect(loadBoundRules(project)).rejects.toMatchObject({
      code: "DIR_MISSING",
      error: "绑定目录不存在"
    });
  });

  it("rejects binding a missing path and escaping the root", async () => {
    const data = await tempDir("wb-db-");
    clean.push(data);
    const opened = await openDb(path.join(data, "app.db"));
    closers.push(opened.close);
    await expect(
      createProject(opened.db, { name: "x", rootPath: path.join(data, "no-such-dir") })
    ).rejects.toMatchObject({ code: "DIR_MISSING" });

    const root = await tempDir("wb-root-");
    clean.push(root);
    expect(() => resolveInside(root, "../outside.txt")).toThrow(/超出项目目录/);
    const inside = resolveInside(root, "src/app.ts");
    expect(inside.startsWith(path.resolve(root))).toBe(true);
  });

  it("updateProject can rebind to another existing directory", async () => {
    const a = await tempDir("wb-a-");
    const b = await tempDir("wb-b-");
    const data = await tempDir("wb-db-");
    clean.push(a, b, data);
    await fs.writeFile(path.join(b, "AGENTS.md"), "from-b\n", "utf8");
    const opened = await openDb(path.join(data, "app.db"));
    closers.push(opened.close);
    const project = await createProject(opened.db, { name: "p", rootPath: a });
    const updated = await updateProject(opened.db, project.id, { rootPath: b });
    const rules = await loadBoundRules(updated);
    expect(rules.content).toContain("from-b");
  });
});
