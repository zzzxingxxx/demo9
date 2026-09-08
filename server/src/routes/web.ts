import { Hono } from "hono";
import { z } from "zod";
import { publicError } from "../lib/env.js";
import { extractHtmlText, fetchUrlHtml, ingestUrlPayload, webSearch } from "../lib/urlIngest.js";

export const webRoutes = new Hono();

webRoutes.get("/api/web/search", async (c) => {
  try {
    const q = c.req.query("q") || "";
    const results = await webSearch(q);
    return c.json({ results, query: q });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});

webRoutes.post("/api/web/fetch", async (c) => {
  try {
    const body = z.object({ url: z.string().min(1) }).parse(await c.req.json());
    const html = await fetchUrlHtml(body.url);
    const extracted = extractHtmlText(html);
    const ingested = ingestUrlPayload(body.url, html);
    return c.json({
      url: body.url,
      title: extracted.title,
      text: extracted.text.slice(0, 12000),
      sourceName: ingested.sourceName
    });
  } catch (err) {
    return c.json(publicError(err), 400);
  }
});
