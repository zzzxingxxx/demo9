import { createUnifiedDiff } from "@wb/shared";
import { writeProjectFile } from "./files.js";

export type AgentItem = {
  path: string;
  after: string;
};

export type AgentPreview = {
  path: string;
  before: string;
  after: string;
  content: string;
  diff: string;
  written: boolean;
};

export function parseAgentPlan(markdown: string): AgentItem[] {
  const items: AgentItem[] = [];
  const heading = /(?:^|\n)#{1,3}\s+([^\n]+)\n```[^\n]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = heading.exec(markdown))) {
    const path = (match[1] ?? "").trim().replace(/^file:\s*/i, "");
    const after = match[2] ?? "";
    if (path) items.push({ path, after });
  }
  if (items.length === 0) {
    const fenced = /```([^\n]*)\n([\s\S]*?)```/g;
    while ((match = fenced.exec(markdown))) {
      const meta = (match[1] ?? "").trim();
      const path =
        meta.split(/\s+/).find((p) => p.includes("/") || p.includes(".")) ?? "";
      if (path) items.push({ path, after: match[2] ?? "" });
    }
  }
  return items;
}

export function previewAgentItem(
  current: string,
  item: AgentItem
): AgentPreview {
  return {
    path: item.path,
    before: current,
    after: item.after,
    content: item.after,
    diff: createUnifiedDiff(item.path, current, item.after),
    written: false
  };
}

export function applyAgentItem(
  current: string,
  item: AgentItem,
  confirm: unknown
): AgentPreview {
  const preview = previewAgentItem(current, item);
  return { ...preview, written: confirm === true };
}

export async function commitAgentItem(
  root: string,
  current: string,
  item: AgentItem,
  confirm: unknown
): Promise<AgentPreview> {
  const applied = applyAgentItem(current, item, confirm);
  if (!applied.written) return applied;
  await writeProjectFile(root, applied.path, applied.content, true, current);
  return applied;
}
