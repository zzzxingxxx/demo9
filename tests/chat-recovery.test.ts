import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDbForTests } from "../server/src/lib/db/index.ts";
import { createProject } from "../server/src/lib/projects.ts";
import {
  createSession,
  addMessage,
  listMessages,
  commitChatTurn
} from "../server/src/lib/sessions.ts";
import { readChatStream } from "../web/src/lib/chatStream.ts";

const model = vi.hoisted(() => ({
  mode: "success",
  started: 0,
  captured: null as unknown
}));
vi.mock("../server/src/lib/chat/stream.js", () => ({
  streamWorkbenchChat: (options: { abortSignal: AbortSignal }) => {
    model.started++;
    model.captured = options;
    return {
      totalUsage: Promise.resolve({ inputTokens: 3, outputTokens: 4 }),
      fullStream: (async function* () {
        yield { type: "text-delta", text: "new answer" };
        if (model.mode === "wait")
          await new Promise<void>((resolve) => {
            if (options.abortSignal.aborted) resolve();
            else
              options.abortSignal.addEventListener("abort", () => resolve(), {
                once: true
              });
          });
        if (options.abortSignal.aborted) {
          yield { type: "abort" };
          return;
        }
        if (model.mode === "error") {
          yield { type: "error", error: new Error("provider failed") };
          return;
        }
        yield { type: "finish", finishReason: "stop" };
      })()
    };
  }
}));
import { chatRoutes } from "../server/src/routes/chat.ts";

describe("chat persistence and isolation", () => {
  let root: string;
  let projectId: string;
  beforeEach(async () => {
    resetDbForTests();
    root = await fs.mkdtemp(path.join(os.tmpdir(), "wb-chat-"));
    vi.stubEnv("DATABASE_URL", "file::memory:");
    vi.stubEnv("XAI_API_KEY", "fixture-only");
    vi.stubEnv("EMBEDDING_BASE_URL", "");
    vi.stubEnv("EMBEDDING_MODEL", "");
    projectId = (
      await createProject(await getDb(), { name: "A", rootPath: root })
    ).id;
    model.mode = "success";
    model.started = 0;
  });
  afterEach(async () => {
    resetDbForTests();
    vi.unstubAllEnvs();
    await fs.rm(root, {
      recursive: true,
      force: true,
      maxRetries: 15,
      retryDelay: 100
    });
  });
  const request = (body: unknown, signal?: AbortSignal) =>
    chatRoutes.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal
    });
  async function history() {
    const db = await getDb();
    const session = await createSession(db, projectId);
    const user = await addMessage(db, session.id, "user", "old question");
    const answer = await addMessage(db, session.id, "assistant", "old answer");
    return { db, session, user, answer };
  }
  it("accepts a null new-session ID and commits both messages before done", async () => {
    const response = await request({
      projectId,
      sessionId: null,
      content: "hello"
    });
    expect(response.status).toBe(200);
    let text = "";
    await readChatStream(response, (delta) => {
      text += delta;
    });
    expect(text).toBe("new answer");
    expect(
      (
        await listMessages(await getDb(), response.headers.get("x-session-id")!)
      ).map((m) => m.content)
    ).toEqual(["hello", "new answer"]);
  });
  it("rejects another project's session without modifying it", async () => {
    const { db, session } = await history();
    const other = await createProject(db, { name: "B" });
    expect(
      (
        await request({
          projectId: other.id,
          sessionId: session.id,
          content: "wrong"
        })
      ).status
    ).toBe(404);
    expect(model.started).toBe(0);
    expect((await listMessages(db, session.id)).length).toBe(2);
  });
  it("keeps history when an edited reference cannot be read", async () => {
    const { db, session, user } = await history();
    const response = await request({
      projectId,
      sessionId: session.id,
      content: '@文件 "missing notes.txt"',
      truncateFromMessageId: user.id
    });
    expect(response.status).toBe(400);
    expect((await listMessages(db, session.id)).map((m) => m.content)).toEqual([
      "old question",
      "old answer"
    ]);
  });
  it("restores history after partial output and provider failure, and permits retry", async () => {
    const { db, session, answer } = await history();
    model.mode = "error";
    await expect(
      readChatStream(
        await request({
          projectId,
          sessionId: session.id,
          regenerateFromMessageId: answer.id
        }),
        () => {}
      )
    ).rejects.toThrow("provider failed");
    expect((await listMessages(db, session.id)).map((m) => m.content)).toEqual([
      "old question",
      "old answer"
    ]);
    model.mode = "success";
    await readChatStream(
      await request({
        projectId,
        sessionId: session.id,
        regenerateFromMessageId: answer.id
      }),
      () => {}
    );
    expect((await listMessages(db, session.id)).map((m) => m.content)).toEqual([
      "old question",
      "new answer"
    ]);
  });
  it("prevents overlapping requests and preserves history when cancelled", async () => {
    const { db, session } = await history();
    model.mode = "wait";
    const controller = new AbortController();
    const response = await request(
      { projectId, sessionId: session.id, content: "pending" },
      controller.signal
    );
    const reader = response.body!.getReader();
    await reader.read();
    expect(
      (await request({ projectId, sessionId: session.id, content: "overlap" }))
        .status
    ).toBe(409);
    await reader.cancel();
    controller.abort();
    await vi.waitFor(() =>
      expect(
        (model.captured as { abortSignal: AbortSignal }).abortSignal.aborted
      ).toBe(true)
    );
    expect((await listMessages(db, session.id)).map((m) => m.content)).toEqual([
      "old question",
      "old answer"
    ]);
  });
  it("rejects a stale commit without deleting newly added messages", async () => {
    const { db, session } = await history();
    const original = await listMessages(db, session.id);
    await addMessage(db, session.id, "user", "concurrent");
    await expect(
      commitChatTurn(db, session, original, [], "replacement", "answer")
    ).rejects.toThrow("会话已发生变化");
    expect((await listMessages(db, session.id)).map((m) => m.content)).toEqual([
      "old question",
      "old answer",
      "concurrent"
    ]);
  });
});
