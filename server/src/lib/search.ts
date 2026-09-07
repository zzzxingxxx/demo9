export type SearchItem = {
  kind: "project" | "session" | "file" | "knowledge" | "skill";
  id: string;
  title: string;
  hint?: string;
};

export function matchSearch(query: string, items: SearchItem[]): SearchItem[] {
  const q = query.trim().toLowerCase();
  const ranked = q
    ? items.filter((item) => {
        const hay = `${item.title} ${item.hint || ""} ${item.kind}`.toLowerCase();
        return hay.includes(q);
      })
    : items;
  return ranked.slice(0, 30);
}

export function flattenFileNames(
  nodes: Array<{ rel: string; type: string; children?: unknown[] }>,
  acc: SearchItem[] = []
): SearchItem[] {
  for (const node of nodes) {
    if (node.type === "file") acc.push({ kind: "file", id: node.rel, title: node.rel });
    if (Array.isArray(node.children)) flattenFileNames(node.children as typeof nodes, acc);
  }
  return acc;
}
