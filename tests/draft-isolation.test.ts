import { afterEach, describe, expect, it, vi } from "vitest";

describe("project drafts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  it("restores drafts across switches and reloads without accepting another project's diff or save", async () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) || null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key)
    });
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      confirm: () => false
    });
    const { useWorkbench } = await import("../web/src/store.ts");
    const state = () => useWorkbench.getState();
    state().setCurrentId("A");
    state().openTab(
      { path: "a.txt", content: "before", original: "before" },
      "A"
    );
    state().setTabContent("a.txt", "draft");
    state().setComposerDraft("message draft");
    state().setPendingDiff({
      projectId: "A",
      path: "a.txt",
      before: "before",
      after: "after",
      diff: "patch"
    });
    state().closeTab("a.txt");
    expect(state().tabs).toHaveLength(1);
    state().setCurrentId("B");
    expect(state().pendingDiff).toBeNull();
    expect(state().tabs).toEqual([]);
    state().openTab(
      { path: "late.txt", content: "wrong", original: "wrong" },
      "A"
    );
    expect(state().tabs).toEqual([]);
    state().setPendingDiff({
      projectId: "A",
      path: "a.txt",
      before: "before",
      after: "after",
      diff: "patch"
    });
    expect(state().pendingDiff).toBeNull();
    state().setCurrentId("A");
    expect(state().tabs[0]?.content).toBe("draft");
    expect(state().composerDraft).toBe("message draft");
    state().markSaved("a.txt", "older save", "A");
    expect(state().tabs[0]).toMatchObject({
      content: "draft",
      original: "older save"
    });
    vi.resetModules();
    const restored = (
      await import("../web/src/store.ts")
    ).useWorkbench.getState();
    expect(restored.tabs[0]?.content).toBe("draft");
    expect(restored.pendingDiff?.projectId).toBe("A");
  });
});
