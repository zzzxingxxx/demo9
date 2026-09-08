import { describe, expect, it } from "vitest";
import { citationOffsets, embedText, rankByEmbedding } from "../server/src/lib/vector.ts";

describe("vector rank on fixture embeddings", () => {
  it("ranks the closer embedding first and returns citation offsets", () => {
    const queryText = "alpha architecture sqlite";
    const query = embedText(queryText);
    const ranked = rankByEmbedding(query, [
      { id: "miss", vector: embedText("zebra pumpkin unrelated"), text: "zebra pumpkin unrelated" },
      { id: "hit", vector: embedText("alpha architecture sqlite fts"), text: "alpha architecture sqlite fts" }
    ]);
    expect(ranked[0]?.id).toBe("hit");
    expect(ranked[0]?.score ?? 0).toBeGreaterThan(ranked[1]?.score ?? 1);
    const source = "prefix alpha architecture sqlite suffix";
    const cite = citationOffsets(source, "architecture");
    expect(source.slice(cite.start, cite.end)).toBe("architecture");
    expect(cite.snippet).toContain("architecture");
  });
});
