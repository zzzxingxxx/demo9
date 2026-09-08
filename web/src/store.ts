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
  return allowed.includes(value as SidebarPanel) ? (value as SidebarPanel) : "project";
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
  openTab: (tab: FileTab) => void;
  setTabContent: (path: string, content: string) => void;
  markSaved: (path: string, content: string) => void;
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

export const useWorkbench = create<State>((set) => ({
  projects: [],
  currentId: localStorage.getItem(persistKey),
  sessionId: null,
  rules: null,
  notice: null,
  paletteOpen: false,
  tree: [],
  tabs: [],
  activePath: null,
  pendingDiff: null,
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
      if (id) localStorage.setItem(persistKey, id);
      else localStorage.removeItem(persistKey);
      return { currentId: id, sessionId: null, tabs: [], activePath: null, tree: [] };
    });
  },
  setSessionId: (id) => set({ sessionId: id }),
  setRules: (rules) => set({ rules }),
  setNotice: (notice) => set({ notice }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setTree: (tree) => set({ tree }),
  openTab: (tab) =>
    set((s) => {
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
  markSaved: (path, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, content, original: content } : t))
    })),
  closeTab: (path) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.path !== path);
      const activePath = s.activePath === path ? (tabs[tabs.length - 1]?.path ?? null) : s.activePath;
      return { tabs, activePath };
    }),
  setActivePath: (path) => set({ activePath: path }),
  setPendingDiff: (pendingDiff) =>
    set((s) => ({
      pendingDiff,
      rightPanel: pendingDiff ? "canvas" : s.rightPanel
    })),
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
