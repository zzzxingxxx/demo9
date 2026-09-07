import { create } from "zustand";
import type { Project, RulesPayload } from "./api";

type State = {
  projects: Project[];
  currentId: string | null;
  rules: RulesPayload | null;
  notice: string | null;
  setProjects: (projects: Project[]) => void;
  setCurrentId: (id: string | null) => void;
  setRules: (rules: RulesPayload | null) => void;
  setNotice: (notice: string | null) => void;
};

const persistKey = "wb.currentProject";

export const useWorkbench = create<State>((set) => ({
  projects: [],
  currentId: localStorage.getItem(persistKey),
  rules: null,
  notice: null,
  setProjects: (projects) => set({ projects }),
  setCurrentId: (id) => {
    if (id) localStorage.setItem(persistKey, id);
    else localStorage.removeItem(persistKey);
    set({ currentId: id });
  },
  setRules: (rules) => set({ rules }),
  setNotice: (notice) => set({ notice })
}));
