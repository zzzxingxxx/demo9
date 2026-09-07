import { describe, expect, it } from "vitest";
import { applyUnifiedDiff, createUnifiedDiff, extractCodeBlocks } from "../shared/src/diff.ts";
import { requireWriteConfirm } from "../server/src/lib/files.ts";

describe("diff apply and code blocks", () => {
  it("createUnifiedDiff then applyUnifiedDiff reconstructs the new file", () => {
    const before = "a\nb\nc\n";
    const after = "a\nB\nc\n";
    const diff = createUnifiedDiff("src/a.ts", before, after);
    expect(diff).toContain("--- a/src/a.ts");
    expect(diff).toContain("-b");
    expect(diff).toContain("+B");
    expect(applyUnifiedDiff(before, diff)).toBe(after);
  });

  it("extractCodeBlocks reads fenced content from assistant markdown", () => {
    const md = "说明\n```ts\nexport const n = 2\n```\n完";
    const blocks = extractCodeBlocks(md);
    expect(blocks).toEqual([{ lang: "ts", code: "export const n = 2\n" }]);
    expect(extractCodeBlocks("no code")).toEqual([]);
  });

  it("requireWriteConfirm blocks writes until confirm is true", () => {
    expect(() => requireWriteConfirm(false)).toThrow(/写盘必须用户确认/);
    expect(() => requireWriteConfirm(undefined)).toThrow(/写盘必须用户确认/);
    expect(() => requireWriteConfirm(true)).not.toThrow();
  });
});
