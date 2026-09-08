import { useEffect, useState } from "react";
import {
  Clock3,
  Pencil,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  Save,
  X
} from "lucide-react";
import { apiGet, apiSend } from "../../api";
import { useWorkbench } from "../../store";
import { useToolAction } from "../toolUi";
type Task = {
  id: string;
  title: string;
  intervalMs: number;
  nextRun: number;
  lastRun: number | null;
  lastResult: string;
  action: string;
  payload: string;
  enabled: boolean;
  running?: boolean;
};
const blank = { title: "", intervalMs: 60000, action: "log", payload: "" };

export function SchedulePanel() {
  const { currentId } = useWorkbench();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const { run, busy, error } = useToolAction();
  async function reload() {
    if (currentId)
      setTasks(
        (
          await apiGet<{ tasks: Task[] }>(
            `/api/schedule?projectId=${currentId}`
          )
        ).tasks
      );
  }
  useEffect(() => {
    void run(reload);
    const timer = window.setInterval(() => {
      if (!document.hidden) void run(reload);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [currentId]);
  return (
    <div className="stack">
      {error}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await apiSend(
              editing ? `/api/schedule/${editing}` : "/api/schedule",
              editing ? "PATCH" : "POST",
              { ...form, projectId: currentId }
            );
            setForm(blank);
            setEditing(null);
            await reload();
          });
        }}
      >
        <label>
          任务标题
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label>
          间隔（秒）
          <input
            type="number"
            min={30}
            step={1}
            required
            value={form.intervalMs / 1000}
            onChange={(e) =>
              setForm({ ...form, intervalMs: Number(e.target.value) * 1000 })
            }
          />
        </label>
        <label>
          动作
          <select
            value={form.action}
            onChange={(e) => setForm({ ...form, action: e.target.value })}
          >
            <option value="log">记录</option>
            <option value="run">运行命令</option>
          </select>
        </label>
        <label>
          {form.action === "run" ? "命令" : "备注"}
          <textarea
            required={form.action === "run"}
            value={form.payload}
            onChange={(e) => setForm({ ...form, payload: e.target.value })}
          />
        </label>
        <div className="row-actions">
          <button
            className="btn btn-primary"
            disabled={
              busy ||
              !currentId ||
              !form.title.trim() ||
              form.intervalMs < 30000
            }
          >
            {editing ? <Save size={15} /> : <Clock3 size={15} />}
            {editing ? "保存任务" : "创建定时任务"}
          </button>
          {editing && (
            <button
              className="gpt-icon"
              type="button"
              title="取消编辑"
              onClick={() => {
                setEditing(null);
                setForm(blank);
              }}
            >
              <X size={15} />
            </button>
          )}
          <button
            className="gpt-icon"
            type="button"
            title="刷新任务"
            aria-label="刷新任务"
            disabled={busy}
            onClick={() => void run(reload)}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </form>
      {!tasks.length && <p className="hint">暂无定时任务</p>}
      {tasks.map((task) => (
        <div className="task-item" key={task.id}>
          <div className="tool-list-item">
            <strong>{task.title}</strong>
            <span className="hint">
              {task.running ? "运行中" : task.enabled ? "已启用" : "已暂停"}
            </span>
          </div>
          <p className="hint">
            每 {task.intervalMs / 1000} 秒
            {task.enabled
              ? ` · 下次 ${new Date(task.nextRun).toLocaleString()}`
              : ""}
          </p>
          {task.payload && <code className="task-command">{task.payload}</code>}
          <div className="row-actions">
            <button
              className="gpt-icon"
              title={`编辑 ${task.title}`}
              aria-label={`编辑 ${task.title}`}
              disabled={busy}
              onClick={() => {
                setEditing(task.id);
                setForm({
                  title: task.title,
                  intervalMs: task.intervalMs,
                  action: task.action,
                  payload: task.payload
                });
              }}
            >
              <Pencil size={15} />
            </button>
            <button
              className="gpt-icon"
              title={task.enabled ? "暂停任务" : "启用任务"}
              aria-label={`${task.enabled ? "暂停" : "启用"} ${task.title}`}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await apiSend(`/api/schedule/${task.id}`, "PATCH", {
                    enabled: !task.enabled
                  });
                  await reload();
                })
              }
            >
              {task.enabled ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <button
              className="gpt-icon"
              title="立即运行 / 重试"
              aria-label={`立即运行 ${task.title}`}
              disabled={busy || task.running}
              onClick={() =>
                void run(async () => {
                  await apiSend(`/api/schedule/${task.id}/run`, "POST", {});
                  await reload();
                })
              }
            >
              <RefreshCw size={15} />
            </button>
            <button
              className="gpt-icon btn-danger"
              title={`删除 ${task.title}`}
              aria-label={`删除 ${task.title}`}
              disabled={busy || task.running}
              onClick={() => {
                if (window.confirm(`删除定时任务 ${task.title}？`))
                  void run(async () => {
                    await apiSend(`/api/schedule/${task.id}`, "DELETE");
                    await reload();
                  });
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
          {task.lastRun && (
            <details>
              <summary>
                上次运行 · {new Date(task.lastRun).toLocaleString()}
              </summary>
              <pre className="term-out">{task.lastResult}</pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
