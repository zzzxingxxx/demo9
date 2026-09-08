import { useEffect, useMemo, useState } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { FileText, FolderOpen, Save, SaveAll, X } from "lucide-react";
import { apiGet, apiSend } from "../api";
import { languageFromPath } from "../lib/languageFromPath";
import {
  isKnowledgeTab,
  knowledgeTabLabel,
  useWorkbench,
  type TreeNode
} from "../store";

function useEditorTheme() {
  const [theme, setTheme] = useState(() =>
    document.documentElement.dataset.theme === "dark" ? "vs-dark" : "vs"
  );
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => setTheme(root.dataset.theme === "dark" ? "vs-dark" : "vs");
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

function editorOptions(fontSize: number) {
  return {
    minimap: { enabled: false },
    fontSize,
    wordWrap: "on" as const,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2
  };
}

function flattenFiles(nodes: TreeNode[]): Array<{ rel: string; name: string }> {
  const out: Array<{ rel: string; name: string }> = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.type === "file") out.push({ rel: n.rel, name: n.name });
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export function Canvas() {
  const {
    currentId,
    tabs,
    activePath,
    pendingDiff,
    tree,
    setActivePath,
    setTabContent,
    markSaved,
    closeTab,
    setNotice,
    setPendingDiff,
    openTab,
    fontSize,
    setRightPanel
  } = useWorkbench();
  const tab = tabs.find((t) => t.path === activePath) ?? null;
  const dirty = tab ? tab.content !== tab.original : false;
  const knowledge = tab ? isKnowledgeTab(tab.path) : false;
  const theme = useEditorTheme();
  const options = editorOptions(fontSize);
  const [preview, setPreview] = useState<{
    kind: string;
    rows?: string[][];
    text?: string;
    url?: string;
  } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fileQ, setFileQ] = useState("");

  const files = useMemo(() => {
    const all = flattenFiles(tree);
    const q = fileQ.trim().toLowerCase();
    if (!q) return all;
    return all.filter((f) => f.rel.toLowerCase().includes(q) || f.name.toLowerCase().includes(q));
  }, [tree, fileQ]);

  const empty = !tab && !pendingDiff;
  const showPicker = pickerOpen || empty;

  useEffect(() => {
    if (!currentId || !tab || isKnowledgeTab(tab.path)) {
      setPreview(null);
      return;
    }
    const ext = (tab.path.split(".").pop() || "").toLowerCase();
    if (!["csv", "png", "jpg", "jpeg", "gif", "webp", "svg", "pdf"].includes(ext)) {
      setPreview(null);
      return;
    }
    apiGet<{ kind: string; rows?: string[][]; text?: string; url?: string }>(
      `/api/files/preview?projectId=${encodeURIComponent(currentId)}&path=${encodeURIComponent(tab.path)}`
    )
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [currentId, tab?.path]);

  async function save() {
    if (!currentId || !tab || isKnowledgeTab(tab.path)) return;
    try {
      await apiSend("/api/files/content", "PUT", {
        projectId: currentId,
        path: tab.path,
        content: tab.content,
        confirm: true
      });
      markSaved(tab.path, tab.content);
      setNotice(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function openFile(rel: string) {
    if (!currentId) return;
    try {
      const data = await apiGet<{ path: string; content: string }>(
        `/api/files/content?projectId=${encodeURIComponent(currentId)}&path=${encodeURIComponent(rel)}`
      );
      openTab({ path: data.path, content: data.content, original: data.content });
      setPickerOpen(false);
      setFileQ("");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "打开失败");
    }
  }

  const title = tab
    ? knowledgeTabLabel(tab.path)
    : pendingDiff
      ? pendingDiff.path
      : "工作区";

  return (
    <div className="canvas">
      <div className="ws-head">
        <button
          type="button"
          className={pickerOpen ? "gpt-icon is-on" : "gpt-icon"}
          title="打开"
          aria-label="打开"
          aria-pressed={showPicker}
          onClick={() => setPickerOpen((v) => !v)}
        >
          <FolderOpen size={16} />
        </button>
        <span className="ws-title">{title}</span>
        <div className="ws-head-actions">
          {knowledge ? <span className="muted">只读</span> : null}
          {tab ? (
            <button
              className="gpt-icon"
              type="button"
              title="另存为"
              aria-label="另存为"
              onClick={async () => {
                if (!currentId || !tab) return;
                const suggested = knowledge
                  ? `${knowledgeTabLabel(tab.path).replace(/\.[^.]+$/, "") || "note"}.md`
                  : tab.path.replace(/\.[^.]+$/, ".md");
                const rel = window.prompt("另存为（项目内相对路径）", suggested);
                if (!rel) return;
                await apiSend("/api/files/content", "PUT", {
                  projectId: currentId,
                  path: rel,
                  content: tab.content,
                  confirm: true
                });
                openTab({ path: rel, content: tab.content, original: tab.content });
              }}
            >
              <SaveAll size={17} />
            </button>
          ) : null}
          {tab && !knowledge ? (
            <button className="gpt-icon" type="button" title="保存" aria-label="保存" onClick={save} disabled={!dirty}>
              <Save size={17} />
            </button>
          ) : null}
          <button
            type="button"
            className="gpt-icon"
            title="关闭"
            aria-label="关闭"
            onClick={() => setRightPanel(null)}
          >
            <X size={16} />
          </button>
        </div>
      </div>
      {tabs.length > 1 ? (
        <div className="ws-docs" role="tablist" aria-label="打开的文件">
          {tabs.map((t) => (
            <div className="ws-doc-tab" key={t.path}>
            <button
              type="button"
              role="tab"
              aria-selected={t.path === activePath}
              className={t.path === activePath ? "active" : undefined}
              onClick={() => setActivePath(t.path)}
            >
              {knowledgeTabLabel(t.path)}
              {t.content !== t.original ? " ·" : ""}
            </button>
            <button type="button" className="tab-close" title={`关闭 ${knowledgeTabLabel(t.path)}`} aria-label={`关闭 ${knowledgeTabLabel(t.path)}`} onClick={() => closeTab(t.path)}><X size={12} /></button>
            </div>
          ))}
        </div>
      ) : null}
      {showPicker ? (
        <div className={tab || pendingDiff ? "ws-picker is-overlay" : "ws-picker"}>
          <input
            className="gpt-search"
            value={fileQ}
            onChange={(e) => setFileQ(e.target.value)}
            placeholder="搜索文件"
            aria-label="搜索文件"
          />
          {!currentId ? (
            <div className="panel-empty"><FolderOpen size={30} strokeWidth={1.4} /><p>尚未选择项目</p></div>
          ) : files.length === 0 ? (
            <div className="panel-empty"><FolderOpen size={30} strokeWidth={1.4} /><p>{tree.length === 0 ? "暂无项目文件" : "没有匹配的文件"}</p></div>
          ) : (
            <><div className="file-list-count">{files.length} 个文件</div>{
            files.map((f) => (
              <button
                key={f.rel}
                type="button"
                className={f.rel === activePath ? "list-btn file-entry active" : "list-btn file-entry"}
                title={f.rel}
                onClick={() => void openFile(f.rel)}
              >
                <FileText size={15} /><span>{f.rel}</span>
              </button>
            ))}</>
          )}
        </div>
      ) : null}
      {tab ? (
        <>
          {preview?.kind === "csv" && preview.rows ? (
            <div className="preview-host">
              <table className="preview-table">
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {preview?.kind === "image" && preview.url ? (
            <div className="preview-host">
              <img src={preview.url} alt={tab.path} />
            </div>
          ) : null}
          {preview?.kind === "pdf" && preview.text ? (
            <pre className="preview-host">{preview.text}</pre>
          ) : null}
          <div className="monaco-host">
            <Editor
              key={tab.path}
              height="100%"
              theme={theme}
              language={languageFromPath(tab.path)}
              value={tab.content}
              onChange={(value) => {
                if (!knowledge) setTabContent(tab.path, value ?? "");
              }}
              options={{ ...options, readOnly: knowledge }}
            />
          </div>
        </>
      ) : null}
      {pendingDiff ? (
        <div className="diff-panel">
          <div className="diff-monaco">
            <DiffEditor
              key={pendingDiff.path}
              height="100%"
              theme={theme}
              language={languageFromPath(pendingDiff.path)}
              original={pendingDiff.before}
              modified={pendingDiff.after}
              options={{
                ...options,
                readOnly: true,
                renderSideBySide: true,
                originalEditable: false
              }}
            />
          </div>
          <div className="canvas-bar">
            <span>确认后才会写盘</span>
            <button className="btn" type="button" onClick={() => setPendingDiff(null)}>
              取消
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={async () => {
                if (!currentId) return;
                const res = await apiSend<{ content: string }>("/api/files/apply-diff", "POST", {
                  projectId: currentId,
                  path: pendingDiff.path,
                  diff: pendingDiff.diff,
                  confirm: true
                });
                markSaved(pendingDiff.path, res.content);
                setTabContent(pendingDiff.path, res.content);
                setPendingDiff(null);
              }}
            >
              确认写盘
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
