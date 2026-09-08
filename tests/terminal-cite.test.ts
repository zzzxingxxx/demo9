import { describe, expect, it } from "vitest";
import { packTerminalCite, prepareRun } from "../server/src/lib/terminal.ts";

describe("terminal output cite packing", () => {
  it("packs cwd command and output and requires confirm before run", () => {
    expect(() => prepareRun("ls", false)).toThrow(/运行命令必须用户确认/);
    expect(prepareRun("  git status  ", true)).toBe("git status");
    const packed = packTerminalCite({
      cwd: "F:/repo",
      command: "git status",
      output: "On branch main\n"
    });
    expect(packed).toContain("@终端 F:/repo");
    expect(packed).toContain("$ git status");
    expect(packed).toContain("On branch main");
  });
});
