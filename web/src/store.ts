import { create } from "zustand";
import type { Project, RulesPayload } from "./api";

export type FileTab = {
  path: string;
  content: string;
  original: string;
};

export type TreeNode = {
  name: string;
  rel: string;
  type: "file" | "dir";
  children?: TreeNode[];
};

type State = {
  projects: Project[];
  currentId: string | null;
  rules: RulesPayload | null;
  notice: string | null;
  tree: TreeNode[];
  tabs: FileTab[];
  activePath: string | null;
  setProjects: (projects: Project[]) => void;
  setCurrentId: (id: string | null) => void;
  setRules: (rules: RulesPayload | null) => void;
  setNotice: (notice: string | null) => void;
  setTree: (tree: TreeNode[]) => void;
  openTab: (tab: FileTab) => void;
  setTabContent: (path: string, content: string) => void;
  markSaved: (path: string, content: string) => void;
  closeTab: (path: string) => void;
  setActivePath: (path: string | null) => void;
};

const persistKey = "wb.currentProject";

export const useWorkbench = create<State>((set) => ({
  projects: [],
  currentId: localStorage.getItem(persistKey),
  rules: null,
  notice: null,
  tree: [],
  tabs: [],
  activePath: null,
  setProjects: (projects) => set({ projects }),
  setCurrentId: (id) => {
    if (id) localStorage.setItem(persistKey, id);
    else localStorage.removeItem(persistKey);
    set({ currentId: id, tabs: [], activePath: null, tree: [] });
  },
  setRules: (rules) => set({ rules }),
  setNotice: (notice) => set({ notice }),
  setTree: (tree) => set({ tree }),
  openTab: (tab) =>
    set((s) => {
      const exists = s.tabs.some((t) => t.path === tab.path);
      return {
        tabs: exists ? s.tabs : [...s.tabs, tab],
        activePath: tab.path
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
  setActivePath: (path) => set({ activePath: path })
}));
