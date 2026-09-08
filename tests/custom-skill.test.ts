import { describe, expect, it } from "vitest";
import { customSkillPromptAssembly } from "../server/src/lib/skills.ts";

describe("custom skill prompt assembly", () => {
  it("includes persona default refs and prompt", () => {
    const skill = {
      id: "mine",
      name: "审稿",
      persona: "严格编辑",
      defaultRefs: "@知识 手册.md",
      prompt: "只根据引用改稿"
    };
    const userText = "请改这一段";
    const assembled = customSkillPromptAssembly(skill, userText);
    expect(assembled.content).toBe(userText);
    expect(assembled.skillPrompt).toContain("审稿");
    expect(assembled.skillPrompt).toContain("严格编辑");
    expect(assembled.skillPrompt).toContain("@知识 手册.md");
    expect(assembled.skillPrompt).toContain("只根据引用改稿");
  });
});
