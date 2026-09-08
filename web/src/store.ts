import { create } from "zustand";
import { parseFontSize } from "@wb/shared";
import type { Project, RulesPayload } from "./api";

export const KNOWLEDGE_TAB_PREFIX = "knowledge:";
const FONT_KEY = "wb.fontSize";

export function knowledgeTabPath(id: string, title: string): string {
  return `${KNOWLEDGE_TAB_PREFIX}${id}:${title}`;
}

export function isKnowledgeTab(path: string): boolean {
  return path.startsWith(KNOWLEDGE_TAB_PREFIX);
}

export function knowledgeTabLabel(path: string): string {
  if (!isKnowledgeTab(path)) return path;
  const rest = path.slice(KNOWLEDGE_TAB_PREFIX.length);
  const idx = rest.indexOf(":");
  return idx >= 0 ? rest.slice(idx + 1) : rest;
}

export type FileTab = {
  path: string;
  content: string;
  original: string;
};

export type PendingDiff = {
  projectId: string;
  rootPath?: string | null;
  path: string;
  before: string;
  after: string;
  diff: string;
};

export type TreeNode = {
  name: string;
  rel: string;
  type: "file" | "dir";
  children?: TreeNode[];
};

export type SidebarPanel =
  | "project"
  | "session"
  | "files"
  | "knowledge"
  | "search"
  | "git"
  | "terminal"
  | "web"
  | "agent"
  | "schedule"
  | "mcp"
  | "bundle";

const SIDEBAR_KEY = "wb.sidebarPanel";
const COLLAPSE_KEY = "wb.sidebarCollapsed";

function parseSidebarPanel(value: string | null): SidebarPanel {
  const allowed: SidebarPanel[] = [
    "project",
    "session",
    "files",
    "knowledge",
    "search",
    "git",
    "terminal",
    "web",
    "agent",
    "schedule",
    "mcp",
    "bundle"
  ];
  return allowed.includes(value as SidebarPanel)
    ? (value as SidebarPanel)
    : "project";
}

type State = {
  projects: Project[];
  currentId: string | null;
  sessionId: string | null;
  rules: RulesPayload | null;
  notice: string | null;
  paletteOpen: boolean;
  tree: TreeNode[];
  tabs: FileTab[];
  activePath: string | null;
  pendingDiff: PendingDiff | null;
  composerDraft: string;
  setComposerDraft: (draft: string) => void;
  citeDraft: string | null;
  skillId: string;
  fontSize: number;
  sidebarPanel: SidebarPanel;
  sidebarCollapsed: boolean;
  rightPanel: SidebarPanel | "canvas" | null;
  setProjects: (projects: Project[]) => void;
  setCurrentId: (id: string | null) => void;
  setSessionId: (id: string | null) => void;
  setRules: (rules: RulesPayload | null) => void;
  setNotice: (notice: string | null) => void;
  setPaletteOpen: (open: boolean) => void;
  setTree: (tree: TreeNode[]) => void;
  openTab: (tab: FileTab, projectId?: string) => void;
  setTabContent: (path: string, content: string) => void;
  markSaved: (path: string, content: string, projectId?: string) => void;
  closeTab: (path: string) => void;
  setActivePath: (path: string | null) => void;
  setPendingDiff: (diff: PendingDiff | null) => void;
  setCiteDraft: (cite: string | null) => void;
  setSkillId: (id: string) => void;
  setFontSize: (size: number) => void;
  setSidebarPanel: (panel: SidebarPanel) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setRightPanel: (panel: SidebarPanel | "canvas" | null) => void;
};

const persistKey = "wb.currentProject";
const DRAFT_KEY = "wb.workspaceDrafts.v1";
type WorkspaceDraft = Pick<
  State,
  "tabs" | "activePath" | "pendingDiff" | "composerDraft"
>;
const emptyDraft = (): WorkspaceDraft => ({
  tabs: [],
  activePath: null,
  pendingDiff: null,
  composerDraft: ""
});
function loadDrafts(): Record<string, WorkspaceDraft> {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => {
        const d = v as WorkspaceDraft;
        return (
          d &&
          Array.isArray(d.tabs) &&
          d.tabs.every(
            (t) =>
              typeof t.path === "string" &&
              typeof t.content === "string" &&
              typeof t.original === "string"
          ) &&
          typeof d.composerDraft === "string"
        );
      })
    ) as Record<string, WorkspaceDraft>;
  } catch {
    return {};
  }
}
const drafts = loadDrafts();
const initialId = localStorage.getItem(persistKey);

