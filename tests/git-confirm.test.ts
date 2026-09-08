import { describe, expect, it } from "vitest";
import { applyCommit, formatGitStatus, parseGitStatusPorcelain } from "../server/src/lib/gitWork.ts";

describe("confirm-before-commit", () => {
  it("formats porcelain status and refuses commit until confirm is true", () => {
    const entries = parseGitStatusPorcelain("M  src/a.ts\n?? new.md\n");
    expect(entries.map((e) => e.path)).toEqual(["src/a.ts", "new.md"]);
    const status = formatGitStatus(entries);
    expect(status).toContain("src/a.ts");
    expect(status).toContain("new.md");
    expect(() => applyCommit(false, "chore: x")).toThrow(/提交必须用户确认/);
    expect(() => applyCommit(undefined, "chore: x")).toThrow(/提交必须用户确认/);
    const done = applyCommit(true, "  feat: files  ");
    expect(done.message).toBe("feat: files");
    expect(() => applyCommit(true, "   ")).toThrow(/提交说明不能为空/);
  });
});
