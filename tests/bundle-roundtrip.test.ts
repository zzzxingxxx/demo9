import { describe, expect, it } from "vitest";
import { parseProjectBundle, serializeProjectBundle, type ProjectBundle } from "../server/src/lib/bundle.ts";

describe("project import/export round-trip", () => {
  it("round-trips sessions knowledge list and settings without the code tree", () => {
    const bundle: ProjectBundle = {
      version: 1,
      project: { name: "demo", description: "desc" },
      sessions: [
        {
          title: "周报",
          pinned: true,
          archived: false,
          messages: [{ role: "user", content: "写周报", starred: true }]
        }
      ],
      knowledgeList: [{ title: "a.md", tags: "x", sourceName: "a.md", text: "正文" }],
      settings: { model: "grok-4.5", theme: "dark" }
    };
    const raw = serializeProjectBundle(bundle);
    expect(raw.includes("node_modules")).toBe(false);
    const back = parseProjectBundle(raw);
    expect(back.project).toEqual(bundle.project);
    expect(back.sessions).toEqual(bundle.sessions);
    expect(back.knowledgeList).toEqual(bundle.knowledgeList);
    expect(back.settings).toEqual(bundle.settings);
  });
});
