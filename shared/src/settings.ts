export const MODEL_OPTIONS = ["grok-4.5"] as const;

export type ThemeName = "light" | "dark";

export function parseTheme(value: string | null | undefined): ThemeName {
  return value === "dark" ? "dark" : "light";
}

export const SHORTCUTS = [
  { keys: "Ctrl+K", action: "打开命令面板" },
  { keys: "Esc", action: "关闭命令面板" },
  { keys: "Ctrl+Enter", action: "发送当前对话（输入框内）" }
] as const;
