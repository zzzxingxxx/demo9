import { describe, expect, it } from "vitest";
import { extractHtmlText, fetchUrlHtml, ingestUrlPayload, parseSearchResults } from "../server/src/lib/urlIngest.ts";

describe("URL ingest text extract", () => {
  it("extractHtmlText strips tags and ingestUrlPayload keeps the source URL", () => {
    const html =
      "<html><head><title>  文档 &amp; 指南 </title></head><body><script>secret()</script><p>Hello <b>world</b></p></body></html>";
    const extracted = extractHtmlText(html);
    expect(extracted.title).toBe("文档 & 指南");
    expect(extracted.text).toContain("Hello world");
    expect(extracted.text).not.toContain("secret");
    expect(extracted.text).not.toContain("<b>");
    const ingested = ingestUrlPayload("https://example.com/guide", html);
    expect(ingested.sourceName).toBe("https://example.com/guide");
    expect(ingested.title).toBe(extracted.title);
    expect(ingested.text).toBe(extracted.text);
    const hits = parseSearchResults(
      '<a href="https://a.example/x">Alpha</a><a href="https://b.example/y"><span>Beta</span></a>'
    );
    expect(hits.map((h) => h.url)).toEqual(["https://a.example/x", "https://b.example/y"]);
    expect(hits[0]?.title).toBe("Alpha");
  });

  it("fetchUrlHtml only allows http(s) and returns the response body", async () => {
    await expect(fetchUrlHtml("file:///etc/passwd")).rejects.toThrow(/http/);
    const html = await fetchUrlHtml("https://example.com/x", async () => {
      return new Response("<html><title>T</title><body>Hi</body></html>", { status: 200 });
    });
    expect(html).toContain("Hi");
    expect(extractHtmlText(html).title).toBe("T");
  });
});
