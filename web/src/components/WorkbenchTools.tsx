import { FormEvent, useEffect, useState } from "react";
import { apiGet, apiSend } from "../api";
import { useWorkbench } from "../store";

type ContentHit = { rel: string; line: number; text: string };
type GitEntry = { path: string; index: string; working_dir: string };
type AgentItem = { path: string; after: string };
type Task = {
  id: string;
  title: string;
  intervalMs: number;
  nextRun: number;
  lastRun: number | null;
  enabled: boolean;
  action?: string;
  payload?: string;
  lastResult?: string;
};
type McpServer = { id: string; name: string; command: string; args: string[]; enabled: boolean };

export function ContentSearchPanel() {
  const { currentId, setNotice, openTab } = useWorkbench();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ContentHit[]>([]);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    if (!currentId) return;
    try {
      const data = await apiGet<{ hits: ContentHit[] }>(
        `/api/files/content-search?projectId=${encodeURIComponent(currentId)}&q=${encodeURIComponent(q)}`
      );
      setHits(data.hits);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "内容搜索失败");
    }
  }

  if (!currentId) return <p className="hint">先选择项目。</p>;
  return (
    <div>
      <form className="stack" onSubmit={onSearch}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="内容搜索（忽略 .gitignore）" />
        <button className="btn" type="submit">
          搜索内容
        </button>
      </form>
      {hits.map((h, i) => (
        <button
          key={`${h.rel}:${h.line}:${i}`}
          type="button"
          className="list-btn"
          onClick={async () => {
            const data = await apiGet<{ path: string; content: string }>(
              `/api/files/content?projectId=${encodeURIComponent(currentId)}&path=${encodeURIComponent(h.rel)}`
            );
            openTab({ path: data.path, content: data.content, original: data.content });
          }}
        >
          {h.rel}:{h.line} {h.text}
        </button>
      ))}
    </div>
  );
}

export function GitPanel() {
  const { currentId, setNotice } = useWorkbench();
  const [text, setText] = useState("");
  const [diff, setDiff] = useState("");
  const [message, setMessage] = useState("");
  const [entries, setEntries] = useState<GitEntry[]>([]);
  const [gitError, setGitError] = useState("");

  async function refresh() {
    if (!currentId) return;
    const status = await apiGet<{ text: string; entries: GitEntry[] }>(
      `/api/git/status?projectId=${encodeURIComponent(currentId)}`
    );
    setText(status.text);
    setEntries(status.entries);
    const d = await apiGet<{ diff: string }>(`/api/git/diff?projectId=${encodeURIComponent(currentId)}`);
    setDiff(d.diff);
    setGitError("");
  }

  useEffect(() => {
    refresh().catch((err: unknown) => setGitError(err instanceof Error ? err.message : "无法读取 Git"));
  }, [currentId]);

  if (!currentId) return <p className="hint">先选择项目。</p>;
  return (
    <div>
      {gitError ? <p className="hint">{gitError}</p> : null}
      <div className="row-actions">
        <button type="button" className="btn" onClick={() => void refresh()}>
          刷新状态
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            try {
              const data = await apiSend<{ message: string }>("/api/git/commit-message", "POST", {
                projectId: currentId
              });
              setMessage(data.message);
            } catch (err) {
              setNotice(err instanceof Error ? err.message : "无法起草提交说明");
            }
          }}
        >
          AI 提交说明
        </button>
      </div>
      <pre className="git-status">{text || "(无状态)"}</pre>
      {diff ? <pre className="git-status">{diff}</pre> : null}
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await apiSend("/api/git/commit", "POST", { projectId: currentId, message, confirm: true });
            setNotice("已提交");
            await refresh();
          } catch (err) {
            setNotice(err instanceof Error ? err.message : "提交失败");
          }
        }}
      >
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="提交说明" />
        <button className="btn btn-primary" type="submit" disabled={!message.trim()}>
          确认 commit
        </button>
      </form>
      {entries.length ? <p className="hint">{entries.length} 个改动</p> : null}
    </div>
  );
}

export function TerminalPanel() {
  const { currentId, setNotice, setCiteDraft } = useWorkbench();
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState("");
  const [cite, setCite] = useState("");

  if (!currentId) return <p className="hint">先选择项目。</p>;
  return (
    <div>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const data = await apiSend<{ output: string; cite: string }>("/api/terminal/run", "POST", {
              projectId: currentId,
              command,
              confirm: true
            });
            setOutput(data.output);
            setCite(data.cite);
          } catch (err) {
            setNotice(err instanceof Error ? err.message : "运行失败");
          }
        }}
      >
        <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="在绑定目录运行命令" />
        <button className="btn btn-primary" type="submit" disabled={!command.trim()}>
          确认运行
        </button>
      </form>
      <pre className="term-out">{output}</pre>
      {cite ? (
        <button type="button" className="btn" onClick={() => setCiteDraft(cite)}>
          引用进对话
        </button>
      ) : null}
    </div>
  );
}

