export type CodeBlock = { lang: string; code: string };

export function extractCodeBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const re = /```([^\n]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown))) {
    blocks.push({ lang: (match[1] || "").trim(), code: match[2] ?? "" });
  }
  return blocks;
}

export function createUnifiedDiff(rel: string, before: string, after: string): string {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  const lines = [`--- a/${rel}`, `+++ b/${rel}`, `@@ -1,${oldLines.length} +1,${newLines.length} @@`];
  for (const line of oldLines) lines.push(`-${line}`);
  for (const line of newLines) lines.push(`+${line}`);
  return `${lines.join("\n")}\n`;
}

export function applyUnifiedDiff(before: string, diff: string): string {
  const diffLines = diff.split("\n");
  const hunkStart = diffLines.findIndex((l) => l.startsWith("@@ "));
  if (hunkStart < 0) {
    throw Object.assign(new Error("无效 diff"), { code: "INVALID_DIFF", error: "无效 diff" });
  }
  const oldLines = before.split("\n");
  const header = diffLines[hunkStart] ?? "";
  const m = /@@ -(\d+),(\d+) \+(\d+),(\d+) @@/.exec(header);
  if (!m) throw Object.assign(new Error("无效 diff"), { code: "INVALID_DIFF", error: "无效 diff" });
  const start = Number(m[1]) - 1;
  const oldCount = Number(m[2]);
  const result = oldLines.slice(0, Math.max(0, start));
  let oldConsumed = 0;
  for (const line of diffLines.slice(hunkStart + 1)) {
    if (line.startsWith("@@ ")) break;
    if (line.startsWith("\\") || line === "") continue;
    const mark = line[0];
    const text = line.slice(1);
    if (mark === "-") {
      oldConsumed += 1;
    } else if (mark === "+") {
      result.push(text);
    } else if (mark === " ") {
      result.push(text);
      oldConsumed += 1;
    }
  }
  result.push(...oldLines.slice(start + oldCount));
  void oldConsumed;
  return result.join("\n");
}
