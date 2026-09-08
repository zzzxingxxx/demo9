export type MdBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "code"; lang: string; code: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

export type InlineSpan =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "bold"; value: string }
  | { type: "link"; text: string; href: string };

export function parseMarkdown(src: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const lang = fence[1] || "";
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: "code", lang, code: body.join("\n") + (body.length ? "\n" : "") });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1]?.length ?? 1, text: heading[2] ?? "" });
      i += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const cur = lines[i] ?? "";
      if (!cur.trim()) break;
      if (/^(#{1,6})\s+/.test(cur) || cur.startsWith("```") || /^\s*[-*]\s+/.test(cur)) break;
      para.push(cur);
      i += 1;
    }
    blocks.push({ type: "paragraph", text: para.join("\n") });
  }
  return blocks;
}

export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) spans.push({ type: "text", value: text.slice(last, match.index) });
    const raw = match[0];
    if (raw.startsWith("`")) spans.push({ type: "code", value: raw.slice(1, -1) });
    else if (raw.startsWith("**")) spans.push({ type: "bold", value: raw.slice(2, -2) });
    else {
      const link = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) spans.push({ type: "link", text: link[1] ?? "", href: link[2] ?? "" });
      else spans.push({ type: "text", value: raw });
    }
    last = match.index + raw.length;
  }
  if (last < text.length) spans.push({ type: "text", value: text.slice(last) });
  return spans.length ? spans : [{ type: "text", value: text }];
}
