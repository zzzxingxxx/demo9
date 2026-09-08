import { describe, expect, it } from "vitest";
import { applyAgentItem, parseAgentPlan } from "../server/src/lib/agent.ts";

describe("multi-file plan to diff apply after confirm", () => {
  it("parses a plan and applies an item only when confirm is true", () => {
    const markdown = ["### src/a.ts", "```ts", "export const n = 2", "```", "", "### src/b.ts", "```ts", "export const b = 1", "```"].join(
      "\n"
    );
    const plan = parseAgentPlan(markdown);
    expect(plan.map((p) => p.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(plan[0]?.after).toContain("export const n = 2");
    const before = "export const n = 1\n";
    expect(() => applyAgentItem(before, plan[0]!, false)).toThrow(/写盘必须用户确认/);
    const applied = applyAgentItem(before, plan[0]!, true);
    expect(applied.path).toBe("src/a.ts");
    expect(applied.content).toBe(plan[0]!.after);
    expect(applied.diff).toContain("-export const n = 1");
    expect(applied.diff).toContain("+export const n = 2");
  });
});
