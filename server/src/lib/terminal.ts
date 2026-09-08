import { spawn } from "node:child_process";
import { requireRunConfirm } from "./confirm.js";

export type TerminalCiteInput = {
  cwd: string;
  command: string;
  output: string;
};

export function packTerminalCite(input: TerminalCiteInput): string {
  const out = input.output.replace(/\s+$/, "");
  return [`@终端 ${input.cwd}`, `$ ${input.command}`, out || "(无输出)"].join("\n");
}

export function prepareRun(command: string, confirm: unknown): string {
  requireRunConfirm(confirm);
  const cmd = command.trim();
  if (!cmd) {
    throw Object.assign(new Error("命令不能为空"), { code: "EMPTY_COMMAND", error: "命令不能为空" });
  }
  return cmd;
}

export async function runCommand(
  cwd: string,
  command: string,
  confirm: unknown,
  timeoutMs = 15000
): Promise<{ cwd: string; command: string; output: string }> {
  const cmd = prepareRun(command, confirm);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, {
      cwd,
      shell: true,
      windowsHide: true
    });
    let output = "";
    const onData = (buf: Buffer) => {
      output += buf.toString("utf8");
      if (output.length > 80_000) output = output.slice(-80_000);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    const timer = setTimeout(() => {
      child.kill();
      reject(
        Object.assign(new Error("命令超时"), {
          code: "TIMEOUT",
          error: "命令超时"
        })
      );
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(Object.assign(new Error(err.message), { code: "RUN_FAILED", error: err.message }));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ cwd, command: cmd, output: output || `(exit ${code ?? 0})` });
    });
  });
}
