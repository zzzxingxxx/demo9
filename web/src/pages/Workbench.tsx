import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Archive, ArrowDownUp, BookOpen, Bot, ChevronRight, Clock3, Command,
  Folder, FolderOpen, GitBranch, Globe, Info, LayoutGrid, LoaderCircle,
  MessageSquare, MoreHorizontal, PanelLeft, PanelLeftClose, PanelRight,
  Pencil, Plug, Plus, Search, Settings, SquarePen, Terminal, Trash2, X, type LucideIcon
} from "lucide-react";
import { apiGet, apiSend, type Project, type RulesPayload } from "../api";
import { Canvas } from "../components/Canvas";
import { ChatPane } from "../components/ChatPane";
import { SessionsPanel } from "../components/SessionsPanel";
import { KnowledgePanel } from "../components/KnowledgePanel";
import { Modal } from "../components/Modal";
import {
  AgentPanel, ContentSearchPanel, GitPanel, McpPanel, SchedulePanel, TerminalPanel, WebPanel
} from "../components/WorkbenchTools";
import { useDismissableLayer } from "../lib/useDismissableLayer";
import { useWorkbench, type SidebarPanel, type TreeNode } from "../store";

const MORE: Array<{ id: SidebarPanel; label: string; icon: LucideIcon }> = [
  { id: "knowledge", label: "知识库", icon: BookOpen },
  { id: "search", label: "内容搜索", icon: Search },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "terminal", label: "终端", icon: Terminal },
  { id: "web", label: "网页", icon: Globe },
  { id: "agent", label: "Agent", icon: Bot },
  { id: "schedule", label: "定时任务", icon: Clock3 },
  { id: "mcp", label: "MCP", icon: Plug },
  { id: "bundle", label: "导入导出", icon: ArrowDownUp }
];

