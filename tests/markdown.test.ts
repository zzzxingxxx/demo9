import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "../shared/src/markdown.ts";

describe("markdown parser", () => {
  it("splits headings, lists, fences, and inline marks", () => {
    const blocks = parseMarkdown("# 标题\n\n一段 **粗** 和 `码`\n\n- 一项\n- 二项\n\n```ts\nconst n = 1\n```\n");
    expect(blocks[0]).toEqual({ type: "heading", level: 1, text: "标题" });
    expect(blocks.some((b) => b.type === "list" && b.items.includes("一项"))).toBe(true);
    const code = blocks.find((b) => b.type === "code");
    expect(code).toMatchObject({ type: "code", lang: "ts" });
    expect(parseInline("看 [文档](https://example.com) 和 **粗**")).toEqual([
      { type: "text", value: "看 " },
      { type: "link", text: "文档", href: "https://example.com" },
      { type: "text", value: " 和 " },
      { type: "bold", value: "粗" }
    ]);
  });
});