export function AgentPanel() {
  const { currentId, setNotice, setPendingDiff } = useWorkbench();
  const [markdown, setMarkdown] = useState("");
  const [items, setItems] = useState<AgentItem[]>([]);

  if (!currentId) return <p className="hint">先选择项目。</p>;
  return (
    <div>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const data = await apiSend<{ items: AgentItem[]; markdown: string }>("/api/agent/plan", "POST", {
              projectId: currentId,
              markdown
            });
            setItems(data.items);
            setMarkdown(data.markdown);
          } catch (err) {
            setNotice(err instanceof Error ? err.message : "无法解析计划");
          }
        }}
      >
        <textarea
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          placeholder={"### src/a.ts\n```ts\nexport const n = 1\n```"}
        />
        <button className="btn" type="submit">
          解析计划
        </button>
      </form>
      {items.map((item) => (
        <div key={item.path} className="section">
          <div className="hint">{item.path}</div>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              try {
                const data = await apiSend<{
                  written: boolean;
                  before: string;
                  after: string;
                  content: string;
                  diff: string;
                }>("/api/agent/apply", "POST", {
                  projectId: currentId,
                  path: item.path,
                  after: item.after,
                  confirm: false
                });
                if (data.written) {
                  setNotice("预览不应写盘");
                  return;
                }
                setPendingDiff({
                  path: item.path,
                  before: data.before,
                  after: data.after ?? data.content,
                  diff: data.diff
                });
                setNotice(`${item.path} 的 diff 已放到画布，确认后写盘`);
              } catch (err) {
                setNotice(err instanceof Error ? err.message : "无法预览 diff");
              }
            }}
          >
            预览 diff {item.path}
          </button>
        </div>
      ))}
    </div>
  );
}

export function SchedulePanel() {
  const { currentId, setNotice } = useWorkbench();
  const [title, setTitle] = useState("");
  const [intervalMs, setIntervalMs] = useState("60000");
  const [action, setAction] = useState("log");
  const [payload, setPayload] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);

  async function reload() {
    if (!currentId) return;
    const data = await apiGet<{ tasks: Task[] }>(`/api/schedule?projectId=${encodeURIComponent(currentId)}`);
    setTasks(data.tasks);
  }

  useEffect(() => {
    reload().catch((err: unknown) => setNotice(err instanceof Error ? err.message : "无法加载定时任务"));
  }, [currentId]);

  if (!currentId) return <p className="hint">先选择项目。</p>;
  return (
    <div>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await apiSend("/api/schedule", "POST", {
              projectId: currentId,
              title,
              intervalMs: Number(intervalMs) || 60000,
              action,
              payload
            });
            setTitle("");
            setPayload("");
            await reload();
          } catch (err) {
            setNotice(err instanceof Error ? err.message : "创建失败");
          }
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="任务标题" />
        <input value={intervalMs} onChange={(e) => setIntervalMs(e.target.value)} placeholder="间隔毫秒" />
        <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="任务动作">
          <option value="log">记录</option>
          <option value="run">运行命令</option>
        </select>
        <input
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          placeholder={action === "run" ? "要运行的命令" : "可选备注"}
        />
        <button className="btn btn-primary" type="submit" disabled={!title.trim()}>
          新建定时任务
        </button>
      </form>
      <button
        type="button"
        className="btn"
        onClick={async () => {
          await apiSend("/api/schedule/tick", "POST", {});
          await reload();
        }}
      >
        立即 tick
      </button>
      {tasks.map((t) => (
        <div key={t.id} className="hint">
          {t.title} · {t.action || "log"} · {t.intervalMs}ms · next {new Date(t.nextRun).toLocaleString()}
          {t.lastResult ? ` · ${t.lastResult.slice(0, 80)}` : ""}
        </div>
      ))}
    </div>
  );
}

export function WebPanel() {
  const { setNotice } = useWorkbench();
  const [q, setQ] = useState("");
  const [url, setUrl] = useState("");
  const [results, setResults] = useState<Array<{ title: string; url: string }>>([]);
  const [page, setPage] = useState("");

  return (
    <div>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const data = await apiGet<{ results: Array<{ title: string; url: string }> }>(
              `/api/web/search?q=${encodeURIComponent(q)}`
            );
            setResults(data.results);
          } catch (err) {
            setNotice(err instanceof Error ? err.message : "网页搜索失败");
          }
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="网页搜索" />
        <button className="btn" type="submit">
          搜索网页
        </button>
      </form>
      {results.map((r) => (
        <div key={r.url} className="hint">
          {r.title} · {r.url}
        </div>
      ))}
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const data = await apiSend<{ title: string; text: string }>("/api/web/fetch", "POST", { url });
            setPage(`${data.title}\n${data.text}`);
          } catch (err) {
            setNotice(err instanceof Error ? err.message : "抓取失败");
          }
        }}
      >
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="抓取 https://" />
        <button className="btn" type="submit">
          抓网页
        </button>
      </form>
      {page ? <pre className="term-out">{page}</pre> : null}
    </div>
  );
}

export function McpPanel() {
  const { setNotice } = useWorkbench();
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<Array<{ name: string; description: string }>>([]);

  async function reload() {
    const data = await apiGet<{ servers: McpServer[] }>("/api/mcp");
    setServers(data.servers);
  }

  useEffect(() => {
    reload().catch((err: unknown) => setNotice(err instanceof Error ? err.message : "无法加载 MCP"));
  }, [setNotice]);

  return (
    <div>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await apiSend("/api/mcp", "POST", { name, command, args: [] });
            setName("");
            setCommand("");
            await reload();
          } catch (err) {
            setNotice(err instanceof Error ? err.message : "添加失败");
          }
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="MCP 名称" />
        <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="命令" />
        <button className="btn" type="submit" disabled={!name.trim() || !command.trim()}>
          添加 MCP
        </button>
      </form>
      {servers.map((s) => (
        <div key={s.id} className="session-row">
          <div className="hint">
            {s.name} · {s.command}
          </div>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              try {
                const data = await apiSend<{ tools: Array<{ name: string; description: string }> }>(
                  `/api/mcp/${s.id}/tools`,
                  "POST",
                  {}
                );
                setTools(data.tools);
              } catch (err) {
                setNotice(err instanceof Error ? err.message : "列出工具失败");
              }
            }}
          >
            列出工具
          </button>
        </div>
      ))}
      {tools.map((t) => (
        <div key={t.name} className="hint">
          {t.name}: {t.description}
        </div>
      ))}
    </div>
  );
}
