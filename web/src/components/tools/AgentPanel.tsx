import { useEffect, useState } from "react";
import { Bot, FileDiff, Play, Square, LoaderCircle } from "lucide-react";
import { createUnifiedDiff } from "@wb/shared";
import { apiSend } from "../../api";
import { useWorkbench } from "../../store";
import { useToolAction } from "../toolUi";
type Item = { path: string; before: string; after: string };

export function AgentPanel() {
  const { currentId, setPendingDiff, setRightPanel, setNotice } =
    useWorkbench();
  const [saved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`wb.agent.${currentId}`) || "{}");
    } catch {
      return {};
    }
  });
  const [mode, setMode] = useState<"task" | "markdown">("task");
  const [input, setInput] = useState<string>(saved.input || "");
  const [items, setItems] = useState<Item[]>(
    Array.isArray(saved.items) ? saved.items : []
  );
  const [plan, setPlan] = useState<string>(saved.plan || "");
  const [planRoot, setPlanRoot] = useState<string | undefined>(saved.rootPath);
  const [applied, setApplied] = useState<string[]>(saved.applied || []);
  const [command, setCommand] = useState("pnpm test");
  const [controller, setController] = useState<AbortController | null>(null);
  const { run, busy, error } = useToolAction();
  useEffect(() => {
    try {
      localStorage.setItem(
        `wb.agent.${currentId}`,
        JSON.stringify({ input, items, plan, applied, rootPath: planRoot })
      );
    } catch {
      setNotice("计划存储空间不足");
    }
  }, [currentId, input, items, plan, applied, planRoot]);
  useEffect(() => () => controller?.abort(), [controller]);
  return (
    <div className="stack">
      {error}
      <div className="theme-control" role="group" aria-label="Agent 输入方式">
        <button aria-pressed={mode === "task"} onClick={() => setMode("task")}>
          任务
        </button>
        <button
          aria-pressed={mode === "markdown"}
          onClick={() => setMode("markdown")}
        >
          导入计划
        </button>
      </div>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const ac = new AbortController();
            setController(ac);
            try {
              const res = await fetch("/api/agent/plan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: ac.signal,
                body: JSON.stringify({
                  projectId: currentId,
                  [mode === "task" ? "content" : "markdown"]: input
                })
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error);
              setItems(data.items);
              setPlan(data.markdown);
              setPlanRoot(data.rootPath);
              setApplied([]);
            } finally {
              setController(null);
            }
          });
        }}
      >
        <textarea
          aria-label="Agent 任务"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            mode === "task" ? "描述需要完成的修改" : "Markdown 文件修改计划"
          }
          rows={7}
        />
        <div className="row-actions">
          <button
            className="btn btn-primary"
            disabled={busy || !currentId || !input.trim()}
          >
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Bot size={15} />
            )}
            {mode === "task" ? "生成修改计划" : "解析计划"}
          </button>
          {controller && (
            <button
              className="gpt-icon"
              type="button"
              title="停止生成"
              onClick={() => controller.abort()}
            >
              <Square size={15} />
            </button>
          )}
        </div>
      </form>
      {items.map((item) => (
        <div className="tool-list-item" key={item.path}>
          <span>
            {item.path}
            <small>{applied.includes(item.path) ? "已写入" : "待确认"}</small>
          </span>
          <button
            className="gpt-icon"
            title={`预览 ${item.path}`}
            aria-label={`预览 ${item.path}`}
            onClick={() =>
              setPendingDiff({
                projectId: currentId!,
                rootPath: planRoot,
                path: item.path,
                before: item.before,
                after: item.after,
                diff: createUnifiedDiff(item.path, item.before, item.after)
              })
            }
          >
            <FileDiff size={16} />
          </button>
          <button
            className="btn"
            disabled={busy || applied.includes(item.path)}
            onClick={() => {
              if (window.confirm(`确认写入 ${item.path}？`))
                void run(async () => {
                  await apiSend("/api/agent/apply", "POST", {
                    projectId: currentId,
                    path: item.path,
                    after: item.after,
                    expectedContent: item.before,
                    expectedRootPath: planRoot,
                    confirm: true
                  });
                  setApplied((a) => [...a, item.path]);
                  setNotice(`${item.path} 已写入`);
                });
            }}
          >
            写入
          </button>
        </div>
      ))}
      {plan && (
        <details>
          <summary>完整计划</summary>
          <pre className="term-out">{plan}</pre>
        </details>
      )}
      {items.length > 0 && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await apiSend("/api/terminal/sessions", "POST", {
                projectId: currentId,
                command,
                confirm: true
              });
              setRightPanel("terminal");
            });
          }}
        >
          <label>
            验证命令
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            />
          </label>
          <button className="btn" disabled={busy || !command.trim()}>
            <Play size={15} />
            运行验证
          </button>
        </form>
      )}
    </div>
  );
}
