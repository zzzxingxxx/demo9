import { describe, expect, it } from "vitest";
import { CHAT_MAX_STEPS, chatStopWhen } from "../server/src/lib/chat/stream.ts";

function fakeSteps(n: number) {
  return { steps: Array.from({ length: n }, () => ({})) } as Parameters<typeof chatStopWhen>[0];
}

describe("streamText multi-step stopWhen", () => {
  it("chatStopWhen continues until at least 5 completed steps", async () => {
    expect(CHAT_MAX_STEPS).toBeGreaterThanOrEqual(5);
    expect(await chatStopWhen(fakeSteps(1))).toBe(false);
    expect(await chatStopWhen(fakeSteps(CHAT_MAX_STEPS - 1))).toBe(false);
    expect(await chatStopWhen(fakeSteps(CHAT_MAX_STEPS))).toBe(true);
  });
});