export const useWorkbench = create<State>((set) => ({
  projects: [],
  currentId: initialId,
  sessionId: null,
  rules: null,
  notice: null,
  paletteOpen: false,
  tree: [],
  ...(initialId ? drafts[initialId] || emptyDraft() : emptyDraft()),
  setComposerDraft: (composerDraft) => set({ composerDraft }),
  citeDraft: null,
  skillId: "",
  fontSize: parseFontSize(localStorage.getItem(FONT_KEY)),
  sidebarPanel: parseSidebarPanel(localStorage.getItem(SIDEBAR_KEY)),
  sidebarCollapsed: localStorage.getItem(COLLAPSE_KEY) === "1",
  rightPanel: null,
  setProjects: (projects) => set({ projects }),
  setCurrentId: (id) => {
    set((s) => {
      if (s.currentId === id) return s;
      if (s.currentId)
        drafts[s.currentId] = {
          tabs: s.tabs,
          activePath: s.activePath,
          pendingDiff: s.pendingDiff,
          composerDraft: s.composerDraft
        };
      if (id) localStorage.setItem(persistKey, id);
      else localStorage.removeItem(persistKey);
      return {
        currentId: id,
        sessionId: null,
        ...(id ? drafts[id] || emptyDraft() : emptyDraft()),
        tree: [],
        rules: null,
        citeDraft: null,
        rightPanel: null
      };
    });
  },
  setSessionId: (id) => set({ sessionId: id }),
  setRules: (rules) => set({ rules }),
  setNotice: (notice) => set({ notice }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setTree: (tree) => set({ tree }),
  openTab: (tab, projectId) =>
    set((s) => {
      if (projectId && s.currentId !== projectId) return s;
      const exists = s.tabs.some((t) => t.path === tab.path);
      return {
        tabs: exists ? s.tabs : [...s.tabs, tab],
        activePath: tab.path,
        rightPanel: "canvas"
      };
    }),
  setTabContent: (path, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, content } : t))
    })),
  markSaved: (path, content, projectId) =>
    set((s) => {
      const update = (tabs: FileTab[]) =>
        tabs.map((t) => (t.path === path ? { ...t, original: content } : t));
      if (projectId && s.currentId !== projectId) {
        if (drafts[projectId])
          drafts[projectId].tabs = update(drafts[projectId].tabs);
        return { notice: s.notice };
      }
      return { tabs: update(s.tabs) };
    }),
  closeTab: (path) =>
    set((s) => {
      const target = s.tabs.find((t) => t.path === path);
      if (
        target &&
        target.content !== target.original &&
        !window.confirm(`放弃 ${path} 的未保存修改？`)
      )
        return s;
      const tabs = s.tabs.filter((t) => t.path !== path);
      const activePath =
        s.activePath === path
          ? (tabs[tabs.length - 1]?.path ?? null)
          : s.activePath;
      return { tabs, activePath };
    }),
  setActivePath: (path) => set({ activePath: path }),
  setPendingDiff: (pendingDiff) =>
    set((s) =>
      pendingDiff && pendingDiff.projectId !== s.currentId
        ? s
        : {
            pendingDiff: pendingDiff
              ? {
                  ...pendingDiff,
                  rootPath:
                    pendingDiff.rootPath === undefined
                      ? s.projects.find((p) => p.id === pendingDiff.projectId)
                          ?.rootPath
                      : pendingDiff.rootPath
                }
              : null,
            rightPanel: pendingDiff ? "canvas" : s.rightPanel
          }
    ),
  setCiteDraft: (citeDraft) => set({ citeDraft }),
  setSkillId: (skillId) => set({ skillId }),
  setFontSize: (size) => {
    const fontSize = parseFontSize(size);
    localStorage.setItem(FONT_KEY, String(fontSize));
    set({ fontSize });
  },
  setSidebarPanel: (sidebarPanel) => {
    localStorage.setItem(SIDEBAR_KEY, sidebarPanel);
    set({ sidebarPanel, rightPanel: sidebarPanel });
  },
  setSidebarCollapsed: (sidebarCollapsed) => {
    localStorage.setItem(COLLAPSE_KEY, sidebarCollapsed ? "1" : "0");
    set({ sidebarCollapsed });
  },
  setRightPanel: (rightPanel) => set({ rightPanel })
}));

useWorkbench.subscribe((s) => {
  if (s.currentId)
    drafts[s.currentId] = {
      tabs: s.tabs,
      activePath: s.activePath,
      pendingDiff: s.pendingDiff,
      composerDraft: s.composerDraft
    };
  try {
    const persistent = Object.fromEntries(
      Object.entries(drafts).map(([id, d]) => [
        id,
        { ...d, tabs: d.tabs.filter((t) => t.content !== t.original) }
      ])
    );
    localStorage.setItem(DRAFT_KEY, JSON.stringify(persistent));
  } catch {
    if (s.notice !== "草稿存储空间不足，请保存文件")
      useWorkbench.setState({ notice: "草稿存储空间不足，请保存文件" });
  }
});

window.addEventListener("beforeunload", (event) => {
  if (
    Object.values(drafts).some((d) =>
      d.tabs.some((t) => t.content !== t.original)
    )
  ) {
    event.preventDefault();
    event.returnValue = "";
  }
});
