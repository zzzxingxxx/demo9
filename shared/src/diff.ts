import { applyPatch, createTwoFilesPatch } from "diff";

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

export function createUnifiedDiff(
  rel: string,
  before: string,
  after: string
): string {
  return createTwoFilesPatch(`a/${rel}`, `b/${rel}`, before, after);
}

export function applyUnifiedDiff(before: string, diff: string): string {
  if (!diff.includes("--- ") || !diff.includes("+++ "))
    throw Object.assign(new Error("无效 diff"), {
      code: "INVALID_DIFF",
      error: "无效 diff"
    });
  const result = applyPatch(before, diff, { fuzzFactor: 0 });
  if (result === false)
    throw Object.assign(new Error("diff 与当前文件不匹配"), {
      code: "CONFLICT",
      error: "diff 与当前文件不匹配"
    });
  return result;
}
