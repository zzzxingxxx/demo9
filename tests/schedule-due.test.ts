import { describe, expect, it } from "vitest";
import {
  advanceTask,
  executeScheduledAction,
  interpretScheduledAction,
  selectDueTasks
} from "../server/src/lib/schedule.ts";

describe("scheduled-task due selection", () => {
  it("selects enabled tasks whose nextRun is due and advances them", () => {
    const tasks = [
      { id: "due", enabled: true, nextRun: 100, intervalMs: 50 },
      { id: "later", enabled: true, nextRun: 400, intervalMs: 50 },
      { id: "off", enabled: false, nextRun: 50, intervalMs: 50 }
    ];
    const due = selectDueTasks(tasks, 200);
    expect(due.map((t) => t.id)).toEqual(["due"]);
    const advanced = advanceTask(due[0]!, 200);
    expect(advanced.nextRun).toBeGreaterThan(200);
    expect(selectDueTasks([advanced], 200)).toEqual([]);
  });

  it("interpretScheduledAction maps log and run, and executeScheduledAction uses injected run", async () => {
    expect(interpretScheduledAction({ action: "log", payload: "note", title: "t" })).toEqual({
      kind: "log",
      message: "t · note"
    });
    expect(interpretScheduledAction({ action: "run", payload: "echo hi", title: "t" })).toMatchObject({
      kind: "run",
      command: "echo hi"
    });
    const logged = await executeScheduledAction(
      { action: "log", payload: "ok", title: "tick", projectId: "p" },
      {}
    );
    expect(logged).toContain("tick");
    const ran = await executeScheduledAction(
      { action: "run", payload: "echo hi", title: "run", projectId: "p" },
      { rootPath: "/tmp", run: async (_cwd, command) => `out:${command}` }
    );
    expect(ran).toBe("out:echo hi");
  });
});
