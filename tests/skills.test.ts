import { describe, expect, it } from "vitest";
import { assembleSystemPrompt } from "../server/src/lib/chat/assemble.ts";
import { getSkill, listSkills, skillPromptAssembly } from "../server/src/lib/skills.ts";

const NAMES = ["问文档", "写说明", "解释代码", "起草提交说明", "重构建议", "找问题", "会议纪要", "翻译"];

describe("built-in skills", () => {
  it("exposes eight named skills and injects their prompts into system assembly", () => {
    const skills = listSkills();
    expect(skills.map((s) => s.name)).toEqual(NAMES);
    expect(new Set(skills.map((s) => s.id)).size).toBe(8);
    for (const skill of skills) {
      expect(skill.prompt.trim().length).toBeGreaterThan(10);
      const assembled = skillPromptAssembly(skill, "材料");
      const system = assembleSystemPrompt({ skillPrompt: assembled.skillPrompt });
      expect(system).toContain(skill.name);
      expect(system).toContain(skill.prompt);
      expect(assembled.content).toBe("材料");
    }
    expect(getSkill("翻译")?.id).toBe("translate");
    expect(getSkill("missing")).toBeUndefined();
  });
});
