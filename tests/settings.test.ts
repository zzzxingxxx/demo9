import { describe, expect, it } from "vitest";
import { MODEL_OPTIONS, parseTheme, SHORTCUTS } from "../shared/src/settings.ts";

describe("settings helpers", () => {
  it("parseTheme only accepts light/dark and shortcuts include Ctrl+K", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("neon")).toBe("light");
    expect(parseTheme(null)).toBe("light");
    expect(MODEL_OPTIONS).toContain("grok-4.5");
    expect(SHORTCUTS.some((s) => s.keys === "Ctrl+K")).toBe(true);
  });
});
