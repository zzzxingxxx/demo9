import { spawn, type IPty } from "node-pty";
import { randomUUID } from "node:crypto";
import { pathError } from "./paths.js";
import { prepareRun } from "./terminal.js";

type TerminalSession = {
  id: string;
  projectId: string;
  command: string;
  cwd: string;
  output: string;
  base: number;
  exitCode: number | null;
  running: boolean;
  process: IPty;
  createdAt: number;
};
const sessions = new Map<string, TerminalSession>();

export function terminalSnapshot(
  session: TerminalSession,
  offset = session.base
) {
  const start = Math.max(
    session.base,
    Math.min(offset, session.base + session.output.length)
  );
  return {
    id: session.id,
    projectId: session.projectId,
    command: session.command,
    cwd: session.cwd,
    output: session.output.slice(start - session.base),
    offset: session.base + session.output.length,
    reset: offset < session.base,
    exitCode: session.exitCode,
    running: session.running,
    createdAt: session.createdAt
  };
}

export function listTerminalSessions(projectId: string) {
  return [...sessions.values()]
    .filter((s) => s.projectId === projectId)
    .map((s) => terminalSnapshot(s, s.base + s.output.length));
}

export function getTerminalSession(projectId: string, id: string) {
  const session = sessions.get(id);
  if (!session || session.projectId !== projectId)
    throw pathError("NOT_FOUND", "终端会话不存在");
  return session;
}

export function startTerminalSession(
  projectId: string,
  cwd: string,
  command: string,
  confirm: unknown,
  cols = 80,
  rows = 24
) {
  const cmd = prepareRun(command, confirm);
  if ([...sessions.values()].filter((s) => s.running).length >= 8)
    throw pathError("LIMIT", "最多同时运行 8 个终端");
  const windows = process.platform === "win32";
  const child = spawn(
    windows ? "powershell.exe" : process.env.SHELL || "/bin/sh",
    windows ? ["-NoLogo", "-NoProfile", "-Command", cmd] : ["-lc", cmd],
    {
      cwd,
      cols,
      rows,
      name: "xterm-256color",
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          (e): e is [string, string] => e[1] !== undefined
        )
      )
    }
  );
  const session: TerminalSession = {
    id: randomUUID(),
    projectId,
    command: cmd,
    cwd,
    output: "",
    base: 0,
    exitCode: null,
    running: true,
    process: child,
    createdAt: Date.now()
  };
  sessions.set(session.id, session);
  child.onData((text) => {
    session.output += text;
    if (session.output.length > 200000) {
      const drop = session.output.length - 200000;
      session.base += drop;
      session.output = session.output.slice(drop);
    }
  });
  child.onExit(({ exitCode }) => {
    session.running = false;
    session.exitCode = exitCode;
    setTimeout(() => sessions.delete(session.id), 30 * 60000).unref();
  });
  return terminalSnapshot(session);
}

export function stopTerminalSession(projectId: string, id: string) {
  const session = getTerminalSession(projectId, id);
  if (session.running) session.process.kill();
}

export function closeProjectTerminals(projectId?: string) {
  for (const session of sessions.values())
    if (!projectId || session.projectId === projectId) {
      if (session.running) session.process.kill();
      sessions.delete(session.id);
    }
}
