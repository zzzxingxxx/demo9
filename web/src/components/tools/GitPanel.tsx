import { useEffect, useState } from "react";
import {
  FileDiff,
  GitCommitHorizontal,
  RefreshCw,
  Sparkles
} from "lucide-react";
import { apiGet, apiSend } from "../../api";
import { useWorkbench } from "../../store";
import { useToolAction } from "../toolUi";
type Entry = {
  path: string;
  index: string;
  working_dir: string;
  originalPath?: string;
};

export function GitPanel() {
  const { currentId, setNotice } = useWorkbench();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [diff, setDiff] = useState("");
  const [diffPath, setDiffPath] = useState("");
  const [message, setMessage] = useState("");
  const { busy, run, error } = useToolAction();
  async function refresh() {
    if (!currentId) return;
    const data = await apiGet<{ entries: Entry[] }>(
      `/api/git/status?projectId=${currentId}`
    );
    setEntries(data.entries);
    setSelected((s) => s.filter((p) => data.entries.some((e) => e.path === p)));
  }
  useEffect(() => {
    void run(refresh);
  }, [currentId]);
  return (
    <div className="stack">
      {error}
      <div className="row-actions">
        <button
          className="gpt-icon"
          title="刷新 Git"
          aria-label="刷新 Git"
          disabled={busy}
          onClick={() => void run(refresh)}
        >
          <RefreshCw size={16} />
        </button>
        <span className="hint">
          {entries.length} 个改动 · 已选 {selected.length}
        </span>
      </div>
      {entries.length > 0 && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={selected.length === entries.length}
            onChange={(e) =>
              setSelected(e.target.checked ? entries.map((x) => x.path) : [])
            }
          />
          全选
        </label>
      )}
      {!entries.length && !busy && !error && <p className="hint">工作区干净</p>}
      {entries.map((entry) => (
        <div className="tool-list-item" key={entry.path}>
          <label className="check-row">
            <input
              type="checkbox"
              checked={selected.includes(entry.path)}
              onChange={(e) =>
                setSelected((s) =>
                  e.target.checked
                    ? [...s, entry.path]
                    : s.filter((p) => p !== entry.path)
                )
              }
            />
            <code>
              {entry.index}
              {entry.working_dir}
            </code>
            <span>
              {entry.originalPath ? `${entry.originalPath} → ` : ""}
              {entry.path}
            </span>
          </label>
          <button
            className="gpt-icon"
            title={`查看差异 ${entry.path}`}
            aria-label={`查看差异 ${entry.path}`}
            onClick={() =>
              void run(async () => {
                setDiffPath(entry.path);
                setDiff(
                  (
                    await apiGet<{ diff: string }>(
                      `/api/git/diff?projectId=${currentId}&path=${encodeURIComponent(entry.path)}`
                    )
                  ).diff
                );
              })
            }
          >
            <FileDiff size={16} />
          </button>
        </div>
      ))}
      {diffPath && (
        <details open>
          <summary>{diffPath}</summary>
          <pre className="git-status">{diff || "无文本差异"}</pre>
        </details>
      )}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await apiSend("/api/git/commit", "POST", {
              projectId: currentId,
              message,
              paths: selected,
              confirm: true
            });
            setMessage("");
            setDiff("");
            setDiffPath("");
            setNotice("所选文件已提交");
            await refresh();
          });
        }}
      >
        <label>
          提交说明
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
        </label>
        <div className="row-actions">
          <button
            className="btn"
            type="button"
            disabled={busy || !selected.length}
            onClick={() =>
              void run(async () =>
                setMessage(
                  (
                    await apiSend<{ message: string }>(
                      "/api/git/commit-message",
                      "POST",
                      { projectId: currentId, paths: selected }
                    )
                  ).message
                )
              )
            }
          >
            <Sparkles size={15} />
            起草说明
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !message.trim() || !selected.length}
          >
            <GitCommitHorizontal size={15} />
            提交所选文件
          </button>
        </div>
      </form>
    </div>
  );
}
