import { describe, expect, it } from "vitest";
import { flattenFileNames, matchSearch, type SearchItem } from "../server/src/lib/search.ts";

describe("global search matching", () => {
  const items: SearchItem[] = [
    { kind: "project", id: "p1", title: "工作台", hint: "F:/demo" },
    { kind: "session", id: "s1", title: "写周报" },
    { kind: "file", id: "src/app.ts", title: "src/app.ts" },
    { kind: "knowledge", id: "k1", title: "架构.md", hint: "架构" },
    { kind: "skill", id: "ask-doc", title: "问文档", hint: "只根据引用" }
  ];

  it("matchSearch filters across kinds using title and hint", () => {
    expect(matchSearch("周", items).map((i) => i.id)).toEqual(["s1"]);
    expect(matchSearch("app.ts", items).map((i) => i.kind)).toEqual(["file"]);
    expect(matchSearch("问", items).some((i) => i.kind === "skill")).toBe(true);
    expect(matchSearch("架构", items).map((i) => i.kind)).toEqual(["knowledge"]);
    expect(matchSearch("", items).length).toBe(items.length);
  });

  it("flattenFileNames collects file rels from a tree", () => {
    const files = flattenFileNames([
      { rel: "src", type: "dir", children: [{ rel: "src/app.ts", type: "file" }] },
      { rel: "README.md", type: "file" }
    ]);
    expect(files.map((f) => f.title)).toEqual(["src/app.ts", "README.md"]);
  });
});
