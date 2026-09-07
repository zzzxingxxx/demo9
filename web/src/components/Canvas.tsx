import { useEffect, useState } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { apiSend } from "../api";
import { languageFromPath } from "../lib/languageFromPath";
import { useWorkbench } from "../store";

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

const editorOptions = {
  minimap: { enabled: false },
  fontSize: 13,
  wordWrap: "on" as const,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2
};

export function Canvas() {
  const {
    currentId,
    tabs,
    activePath,
    pendingDiff,
    setActivePath,
    setTabContent,
    markSaved,
    closeTab,
    setNotice,
    setPendingDiff,
    openTab
  } = useWorkbench();
  const tab = tabs.find((t) => t.path === activePath) ?? null;
  const dirty = tab ? tab.content !== tab.original : false;
  const theme = useEditorTheme();

  async function save() {
    if (!currentId || !tab) return;
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

  if (tabs.length === 0) {
    return <div className="canvas-empty">打开文件后在这里编辑。AI 给出的代码改动会先出 diff，确认后再写盘。</div>;
  }

  return (
    <div className="canvas">
      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.path}
            type="button"
            className={t.path === activePath ? "tab active" : "tab"}
            onClick={() => setActivePath(t.path)}
          >
            {t.path}
            {t.content !== t.original ? " •" : ""}
            <span
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.path);
              }}
            >
              ×
            </span>
          </button>
        ))}
      </div>
      {tab ? (
        <>
          <div className="monaco-host">
            <Editor
              key={tab.path}
              height="100%"
              theme={theme}
              language={languageFromPath(tab.path)}
              value={tab.content}
              onChange={(value) => setTabContent(tab.path, value ?? "")}
              options={editorOptions}
            />
          </div>
          <div className="canvas-bar">
            <span>{dirty ? "未保存" : "已保存"}</span>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                if (!currentId || !tab) return;
                const rel = window.prompt("另存为（项目内相对路径）", tab.path.replace(/\.[^.]+$/, ".md"));
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
              另存为
            </button>
            <button className="btn btn-primary" type="button" onClick={save} disabled={!dirty}>
              保存
            </button>
          </div>
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
                    ...editorOptions,
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
        </>
      ) : null}
    </div>
  );
}
