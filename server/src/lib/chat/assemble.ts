export type ChatRef = {
  kind: "file" | "folder" | "knowledge" | "rules";
  name: string;
  content: string;
};

export type ChatTurn = {
  role: "user" | "assistant" | "system";
  content: string;
};

export const DEFAULT_SYSTEM_PROMPT = "你是本机 AI 工作台助手。回答简洁、可执行，优先依据用户引用的文件与知识。";

const KIND_LABEL: Record<ChatRef["kind"], string> = {
  file: "@文件",
  folder: "@文件夹",
  knowledge: "@知识",
  rules: "@规则"
};

export function assembleSystemPrompt(input: {
  rules?: string;
  skillPrompt?: string;
  refs?: ChatRef[];
}): string {
  const parts = [DEFAULT_SYSTEM_PROMPT];
  if (input.skillPrompt?.trim()) parts.push(input.skillPrompt.trim());
  if (input.rules?.trim()) parts.push(`项目规则：\n${input.rules.trim()}`);
  for (const ref of input.refs ?? []) {
    const body = ref.content.trim();
    if (!body) continue;
    parts.push(`${KIND_LABEL[ref.kind]} ${ref.name}：\n${body}`);
  }
  return parts.join("\n\n");
}

export function toModelMessages(system: string, history: ChatTurn[]): ChatTurn[] {
  return [{ role: "system", content: system }, ...history.filter((m) => m.content.trim())];
}

export function titleFromPrompt(prompt: string): string {
  const line = prompt.trim().split(/\r?\n/)[0] || "新会话";
  return line.slice(0, 40);
}

export function exportSessionMarkdown(title: string, history: ChatTurn[]): string {
  const blocks = [`# ${title}`, ""];
  for (const turn of history) {
    if (turn.role === "system") continue;
    const who = turn.role === "user" ? "用户" : "助手";
    blocks.push(`## ${who}`, "", turn.content.trim(), "");
  }
  return blocks.join("\n");
}

export function matchSessionQuery<T extends { title: string }>(sessions: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return sessions;
  return sessions.filter((s) => s.title.toLowerCase().includes(q));
}
