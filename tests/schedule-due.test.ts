import { describe, expect, it } from "vitest";
import { advanceTask, selectDueTasks } from "../server/src/lib/schedule.ts";

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
});
