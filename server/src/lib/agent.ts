import { createUnifiedDiff } from "@wb/shared";
import { requireWriteConfirm } from "./files.js";

export type AgentItem = {
  path: string;
  after: string;
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
      const path = meta.split(/\s+/).find((p) => p.includes("/") || p.includes(".")) ?? "";
      if (path) items.push({ path, after: match[2] ?? "" });
    }
  }
  return items;
}

export function applyAgentItem(
  current: string,
  item: AgentItem,
  confirm: unknown
): { path: string; content: string; diff: string } {
  requireWriteConfirm(confirm);
  return {
    path: item.path,
    content: item.after,
    diff: createUnifiedDiff(item.path, current, item.after)
  };
}
