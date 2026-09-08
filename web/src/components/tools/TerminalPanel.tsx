import { useEffect, useRef, useState } from "react";
import { Play, Square, Quote, RefreshCw } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { apiGet, apiSend } from "../../api";
import { useWorkbench } from "../../store";
import { useToolAction } from "../toolUi";
type Session = {
  id: string;
  projectId: string;
  command: string;
  cwd: string;
  running: boolean;
  exitCode: number | null;
  output: string;
  offset: number;
  reset: boolean;
};

export function TerminalPanel() {
  const { currentId, setCiteDraft } = useWorkbench();
  const [command, setCommand] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState<Session | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const active = useRef({ currentId, selected });
  active.current = { currentId, selected };
  const { run, busy, error } = useToolAction();
  const [streamError, setStreamError] = useState("");
  async function reload() {
    const data = await apiGet<{ sessions: Session[] }>(
      `/api/terminal/sessions?projectId=${currentId}`
    );
    setSessions(data.sessions);
    setSelected((s) => s || data.sessions.at(-1)?.id || "");
  }
  useEffect(() => {
    void run(reload);
  }, [currentId]);
  useEffect(() => {
    if (!host.current) return;
    const term = new Terminal({
      convertEol: true,
      fontSize: 13,
      fontFamily: "Consolas, monospace",
      theme: {
        background: "#202321",
        foreground: "#e3e8e4",
        cursor: "#83d5a8"
      },
      scrollback: 3000
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    fit.fit();
    terminal.current = term;
    let inputQueue = Promise.resolve();
    const data = term.onData((text) => {
      const a = active.current;
      if (a.selected)
        inputQueue = inputQueue
          .then(() =>
            apiSend(`/api/terminal/sessions/${a.selected}/input`, "POST", {
              projectId: a.currentId,
              data: text
            })
          )
          .then(() => undefined)
          .catch((err) => setStreamError(err.message));
    });
    const observer = new ResizeObserver(() => {
      fit.fit();
      const a = active.current;
      if (a.selected)
        void apiSend(`/api/terminal/sessions/${a.selected}/input`, "POST", {
          projectId: a.currentId,
          cols: term.cols,
          rows: term.rows
        }).catch(() => undefined);
    });
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      data.dispose();
      term.dispose();
      terminal.current = null;
    };
  }, []);
  useEffect(() => {
    terminal.current?.reset();
    setStreamError("");
    setStatus(null);
    if (!selected) return;
    let cancelled = false;
    let offset = 0;
    let timer: number;
    async function poll() {
      try {
        const { session } = await apiGet<{ session: Session }>(
          `/api/terminal/sessions/${selected}?projectId=${currentId}&offset=${offset}`
        );
        if (cancelled) return;
        if (session.reset) terminal.current?.reset();
        terminal.current?.write(session.output);
        offset = session.offset;
        setStatus(session);
        if (session.running) timer = window.setTimeout(() => void poll(), 250);
        else {
          terminal.current?.writeln(`\r\n[exit ${session.exitCode}]`);
          await reload();
        }
      } catch (err) {
        if (!cancelled)
          setStreamError(err instanceof Error ? err.message : "终端连接失败");
      }
    }
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentId, selected]);
  return (
    <div className="stack terminal-panel">
      {error}
      {streamError && (
        <p className="form-error" role="alert">
          {streamError}
        </p>
      )}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const data = await apiSend<{ session: Session }>(
              "/api/terminal/sessions",
              "POST",
              {
                projectId: currentId,
                command,
                confirm: true,
                cols: terminal.current?.cols,
                rows: terminal.current?.rows
              }
            );
            setSelected(data.session.id);
            await reload();
          });
        }}
      >
        <input
          aria-label="终端命令"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="运行命令"
        />
        <button
          className="btn btn-primary"
          disabled={busy || !currentId || !command.trim()}
        >
          <Play size={15} />
          运行命令
        </button>
      </form>
      <div className="tool-list-item">
        <select
          aria-label="终端会话"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">选择终端</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.command} · {s.running ? "运行中" : `退出 ${s.exitCode}`}
            </option>
          ))}
        </select>
        <button
          className="gpt-icon"
          title="刷新终端"
          disabled={busy}
          onClick={() => void run(reload)}
        >
          <RefreshCw size={15} />
        </button>
        <button
          className="gpt-icon btn-danger"
          title="停止进程"
          aria-label="停止进程"
          disabled={busy || !status?.running}
          onClick={() =>
            void run(async () => {
              await apiSend(`/api/terminal/sessions/${selected}`, "DELETE", {
                projectId: currentId
              });
            })
          }
        >
          <Square size={15} />
        </button>
      </div>
      <div className="terminal-host" ref={host} aria-label="终端输出与输入" />
      {status && (
        <div className="row-actions">
          <span className="hint">
            {status.running ? "运行中" : `已退出 · ${status.exitCode}`}
          </span>
          <button
            className="btn"
            onClick={() => {
              const buffer = terminal.current?.buffer.active;
              const lines: string[] = [];
              if (buffer)
                for (let i = 0; i < buffer.length; i++)
                  lines.push(buffer.getLine(i)?.translateToString(true) || "");
              setCiteDraft(
                `@终端 ${status.cwd}\n$ ${status.command}\n${lines.join("\n").slice(-12000)}`
              );
            }}
          >
            <Quote size={15} />
            引用输出
          </button>
        </div>
      )}
    </div>
  );
}
