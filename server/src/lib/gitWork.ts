import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requireCommitConfirm } from "./confirm.js";

const execFileAsync = promisify(execFile);

export type GitStatusEntry = {
  path: string;
  index: string;
  working_dir: string;
};

export function formatGitStatus(files: GitStatusEntry[]): string {
  if (files.length === 0) return "(clean)";
  return files
    .map((f) => {
      const code = `${f.index || " "}${f.working_dir || " "}`.trimEnd();
      return `${code} ${f.path}`;
    })
    .join("\n");
}

export function parseGitStatusPorcelain(output: string): GitStatusEntry[] {
  const rows: GitStatusEntry[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (line.length < 4) continue;
    const index = line[0] ?? " ";
    const working = line[1] ?? " ";
    const filePath = line.slice(3).trim();
    if (!filePath) continue;
    rows.push({ path: filePath, index, working_dir: working });
  }
  return rows;
}

export function commitMessageDraft(statusText: string, diffText: string): string {
  const first = statusText.split(/\r?\n/).find((l) => l.trim() && l !== "(clean)") ?? "chore: update";
  const pathPart = first.replace(/^[A-Z?!\s]+/, "").trim();
  const body = diffText.trim() ? diffText.trim().slice(0, 400) : statusText.trim();
  return `chore: ${pathPart || "update"}\n\n${body}`;
}

export function applyCommit(confirm: unknown, message: string): { message: string } {
  requireCommitConfirm(confirm);
  const trimmed = message.trim();
  if (!trimmed) {
    throw Object.assign(new Error("提交说明不能为空"), { code: "EMPTY_MESSAGE", error: "提交说明不能为空" });
  }
  return { message: trimmed };
}

export async function runGit(root: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      timeout: 20000,
      maxBuffer: 2_000_000
    });
    return stdout;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const detail = (e.stderr || e.stdout || e.message || "git 失败").trim();
    throw Object.assign(new Error(detail.slice(0, 400)), { code: "GIT_FAILED", error: detail.slice(0, 400) });
  }
}

export async function loadGitStatus(root: string): Promise<{ entries: GitStatusEntry[]; text: string }> {
  const porcelain = await runGit(root, ["status", "--porcelain"]);
  const entries = parseGitStatusPorcelain(porcelain);
  return { entries, text: formatGitStatus(entries) };
}

export async function loadGitDiff(root: string, rel?: string): Promise<string> {
  const args = rel ? ["diff", "HEAD", "--", rel] : ["diff", "HEAD"];
  try {
    return await runGit(root, args);
  } catch {
    return rel ? await runGit(root, ["diff", "--", rel]) : await runGit(root, ["diff"]);
  }
}

export async function performCommit(root: string, message: string, confirm: unknown): Promise<{ message: string }> {
  const done = applyCommit(confirm, message);
  await runGit(root, ["add", "-A"]);
  await runGit(root, ["commit", "-m", done.message]);
  return done;
}
