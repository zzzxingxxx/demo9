export function cosine(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  const norm = Math.sqrt(
    a.reduce((s, v) => s + v * v, 0) * b.reduce((s, v) => s + v * v, 0)
  );
  return norm ? dot / norm : 0;
}

export type RankedVector = { id: string; score: number; text?: string };

export function rankByEmbedding(
  query: number[],
  items: Array<{ id: string; vector: number[]; text?: string }>
): RankedVector[] {
  return items
    .map((item) => ({
      id: item.id,
      score: cosine(query, item.vector),
      text: item.text
    }))
    .sort((a, b) => b.score - a.score);
}

export function citationOffsets(
  text: string,
  query: string
): { start: number; end: number; snippet: string } {
  const q = query.trim();
  if (!q) return { start: 0, end: 0, snippet: text.slice(0, 80) };
  const lower = text.toLowerCase();
  const at = lower.indexOf(q.toLowerCase());
  if (at < 0) {
    const tok = q.toLowerCase().split(/\s+/)[0] ?? "";
    const tAt = tok ? lower.indexOf(tok) : -1;
    const start = tAt < 0 ? 0 : tAt;
    const end = start + (tok.length || 0);
    return {
      start,
      end,
      snippet: text.slice(Math.max(0, start - 40), start + 80)
    };
  }
  return {
    start: at,
    end: at + q.length,
    snippet: text.slice(Math.max(0, at - 40), at + q.length + 40)
  };
}
