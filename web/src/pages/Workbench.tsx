import { FormEvent, useEffect, useState } from "react";
import { apiGet, apiSend, type Project } from "../api";
import { Canvas } from "../components/Canvas";
import { ChatPane, SessionsPanel } from "../components/ChatPane";
import { FileTree } from "../components/FileTree";
import { KnowledgePanel } from "../components/KnowledgePanel";
import { useWorkbench, type TreeNode } from "../store";

export function Workbench() {
  const { projects, currentId, rules, notice, setProjects, setCurrentId, setRules, setNotice, setTree } =
    useWorkbench();
  const [name, setName] = useState("");
  const [rootPath, setRootPath] = useState("");

  async function refresh() {
    const data = await apiGet<{ projects: Project[] }>("/api/projects");
    setProjects(data.projects);
    const still = data.projects.find((p) => p.id === currentId);
    const next = still ?? data.projects[0] ?? null;
    if (next && next.id !== currentId) setCurrentId(next.id);
    if (!next) {
      setCurrentId(null);
      setRules(null);
    }
  }

  useEffect(() => {
    refresh().catch((err: unknown) => setNotice(err instanceof Error ? err.message : "加载失败"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentId) return;
    apiGet<NonNullable<typeof rules>>(`/api/projects/${currentId}/rules`)
      .then(setRules)
      .catch((err: unknown) => setNotice(err instanceof Error ? err.message : "无法读取规则"));
    apiGet<{ tree: TreeNode[] }>(`/api/files?projectId=${encodeURIComponent(currentId)}`)
      .then((d) => setTree(d.tree))
      .catch((err: unknown) => setNotice(err instanceof Error ? err.message : "无法列出文件"));
  }, [currentId, setNotice, setRules, setTree]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      const created = await apiSend<{ project: Project }>("/api/projects", "POST", {
        name,
        rootPath: rootPath.trim() || null
      });
      setName("");
      setRootPath("");
      setCurrentId(created.project.id);
      await refresh();
      setNotice(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "创建失败");
    }
  }

  const current = projects.find((p) => p.id === currentId) ?? null;

  return (
    <main className="workbench">
      <aside className="pane" aria-label="项目与文件">
        <div className="pane-head">项目</div>
        <div className="pane-body">
          <form className="stack" onSubmit={onCreate}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="项目名称" required />
            <input
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
              placeholder="本地目录绝对路径"
            />
            <button className="btn btn-primary" type="submit">
              新建项目
            </button>
          </form>
          {notice ? <p className="warn">{notice}</p> : null}
          <section className="section">
            <h3>项目</h3>
            {projects.length === 0 ? (
              <p className="hint">还没有项目。绑定一个本地目录后，文件树会出现在这里。</p>
            ) : (
              projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={p.id === currentId ? "list-btn active" : "list-btn"}
                  onClick={() => setCurrentId(p.id)}
                >
                  {p.name}
                </button>
              ))
            )}
          </section>
          <section className="section">
            <h3>绑定目录</h3>
            <p className="hint">{current?.rootPath || "未绑定"}</p>
            <p className="hint">
              规则文件：{rules?.file ? `${rules.file}` : "无 AGENTS.md / .workbench.md"}
            </p>
          </section>
          <section className="section">
            <h3>会话</h3>
            <SessionsPanel />
          </section>
          <section className="section">
            <h3>文件</h3>
            <FileTree />
          </section>
          <section className="section">
            <h3>知识</h3>
            <KnowledgePanel />
          </section>
        </div>
      </aside>
      <section className="pane" aria-label="对话">
        <div className="pane-head">对话</div>
        <ChatPane />
      </section>
      <section className="pane" aria-label="画布">
        <div className="pane-head">画布</div>
        <Canvas />
      </section>
    </main>
  );
}
