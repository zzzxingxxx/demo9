import { describe, expect, it } from "vitest";
import { MISSING_API_KEY_CODE } from "../shared/src/index.ts";
import { getMissingKeyError, publicError } from "../server/src/lib/env.ts";
import { app } from "../server/src/app.ts";

describe("missing XAI_API_KEY", () => {
  it("getMissingKeyError returns a readable JSON body without a stack", () => {
    const body = getMissingKeyError({ XAI_MODEL: "grok-4.5" });
    expect(body).not.toBeNull();
    expect(body?.code).toBe(MISSING_API_KEY_CODE);
    expect(body?.error).toContain("XAI_API_KEY");
    expect(body?.error).not.toMatch(/\n\s+at\s+/);
    expect(JSON.stringify(body)).not.toContain("Error:");
  });

  it("getMissingKeyError is silent when a key is present", () => {
    expect(getMissingKeyError({ XAI_API_KEY: "xai-test" })).toBeNull();
    expect(getMissingKeyError({ XAI_API_KEY: "  xai-test  " })).toBeNull();
  });

  it("POST /api/chat uses that body as the response, not a stack dump", async () => {
    const prev = process.env.XAI_API_KEY;
    delete process.env.XAI_API_KEY;
    try {
      const res = await app.request("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [] })
      });
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).not.toMatch(/\n\s+at\s+/);
      const body = JSON.parse(text) as { code: string; error: string };
      expect(body).toEqual(getMissingKeyError({}));
      expect(body.code).toBe(MISSING_API_KEY_CODE);
    } finally {
      if (prev === undefined) delete process.env.XAI_API_KEY;
      else process.env.XAI_API_KEY = prev;
    }
  });

  it("publicError never copies a stack trace into the API body", () => {
    const err = new Error("boom");
    err.stack = "Error: boom\n    at Object.<anonymous> (x.ts:1:1)";
    const body = publicError(err);
    expect(body.error).toBe("boom");
    expect(body.error).not.toContain("at Object");
    expect(JSON.stringify(body)).not.toContain("x.ts");
  });
});
