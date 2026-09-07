import { apiSend } from "../api";
import { useWorkbench } from "../store";

export function Canvas() {
  const { currentId, tabs, activePath, setActivePath, setTabContent, markSaved, closeTab, setNotice } =
    useWorkbench();
  const tab = tabs.find((t) => t.path === activePath) ?? null;
  const dirty = tab ? tab.content !== tab.original : false;

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
          <textarea
            className="editor"
            value={tab.content}
            onChange={(e) => setTabContent(tab.path, e.target.value)}
          />
          <div className="canvas-bar">
            <span>{dirty ? "未保存" : "已保存"}</span>
            <button className="btn btn-primary" type="button" onClick={save} disabled={!dirty}>
              保存
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
