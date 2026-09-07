import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeListDir, executeReadFile, workbenchTools } from "../server/src/lib/chat/tools.ts";

describe("read-only model tools", () => {
  const clean: string[] = [];
  afterEach(async () => {
    await Promise.all(clean.splice(0).map((p) => fs.rm(p, { recursive: true, force: true })));
  });

  it("executeReadFile and executeListDir only read inside the bound root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "wb-tools-"));
    clean.push(root);
    await fs.mkdir(path.join(root, "src"));
    await fs.writeFile(path.join(root, "src", "a.ts"), "export const a = 1\n", "utf8");

    const listed = await executeListDir(root, ".");
    expect(listed).toContain("src/");
    const read = await executeReadFile(root, "src/a.ts");
    expect(read).toBe("export const a = 1\n");
    await expect(executeReadFile(root, "../secret")).rejects.toThrow(/超出项目目录/);

    const tools = workbenchTools(root);
    expect(Object.keys(tools).sort()).toEqual(["list_dir", "read_file"]);
    expect(Object.keys(tools)).not.toContain("write_file");
  });
});
