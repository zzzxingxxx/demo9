import type { KnowledgeDoc } from "./db/schema.js";

export type KnowledgeHit = {
  id: string;
  title: string;
  tags: string;
  text: string;
  score: number;
  snippet: string;
};

export type SourceCard = {
  id: string;
  title: string;
  snippet: string;
  score: number;
};

export function tokenizeQuery(query: string): string[] {
  return (query.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).filter((t) => t.length > 0);
}

export function matchFts(haystack: string, query: string): boolean {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return false;
  const hay = haystack.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

export function snippetAround(text: string, query: string, radius = 80): string {
  const tokens = tokenizeQuery(query);
  const lower = text.toLowerCase();
  let idx = 0;
  for (const t of tokens) {
    const at = lower.indexOf(t);
    if (at >= 0) {
      idx = at;
      break;
    }
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + radius);
  const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${slice}${end < text.length ? "…" : ""}`;
}

export function matchKnowledgeQuery(docs: KnowledgeDoc[], query: string): KnowledgeHit[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];
  const hits: KnowledgeHit[] = [];
  for (const doc of docs) {
    const hay = `${doc.title}\n${doc.tags}\n${doc.text}`;
    if (!matchFts(hay, query)) continue;
    const lower = hay.toLowerCase();
    const score = tokens.reduce((n, t) => n + (lower.split(t).length - 1), 0);
    hits.push({
      id: doc.id,
      title: doc.title,
      tags: doc.tags,
      text: doc.text,
      score,
      snippet: snippetAround(doc.text || doc.title, query)
    });
  }
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

export function assembleSourceCards(hits: KnowledgeHit[]): SourceCard[] {
  return hits.map((h) => ({
    id: h.id,
    title: h.title,
    snippet: h.snippet,
    score: h.score
  }));
}

export function searchKnowledgeFts(docs: KnowledgeDoc[], query: string): SourceCard[] {
  return assembleSourceCards(matchKnowledgeQuery(docs, query));
}

export function formatSourceCardsPrompt(cards: SourceCard[]): string {
  if (cards.length === 0) return "";
  return ["回答时用来源卡片作依据：", ...cards.map((c) => `- ${c.title}: ${c.snippet}`)].join("\n");
}
