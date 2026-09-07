import { describe, expect, it } from "vitest";
import { languageFromPath } from "../web/src/lib/languageFromPath.ts";

describe("Monaco language from path", () => {
  it("maps code and markdown extensions used by the canvas", () => {
    expect(languageFromPath("src/app.ts")).toBe("typescript");
    expect(languageFromPath("src/app.tsx")).toBe("typescript");
    expect(languageFromPath("web/src/main.jsx")).toBe("javascript");
    expect(languageFromPath("README.md")).toBe("markdown");
    expect(languageFromPath("notes.TXT")).toBe("plaintext");
    expect(languageFromPath("pkg.json")).toBe("json");
    expect(languageFromPath("noext")).toBe("plaintext");
    expect(languageFromPath(".gitignore")).toBe("plaintext");
  });
});
