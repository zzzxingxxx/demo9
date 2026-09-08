import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "../server/src/lib/db/index.ts";
import { assembleSourceCards, matchFts, matchKnowledgeQuery, searchKnowledgeFts } from "../server/src/lib/fts.ts";
import { addKnowledge } from "../server/src/lib/knowledge.ts";
import { createProject } from "../server/src/lib/projects.ts";

describe("FTS match and source cards", () => {
  const clean: string[] = [];
  const closers: Array<() => void> = [];
  afterEach(async () => {
    for (const close of closers.splice(0)) close();
    await Promise.all(clean.splice(0).map((p) => fs.rm(p, { recursive: true, force: true }).catch(() => undefined)));
  });

  it("matchFts requires every query token and assembleSourceCards keeps snippet", () => {
    expect(matchFts("SQLite FTS 检索架构", "架构 FTS")).toBe(true);
    expect(matchFts("无关文档", "架构 FTS")).toBe(false);
    const hits = matchKnowledgeQuery(
      [
        {
          id: "1",
          projectId: "p",
          title: "架构.md",
          tags: "后端",
          sourceName: "架构.md",
          text: "分层说明使用 SQLite FTS 做检索",
          createdAt: 1
        },
        {
          id: "2",
          projectId: "p",
          title: "无关.md",
          tags: "",
          sourceName: "无关.md",
          text: "南瓜斑马",
          createdAt: 1
        }
      ],
      "架构 检索"
    );
    expect(hits.map((h) => h.title)).toEqual(["架构.md"]);
    const cards = assembleSourceCards(hits);
    expect(cards[0]?.title).toBe("架构.md");
    expect(cards[0]?.snippet).toContain("FTS");
  });

  it("searchKnowledgeFts reads stored knowledge and returns source cards", async () => {
    const data = await fs.mkdtemp(path.join(os.tmpdir(), "wb-fts-"));
    const store = await fs.mkdtemp(path.join(os.tmpdir(), "wb-kstore-"));
    clean.push(data, store);
    const opened = await openDb(path.join(data, "app.db"));
    closers.push(opened.close);
    const project = await createProject(opened.db, { name: "k" });
    await addKnowledge(opened.db, {
      projectId: project.id,
      filename: "架构.md",
      tags: ["检索"],
      text: "本机工作台用 SQLite FTS 做知识关键词检索。",
      storeDir: store,
      bytes: new TextEncoder().encode("x")
    });
    const { listKnowledge, searchProjectKnowledge } = await import("../server/src/lib/knowledge.ts");
    const docs = await listKnowledge(opened.db, project.id);
    const cards = searchKnowledgeFts(docs, "FTS 知识");
    const viaDb = await searchProjectKnowledge(opened.db, project.id, "FTS 知识");
    expect(viaDb).toEqual(cards);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.title).toBe("架构.md");
    expect(cards[0]?.snippet.toLowerCase()).toContain("fts");
  });
});
