import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyUnifiedDiff } from "../shared/src/diff.ts";
import { applyAgentItem, commitAgentItem, parseAgentPlan, previewAgentItem } from "../server/src/lib/agent.ts";

describe("multi-file plan to diff apply after confirm", () => {
  const clean: string[] = [];
  afterEach(async () => {
    await Promise.all(clean.splice(0).map((p) => fs.rm(p, { recursive: true, force: true })));
  });

  it("parses a plan, previews the real before/after diff, and writes only after confirm", async () => {
    const markdown = ["### src/a.ts", "```ts", "export const n = 2", "```", "", "### src/b.ts", "```ts", "export const b = 1", "```"].join(
      "\n"
    );
    const plan = parseAgentPlan(markdown);
    expect(plan.map((p) => p.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(plan[0]?.after).toContain("export const n = 2");
    const before = "export const n = 1\n";
    const preview = previewAgentItem(before, plan[0]!);
    expect(preview.written).toBe(false);
    expect(preview.before).toBe(before);
    expect(preview.after).toContain("export const n = 2");
    expect(preview.diff).toContain("-export const n = 1");
    expect(preview.diff).toContain("+export const n = 2");
    expect(applyUnifiedDiff(preview.before, preview.diff)).toBe(preview.after);

    const dry = applyAgentItem(before, plan[0]!, false);
    expect(dry.written).toBe(false);
    expect(dry.before).toBe(before);
    expect(dry.diff).toBe(preview.diff);

    const root = await fs.mkdtemp(path.join(os.tmpdir(), "wb-agent-"));
    clean.push(root);
    await fs.mkdir(path.join(root, "src"));
    await fs.writeFile(path.join(root, "src", "a.ts"), before, "utf8");
    const skipped = await commitAgentItem(root, before, plan[0]!, false);
    expect(skipped.written).toBe(false);
    expect(await fs.readFile(path.join(root, "src", "a.ts"), "utf8")).toBe(before);

    const written = await commitAgentItem(root, before, plan[0]!, true);
    expect(written.written).toBe(true);
    expect(written.before).toBe(before);
    expect(await fs.readFile(path.join(root, "src", "a.ts"), "utf8")).toBe(plan[0]!.after);
  });
});
