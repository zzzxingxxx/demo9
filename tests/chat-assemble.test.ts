import { describe, expect, it } from "vitest";
import {
  assembleSystemPrompt,
  DEFAULT_SYSTEM_PROMPT,
  exportSessionMarkdown,
  matchSessionQuery,
  titleFromPrompt,
  toModelMessages
} from "../server/src/lib/chat/assemble.ts";

describe("chat assembly and session helpers", () => {
  it("assembleSystemPrompt always starts from the default and appends rules", () => {
    const text = assembleSystemPrompt({ rules: "只用中文" });
    expect(text.startsWith(DEFAULT_SYSTEM_PROMPT)).toBe(true);
    expect(text).toContain("项目规则：");
    expect(text).toContain("只用中文");
    expect(assembleSystemPrompt({}).includes("项目规则")).toBe(false);
  });

  it("toModelMessages puts system first and drops empty turns", () => {
    const messages = toModelMessages("SYS", [
      { role: "user", content: "  " },
      { role: "user", content: "hi" },
      { role: "assistant", content: "yo" }
    ]);
    expect(messages[0]).toEqual({ role: "system", content: "SYS" });
    expect(messages.slice(1)).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "yo" }
    ]);
  });

  it("exportSessionMarkdown renders user/assistant turns from the real history", () => {
    const md = exportSessionMarkdown("周报", [
      { role: "user", content: "写周报" },
      { role: "assistant", content: "本周完成切片 0" }
    ]);
    expect(md.startsWith("# 周报")).toBe(true);
    expect(md).toContain("## 用户");
    expect(md).toContain("写周报");
    expect(md).toContain("## 助手");
    expect(md).toContain("本周完成切片 0");
  });

  it("matchSessionQuery and titleFromPrompt operate on the provided titles", () => {
    const rows = [{ title: "写周报" }, { title: "重构 auth" }, { title: "翻译 README" }];
    expect(matchSessionQuery(rows, "周").map((r) => r.title)).toEqual(["写周报"]);
    expect(matchSessionQuery(rows, "").length).toBe(3);
    expect(titleFromPrompt("第一行\n第二行")).toBe("第一行");
  });
});
