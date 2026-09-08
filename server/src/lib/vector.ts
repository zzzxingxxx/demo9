export const EMBED_DIM = 48;

export function embedText(text: string): number[] {
  const vec = Array.from({ length: EMBED_DIM }, () => 0);
  const toks = text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
  for (const tok of toks) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % EMBED_DIM;
    vec[idx] = (vec[idx] ?? 0) + 1;
  }
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}

export type RankedVector = { id: string; score: number; text?: string };

export function rankByEmbedding(
  query: number[],
  items: Array<{ id: string; vector: number[]; text?: string }>
): RankedVector[] {
  return items
    .map((item) => ({ id: item.id, score: cosine(query, item.vector), text: item.text }))
    .sort((a, b) => b.score - a.score);
}

export function citationOffsets(text: string, query: string): { start: number; end: number; snippet: string } {
  const q = query.trim();
  if (!q) return { start: 0, end: 0, snippet: text.slice(0, 80) };
  const lower = text.toLowerCase();
  const at = lower.indexOf(q.toLowerCase());
  if (at < 0) {
    const tok = q.toLowerCase().split(/\s+/)[0] ?? "";
    const tAt = tok ? lower.indexOf(tok) : -1;
    const start = tAt < 0 ? 0 : tAt;
    const end = start + (tok.length || 0);
    return { start, end, snippet: text.slice(Math.max(0, start - 40), start + 80) };
  }
  return { start: at, end: at + q.length, snippet: text.slice(Math.max(0, at - 40), at + q.length + 40) };
}
