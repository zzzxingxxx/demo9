import { describe, expect, it } from "vitest";
import { citationOffsets, rankByEmbedding } from "../server/src/lib/vector.ts";

describe("vector rank on fixture embeddings", () => {
  it("ranks the closer embedding first and returns citation offsets", () => {
    const query = [1, 0, 0];
    const ranked = rankByEmbedding(query, [
      { id: "miss", vector: [0, 1, 0], text: "unrelated" },
      {
        id: "hit",
        vector: [0.9, 0.1, 0],
        text: "alpha architecture sqlite fts"
      }
    ]);
    expect(ranked[0]?.id).toBe("hit");
    expect(ranked[0]?.score ?? 0).toBeGreaterThan(ranked[1]?.score ?? 1);
    const source = "prefix alpha architecture sqlite suffix";
    const cite = citationOffsets(source, "architecture");
    expect(source.slice(cite.start, cite.end)).toBe("architecture");
    expect(cite.snippet).toContain("architecture");
  });
});
