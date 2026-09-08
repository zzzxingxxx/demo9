import { describe, expect, it } from "vitest";
import { assembleSystemPrompt } from "../server/src/lib/chat/assemble.ts";
import {
  parseAtMentions,
  resolveChatRefs
} from "../server/src/lib/chat/refs.ts";

describe("@ mention context assembly", () => {
  it("resolves quoted paths and the root folder", async () => {
    const mentions = parseAtMentions('@文件 "docs/my notes.md" @文件夹 .');
    expect(mentions[0]?.name).toBe("docs/my notes.md");
    const refs = await resolveChatRefs(mentions, {
      readFile: async () => "content",
      listTree: async () => [{ name: "a.ts", rel: "a.ts", type: "file" }]
    });
    expect(refs[1]?.content).toBe("a.ts");
  });
  it("parseAtMentions extracts file, folder, knowledge, and rules tokens", () => {
    const text =
      "请看 @文件 src/app.ts 和 @文件夹 src，再对照 @知识 架构.md 与 @规则";
    expect(parseAtMentions(text)).toEqual([
      { kind: "file", name: "src/app.ts" },
      { kind: "folder", name: "src" },
      { kind: "knowledge", name: "架构.md" },
      { kind: "rules", name: "" }
    ]);
    expect(parseAtMentions("没有引用")).toEqual([]);
  });

  it("resolveChatRefs plus assembleSystemPrompt embeds loaded contents", async () => {
    const mentions = parseAtMentions("解释 @文件 lib/env.ts 并遵守 @规则");
    const refs = await resolveChatRefs(mentions, {
      readFile: async (rel) => {
        expect(rel).toBe("lib/env.ts");
        return "export const KEY = 1\n";
      },
      listTree: async () => [],
      loadRules: async () => ({ file: "AGENTS.md", content: "不要编造路径" }),
      loadKnowledge: async () => null
    });
    expect(refs.map((r) => r.kind)).toEqual(["file", "rules"]);
    const prompt = assembleSystemPrompt({ refs });
    expect(prompt).toContain("@文件 lib/env.ts");
    expect(prompt).toContain("export const KEY = 1");
    expect(prompt).toContain("@规则 AGENTS.md");
    expect(prompt).toContain("不要编造路径");
  });

  it("resolveChatRefs plus assembleSystemPrompt attaches @知识 without a project root", async () => {
    const mentions = parseAtMentions(
      "根据 @知识 笔记.md 总结，并忽略 @文件 src/a.ts"
    );
    const refs = await resolveChatRefs(mentions, {
      loadKnowledge: async (name) => {
        expect(name).toBe("笔记.md");
        return { title: "笔记.md", content: "第一期切片：绑定目录是可选的" };
      }
    });
    expect(refs.map((r) => r.kind)).toEqual(["knowledge"]);
    expect(refs[0]?.content).toContain("绑定目录是可选的");
    const prompt = assembleSystemPrompt({ refs });
    expect(prompt).toContain("@知识 笔记.md");
    expect(prompt).toContain("第一期切片：绑定目录是可选的");
    expect(prompt).not.toContain("src/a.ts");
  });
});
