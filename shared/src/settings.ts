export const MODEL_OPTIONS = ["grok-4.5"] as const;

export type ThemeName = "light" | "dark";

export function parseTheme(value: string | null | undefined): ThemeName {
  return value === "dark" ? "dark" : "light";
}

export const DEFAULT_FONT_SIZE = 13;

export function parseFontSize(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_FONT_SIZE;
  return Math.min(22, Math.max(12, Math.round(n)));
}

export const SHORTCUTS = [
  { keys: "Ctrl+K", action: "打开命令面板" },
  { keys: "Esc", action: "关闭命令面板" },
  { keys: "Ctrl+Enter", action: "发送当前对话（输入框内）" }
] as const;
