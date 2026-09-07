export type Skill = {
  id: string;
  name: string;
  prompt: string;
};

export const SKILLS: Skill[] = [
  {
    id: "ask-doc",
    name: "问文档",
    prompt: "只根据用户引用的知识与文件回答，并标出来源标题。没有依据就说不知道。"
  },
  {
    id: "write-doc",
    name: "写说明",
    prompt: "把材料整理成结构清楚的中文说明，使用标题和列表，避免空话。"
  },
  {
    id: "explain-code",
    name: "解释代码",
    prompt: "解释引用代码在做什么、关键路径和风险，按函数/模块分段。"
  },
  {
    id: "commit-msg",
    name: "起草提交说明",
    prompt: "根据改动起草一条 Conventional Commits 风格的提交说明，第一行不超过 72 字。"
  },
  {
    id: "refactor",
    name: "重构建议",
    prompt: "给出可落地的重构建议，说明为什么、改哪里、风险是什么。不要直接大片重写无关代码。"
  },
  {
    id: "find-bugs",
    name: "找问题",
    prompt: "查找明显缺陷、边界情况和错误处理漏洞，按严重程度列出。"
  },
  {
    id: "meeting-notes",
    name: "会议纪要",
    prompt: "整理成会议纪要：结论、待办（负责人/截止如有）、未决问题。"
  },
  {
    id: "translate",
    name: "翻译",
    prompt: "在中英之间准确翻译，保留标识符与代码，不解释，除非用户要求。"
  }
];

export function listSkills(): Skill[] {
  return SKILLS;
}

export function getSkill(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id || s.name === id);
}

export function skillPromptAssembly(skill: Skill, userText: string): { skillPrompt: string; content: string } {
  return {
    skillPrompt: `当前技能：${skill.name}\n${skill.prompt}`,
    content: userText.trim() || `请执行「${skill.name}」。`
  };
}
