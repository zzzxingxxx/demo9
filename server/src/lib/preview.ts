export type PreviewKind = "code" | "markdown" | "csv" | "image" | "pdf";

export function previewKind(rel: string): PreviewKind {
  const ext = (rel.split(".").pop() || "").toLowerCase();
  if (ext === "csv") return "csv";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "md" || ext === "markdown") return "markdown";
  return "code";
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() && rows.length === 0) continue;
    const cells: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") {
        cells.push(cur);
        cur = "";
      } else cur += c;
    }
    cells.push(cur);
    if (line.length > 0 || cells.some((x) => x.length)) rows.push(cells);
  }
  return rows;
}
