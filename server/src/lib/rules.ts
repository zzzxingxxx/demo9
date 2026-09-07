import fs from "node:fs/promises";
import path from "node:path";

export const RULE_FILES = ["AGENTS.md", ".workbench.md"] as const;

export function pickRulesFile(names: Iterable<string>): (typeof RULE_FILES)[number] | null {
  const set = new Set(names);
  for (const name of RULE_FILES) {
    if (set.has(name)) return name;
  }
  return null;
}

export type RulesLoad = {
  file: string | null;
  content: string;
};

export async function loadProjectRules(rootPath: string): Promise<RulesLoad> {
  const names = await fs.readdir(rootPath);
  const file = pickRulesFile(names);
  if (!file) return { file: null, content: "" };
  const content = await fs.readFile(path.join(rootPath, file), "utf8");
  return { file, content };
}
