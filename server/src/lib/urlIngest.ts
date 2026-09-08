export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function extractHtmlText(html: string): { title: string; text: string } {
  const titleRaw = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const text = decodeHtmlEntities(stripped).replace(/\s+/g, " ").trim();
  const title = decodeHtmlEntities(titleRaw).replace(/\s+/g, " ").trim();
  return { title, text };
}

export function parseSearchResults(html: string): Array<{ title: string; url: string }> {
  const out: Array<{ title: string; url: string }> = [];
  const re = /<a\s[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const url = match[1] ?? "";
    const title = decodeHtmlEntities((match[2] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!url || !title) continue;
    if (out.some((x) => x.url === url)) continue;
    out.push({ title, url });
    if (out.length >= 8) break;
  }
  return out;
}

export function assertHttpUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw Object.assign(new Error("无效的 URL"), { code: "INVALID_URL", error: "无效的 URL" });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw Object.assign(new Error("只允许 http(s) URL"), { code: "INVALID_URL", error: "只允许 http(s) URL" });
  }
  return parsed;
}

export async function fetchUrlHtml(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const parsed = assertHttpUrl(url);
  const res = await fetchImpl(parsed.toString(), {
    redirect: "follow",
    headers: { "User-Agent": "ai-workbench/0.0.1" }
  });
  if (!res.ok) {
    throw Object.assign(new Error(`抓取失败 HTTP ${res.status}`), {
      code: "FETCH_FAILED",
      error: `抓取失败 HTTP ${res.status}`
    });
  }
  return res.text();
}

export async function webSearch(
  query: string,
  fetchImpl: typeof fetch = fetch
): Promise<Array<{ title: string; url: string }>> {
  const q = query.trim();
  if (!q) return [];
  const html = await fetchUrlHtml(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
    fetchImpl
  );
  return parseSearchResults(html);
}

export function ingestUrlPayload(url: string, html: string): { title: string; text: string; sourceName: string } {
  const extracted = extractHtmlText(html);
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();
  return {
    title: extracted.title || host,
    text: extracted.text,
    sourceName: url
  };
}