export function Workbench() {
  const {
    projects, currentId, notice, sidebarCollapsed, rightPanel, setProjects,
    setCurrentId, setRules, setNotice, setTree, setSessionId, setPaletteOpen,
    setSidebarCollapsed, setRightPanel
  } = useWorkbench();
  const [name, setName] = useState("");
  const [rootPath, setRootPath] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [projectMenu, setProjectMenu] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 860px)").matches);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const projectMenuRef = useDismissableLayer(projectMenu, () => setProjectMenu(false));
  const moreMenuRef = useDismissableLayer(moreMenu, () => setMoreMenu(false));
  const collapsed = !compact && sidebarCollapsed;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 860px)");
    const update = () => {
      setCompact(media.matches);
      setMobileSidebarOpen(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  async function refresh(preferredId?: string) {
    const data = await apiGet<{ projects: Project[] }>("/api/projects");
    setProjects(data.projects);
    const selectedId = preferredId ?? useWorkbench.getState().currentId;
    const next = data.projects.find((p) => p.id === selectedId) ?? data.projects[0] ?? null;
    setCurrentId(next?.id ?? null);
    if (!next) setRules(null);
  }

  useEffect(() => {
    refresh().catch((err: unknown) => setNotice(err instanceof Error ? err.message : "加载失败"));
  }, []);

  useEffect(() => {
    if (!currentId) return;
    let cancelled = false;
    apiGet<RulesPayload>(`/api/projects/${currentId}/rules`)
      .then((data) => { if (!cancelled) setRules(data); })
      .catch((err: unknown) => { if (!cancelled) setNotice(err instanceof Error ? err.message : "无法读取规则"); });
    apiGet<{ tree: TreeNode[] }>(`/api/files?projectId=${encodeURIComponent(currentId)}`)
      .then((data) => { if (!cancelled) setTree(data.tree); })
      .catch((err: unknown) => { if (!cancelled) setNotice(err instanceof Error ? err.message : "无法列出文件"); });
    return () => { cancelled = true; };
  }, [currentId, setNotice, setRules, setTree]);

  function openNewProject() {
    setProjectMenu(false);
    setMobileSidebarOpen(false);
    setCreateError(null);
    setShowNewProject(true);
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await apiSend<{ project: Project }>("/api/projects", "POST", {
        name: name.trim(), rootPath: rootPath.trim() || null
      });
      await refresh(created.project.id);
      setName("");
      setRootPath("");
      setShowNewProject(false);
      setNotice(null);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  async function newChat() {
    if (!currentId) { openNewProject(); return; }
    if (startingChat) return;
    setStartingChat(true);
    try {
      const created = await apiSend<{ session: { id: string } }>("/api/sessions", "POST", { projectId: currentId });
      setSessionId(created.session.id);
      setRightPanel(null);
      setMobileSidebarOpen(false);
      setNotice(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "无法新建会话");
    } finally {
      setStartingChat(false);
    }
  }

  async function projectAction(action: () => Promise<void>) {
    setProjectMenu(false);
    try { await action(); }
    catch (err) { setNotice(err instanceof Error ? err.message : "操作失败，请重试"); }
  }

  const current = projects.find((p) => p.id === currentId) ?? null;
  const isWorkspace = rightPanel === "canvas" || rightPanel === "files";
  const showTool = rightPanel !== null && !isWorkspace;
  const tool = MORE.find((item) => item.id === rightPanel);

  function openPanel(panel: SidebarPanel | "canvas" | null) {
    setRightPanel(panel);
    setMoreMenu(false);
    setMobileSidebarOpen(false);
  }

  const sidebar = (
    <aside id="workspace-sidebar" className={collapsed ? "gpt-sidebar is-collapsed" : "gpt-sidebar"} aria-label="项目与会话">
      <div className="gpt-sidebar-head">
        {!collapsed && <Link to="/" className="workbench-brand" aria-label="AI 工作台首页">
          <span className="brand-mark"><Command size={19} strokeWidth={1.8} /></span>
          <span>工作台<small>WORKBENCH</small></span>
        </Link>}
        <button
          type="button" className="gpt-icon" title={collapsed ? "展开侧栏" : "收起侧栏"}
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
          onClick={() => compact ? setMobileSidebarOpen(false) : setSidebarCollapsed(!sidebarCollapsed)}
        >
          {compact ? <X size={18} /> : collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
      <div className="sidebar-create">
        <button
          type="button" className={collapsed ? "gpt-icon" : "gpt-newchat"}
          title="新对话" aria-label="新对话" disabled={startingChat} onClick={() => void newChat()}
        >
          {startingChat ? <LoaderCircle size={17} className="spin" /> : <SquarePen size={17} />}
          {!collapsed && <><span>新对话</span><Plus size={15} /></>}
        </button>
      </div>
      {collapsed && <nav className="sidebar-rail" aria-label="常用功能">
        <button type="button" className={rightPanel === null ? "gpt-icon is-on" : "gpt-icon"} title="对话" aria-label="对话" onClick={() => openPanel(null)}><MessageSquare size={18} /></button>
        <button type="button" className={isWorkspace ? "gpt-icon is-on" : "gpt-icon"} title="项目文件" aria-label="项目文件" onClick={() => openPanel("canvas")}><FolderOpen size={18} /></button>
        <button type="button" className={rightPanel === "knowledge" ? "gpt-icon is-on" : "gpt-icon"} title="知识库" aria-label="知识库" onClick={() => openPanel("knowledge")}><BookOpen size={18} /></button>
      </nav>}
      {!collapsed && <div className="gpt-sidebar-scroll">
        <div className="sidebar-section-label"><span>项目空间</span>
          <button type="button" className="gpt-icon" aria-label="新建项目" title="新建项目" onClick={openNewProject}><Plus size={15} /></button>
        </div>
        <div className="gpt-pick">
          <Folder size={17} className="project-folder" />
          <select aria-label="项目" value={currentId ?? ""} onChange={(event) => {
            setCurrentId(event.target.value || null);
            setMobileSidebarOpen(false);
          }}>
            {projects.length === 0 && <option value="">选择或创建项目</option>}
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.archived ? "（归档）" : ""}</option>)}
          </select>
          <div className="ws-menu" ref={projectMenuRef}>
            <button type="button" className="gpt-icon" title="项目操作" aria-label="项目操作" aria-expanded={projectMenu} aria-controls="project-actions" onClick={() => setProjectMenu((value) => !value)}>
              <MoreHorizontal size={16} />
            </button>
            {projectMenu && <div id="project-actions" className="gpt-pop ws-pop">
              <button type="button" onClick={openNewProject}><Plus size={15} />新建项目</button>
              <button type="button" disabled={!current} onClick={() => void projectAction(async () => {
                if (!current) return;
                const next = window.prompt("项目名称", current.name);
                if (!next?.trim()) return;
                await apiSend(`/api/projects/${current.id}`, "PATCH", { name: next.trim() });
                await refresh();
              })}><Pencil size={15} />重命名项目</button>
              <button type="button" disabled={!current} onClick={() => void projectAction(async () => {
                if (!current) return;
                await apiSend(`/api/projects/${current.id}`, "PATCH", { archived: !current.archived });
                await refresh();
              })}><Archive size={15} />{current?.archived ? "取消归档" : "归档项目"}</button>
              <button type="button" className="btn-danger" disabled={!current} onClick={() => void projectAction(async () => {
                if (!current || !window.confirm(`删除项目 ${current.name}？`)) return;
                await apiSend(`/api/projects/${current.id}`, "DELETE");
                setCurrentId(null);
                await refresh();
              })}><Trash2 size={15} />删除项目</button>
            </div>}
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="常用功能">
          <button type="button" className={rightPanel === null ? "active" : ""} onClick={() => openPanel(null)}><MessageSquare size={17} />对话</button>
          <button type="button" className={isWorkspace ? "active" : ""} onClick={() => openPanel("canvas")}><FolderOpen size={17} />项目文件</button>
          <button type="button" className={rightPanel === "knowledge" ? "active" : ""} onClick={() => openPanel("knowledge")}><BookOpen size={17} />知识库</button>
        </nav>
        <SessionsPanel key={currentId ?? "none"} onSelect={() => { setMobileSidebarOpen(false); setRightPanel(null); }} />
      </div>}
      <div className="gpt-sidebar-foot">
        <Link to="/settings" className={collapsed ? "gpt-icon" : "sidebar-settings"} title="设置" aria-label="设置">
          <Settings size={17} />{!collapsed && <><span>设置</span><ChevronRight size={14} /></>}
        </Link>
        {!collapsed && <div className="sidebar-local"><span className="status-dot" />本地工作空间</div>}
      </div>
    </aside>
  );

  return (
    <main className="workbench">
      {compact ? <Modal open={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} label="项目与会话" className="sidebar-dialog">{sidebar}</Modal> : sidebar}
      <div className="gpt-stage">
        <header className="gpt-top">
          <button type="button" className="gpt-icon gpt-menu" title="打开侧栏" aria-label="打开侧栏" aria-expanded={mobileSidebarOpen} aria-controls="workspace-sidebar" onClick={() => setMobileSidebarOpen(true)}><PanelLeft size={19} /></button>
          <div className="workspace-breadcrumb"><Folder size={16} /><span className="gpt-top-title" title={current?.name}>{current?.name || "我的工作台"}</span><ChevronRight size={13} className="breadcrumb-divider" /><span className="breadcrumb-page">{isWorkspace ? "项目文件" : tool?.label || "对话"}</span></div>
          <div className="gpt-top-actions">
            <button type="button" className="gpt-icon header-search" title="搜索" aria-label="命令面板" onClick={() => setPaletteOpen(true)}><Search size={18} /></button>
            <span className="toolbar-divider" />
            <div className="ws-menu" ref={moreMenuRef}>
              <button type="button" className={showTool ? "gpt-icon is-on" : "gpt-icon"} title="工具" aria-label="工具" aria-expanded={moreMenu} aria-controls="workspace-tools" onClick={() => setMoreMenu((value) => !value)}><LayoutGrid size={18} /></button>
              {moreMenu && <div id="workspace-tools" className="gpt-pop ws-pop tools-pop">
                <div className="menu-caption">工作台工具</div>
                {MORE.map((item) => <button key={item.id} type="button" className={rightPanel === item.id ? "active" : undefined} onClick={() => openPanel(item.id)}><item.icon size={17} /><span>{item.label}</span></button>)}
              </div>}
            </div>
            <button type="button" className={isWorkspace ? "gpt-icon is-on" : "gpt-icon"} title="工作区" aria-label="工作区" aria-pressed={isWorkspace} onClick={() => openPanel(isWorkspace ? null : "canvas")}><PanelRight size={18} /></button>
          </div>
        </header>
        {notice && <div className="notice" role="status"><Info size={16} /><span>{notice}</span><button type="button" className="gpt-icon" aria-label="关闭提示" onClick={() => setNotice(null)}><X size={15} /></button></div>}
        <div className={rightPanel ? "gpt-body has-panel" : "gpt-body"}>
          <ChatPane key={currentId ?? "none"} onCreateProject={openNewProject} />
          {isWorkspace && <aside className="gpt-canvas" aria-label="工作区"><Canvas /></aside>}
          {showTool && <aside className="gpt-canvas" aria-label={tool?.label}>
            <div className="ws-head">
              {tool && <tool.icon size={17} />}
              <span className="ws-title">{tool?.label}</span>
              <div className="ws-head-actions"><button type="button" className="gpt-icon" title="关闭面板" aria-label="关闭面板" onClick={() => setRightPanel(null)}><X size={17} /></button></div>
            </div>
            <div className="gpt-canvas-body">
              {rightPanel === "knowledge" && <KnowledgePanel />}
              {rightPanel === "search" && <ContentSearchPanel />}
              {rightPanel === "git" && <GitPanel />}
              {rightPanel === "terminal" && <TerminalPanel />}
              {rightPanel === "web" && <WebPanel />}
              {rightPanel === "agent" && <AgentPanel />}
              {rightPanel === "schedule" && <SchedulePanel />}
              {rightPanel === "mcp" && <McpPanel />}
              {rightPanel === "bundle" && (current ? <div className="bundle-actions">
                <button type="button" className="btn" onClick={() => void projectAction(async () => {
                  const data = await apiGet<{ json: string }>(`/api/projects/${current.id}/export`);
                  await navigator.clipboard.writeText(data.json);
                  setNotice("已复制导出 JSON（不含代码目录）");
                })}>导出项目</button>
                <button type="button" className="btn" onClick={() => void projectAction(async () => {
                  const json = window.prompt("粘贴导出 JSON");
                  if (!json) return;
                  await apiSend("/api/projects/import", "POST", { json });
                  await refresh();
                })}>导入项目</button>
              </div> : <p className="hint">选择项目后可导出会话、知识清单和设置。</p>)}
            </div>
          </aside>}
        </div>
      </div>
      <Modal open={showNewProject} onClose={() => { if (!creating) setShowNewProject(false); }} label="新建项目" initialFocus="#project-name" className="project-dialog">
        <div className="dialog-heading"><span className="dialog-icon"><FolderPlusIcon /></span><button type="button" className="gpt-icon" aria-label="关闭新建项目" disabled={creating} onClick={() => setShowNewProject(false)}><X size={18} /></button></div>
        <h2>新建项目</h2>
        <form className="stack project-form" onSubmit={onCreate}>
          <label htmlFor="project-name">项目名称</label>
          <input id="project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：个人网站、阅读笔记" required maxLength={120} />
          <label htmlFor="project-path">本地目录 <span className="optional-label">选填</span></label>
          <input id="project-path" value={rootPath} onChange={(event) => setRootPath(event.target.value)} placeholder="输入本地文件夹的完整路径" />
          {createError && <p className="form-error" role="alert">{createError}</p>}
          <div className="dialog-actions"><button className="btn" type="button" disabled={creating} onClick={() => setShowNewProject(false)}>取消</button><button className="btn btn-primary" type="submit" disabled={!name.trim() || creating}>{creating ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}{creating ? "正在创建…" : "创建项目"}</button></div>
        </form>
      </Modal>
    </main>
  );
}

function FolderPlusIcon() {
  return <FolderOpen size={24} strokeWidth={1.6} />;
}
