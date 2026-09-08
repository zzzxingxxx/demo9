import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDbForTests } from "../server/src/lib/db/index.ts";
import { createProject, deleteProject } from "../server/src/lib/projects.ts";
import { addMessage, createSession } from "../server/src/lib/sessions.ts";
import {
  addKnowledge,
  attachKnowledgeSlices,
  getKnowledge,
  vectorSearchKnowledge
} from "../server/src/lib/knowledge.ts";
import {
  createScheduledTask,
  listScheduledTasks,
  tickScheduledTasks
} from "../server/src/lib/schedule.ts";
import {
  applyDiffToProject,
  readProjectFile,
  writeProjectFile
} from "../server/src/lib/files.ts";
import { saveProviderSettings } from "../server/src/lib/providerSettings.ts";
import { buildProjectBundle } from "../server/src/lib/bundle.ts";
import { createUnifiedDiff, applyUnifiedDiff } from "../shared/src/diff.ts";
import {
  loadGitStatus,
  performCommit,
  runGit
} from "../server/src/lib/gitWork.ts";
import { listMcpToolsFromProcess, callMcpTool } from "../server/src/lib/mcp.ts";
import {
  startTerminalSession,
  getTerminalSession,
  stopTerminalSession,
  closeProjectTerminals
} from "../server/src/lib/terminalSessions.ts";
import { app } from "../server/src/app.ts";

describe("complete workbench workflows", () => {
  let root: string;
  let projectId: string;
  beforeEach(async () => {
    resetDbForTests();
    root = await fs.mkdtemp(path.join(os.tmpdir(), "wb-workflows-"));
    vi.stubEnv("DATABASE_URL", "file::memory:");
    vi.stubEnv("REPO_ROOT", root);
    projectId = (
      await createProject(await getDb(), { name: "test", rootPath: root })
    ).id;
  });
  afterEach(async () => {
    closeProjectTerminals();
    resetDbForTests();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await fs.rm(root, {
      recursive: true,
      force: true,
      maxRetries: 15,
      retryDelay: 100
    });
  });
  const send = (url: string, method: string, body?: unknown) =>
    app.request(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  it("rejects stale file saves and patches, including mismatched patch contents", async () => {
    await writeProjectFile(root, "file.txt", "before", true);
    await writeProjectFile(root, "file.txt", "external", true, "before");
    await expect(
      writeProjectFile(root, "file.txt", "stale", true, "before")
    ).rejects.toThrow("文件已被修改");
    await expect(
      applyDiffToProject(
        root,
        "file.txt",
        createUnifiedDiff("file.txt", "before", "after"),
        true,
        "before"
      )
    ).rejects.toThrow();
    expect(() =>
      applyUnifiedDiff("external", createUnifiedDiff("x", "before", "after"))
    ).toThrow();
    expect(await fs.readFile(path.join(root, "file.txt"), "utf8")).toBe(
      "external"
    );
  });
  it("rejects files reached through directory links outside the bound root", async () => {
    const bound = path.join(root, "bound");
    const outside = path.join(root, "outside");
    await fs.mkdir(bound);
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "secret.txt"), "keep");
    await fs.symlink(
      outside,
      path.join(bound, "link"),
      process.platform === "win32" ? "junction" : "dir"
    );
    await expect(readProjectFile(bound, "link/secret.txt")).rejects.toThrow(
      "超出项目目录"
    );
    await expect(
      writeProjectFile(bound, "link/new.txt", "bad", true)
    ).rejects.toThrow("超出项目目录");
  });
  it("validates Agent plans and refuses stale content or changed bindings", async () => {
    await fs.writeFile(path.join(root, "file.txt"), "original");
    const response = await send("/api/agent/plan", "POST", {
      projectId,
      markdown: "### file.txt\n```txt\nchanged\n```"
    });
    expect(response.status).toBe(200);
    const plan = await response.json();
    expect(plan.items[0].before).toBe("original");
    expect(plan.rootPath).toBe(root);
    expect(
      (
        await send("/api/agent/apply", "POST", {
          projectId,
          path: "file.txt",
          after: "changed",
          expectedContent: "old",
          confirm: true
        })
      ).status
    ).toBe(400);
    expect(
      (
        await send("/api/files/content", "PUT", {
          projectId,
          path: "file.txt",
          content: "wrong",
          expectedRootPath: path.join(root, "other"),
          confirm: true
        })
      ).status
    ).toBe(400);
    expect(await fs.readFile(path.join(root, "file.txt"), "utf8")).toBe(
      "original"
    );
    expect(
      (
        await send("/api/agent/apply", "POST", {
          projectId,
          path: "file.txt",
          after: "changed",
          expectedContent: "original",
          expectedRootPath: root,
          confirm: true
        })
      ).status
    ).toBe(200);
  });
  it("keeps provider secrets out of settings responses and project exports", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    vi.stubEnv("EMBEDDING_API_KEY", "");
    const db = await getDb();
    await saveProviderSettings(db, {
      xaiApiKey: "secret-fixture-xai",
      embeddingApiKey: "secret-fixture-vector"
    });
    const settings = await (await send("/api/settings", "GET")).text();
    expect(settings).not.toContain("secret-fixture");
    expect(settings).toContain('"keyConfigured":true');
    expect(
      JSON.stringify(await buildProjectBundle(db, projectId))
    ).not.toContain("secret-fixture");
  });
  it("updates and deletes knowledge, keeping search and indexes consistent", async () => {
    const db = await getDb();
    const doc = await addKnowledge(db, {
      projectId,
      filename: "long notes.md",
      tags: [],
      text: "x".repeat(5000) + " needle content",
      bytes: new Uint8Array(),
      storeDir: path.join(root, "data", "knowledge")
    });
    const attached = attachKnowledgeSlices(
      [doc],
      "long notes.md",
      4000,
      "needle"
    );
    expect(attached.length).toBeGreaterThan(0);
    expect(attached.length).toBeLessThanOrEqual(4000);
    expect(attached).toContain("needle");
    expect(
      (
        await send(`/api/knowledge/${doc.id}`, "PATCH", {
          title: "Updated",
          tags: "tag",
          text: "searchable changed"
        })
      ).status
    ).toBe(200);
    expect((await getKnowledge(db, doc.id))?.title).toBe("Updated");
    expect((await send(`/api/knowledge/${doc.id}`, "DELETE")).status).toBe(200);
    expect(await getKnowledge(db, doc.id)).toBeUndefined();
    expect(
      (
        await db
          .select()
          .from(
            (await import("../server/src/lib/db/schema.ts")).knowledgeVectors
          )
      ).length
    ).toBe(0);
  });
  it("uses provider embeddings, caches by model, and refreshes on changed configuration", async () => {
    vi.stubEnv("EMBEDDING_BASE_URL", "http://embedding.fixture/v1");
    vi.stubEnv("EMBEDDING_MODEL", "fixture");
    const mockFetch = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return Response.json({
        data: body.input.map((text: string, index: number) => ({
          index,
          embedding: /car|automobile/.test(text) ? [1, 0] : [0, 1]
        }))
      });
    });
    vi.stubGlobal("fetch", mockFetch);
    const db = await getDb();
    const doc = await addKnowledge(db, {
      projectId,
      filename: "transport.md",
      tags: [],
      text: "automobile",
      bytes: new Uint8Array(),
      storeDir: path.join(root, "data", "knowledge")
    });
    const hits = await vectorSearchKnowledge(db, projectId, "car");
    expect(hits[0]?.docId).toBe(doc.id);
    expect(hits[0]?.score).toBe(1);
    await vectorSearchKnowledge(db, projectId, "car");
    expect(mockFetch).toHaveBeenCalledTimes(3);
    vi.stubEnv("EMBEDDING_MODEL", "fixture-2");
    await vectorSearchKnowledge(db, projectId, "car");
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });
  it("pauses, edits, runs and deletes schedules and claims each due task once", async () => {
    const db = await getDb();
    const task = await createScheduledTask(db, {
      projectId,
      title: "task",
      intervalMs: 30000,
      action: "log",
      payload: "once"
    });
    const fired = await Promise.all([
      tickScheduledTasks(db, task.nextRun),
      tickScheduledTasks(db, task.nextRun)
    ]);
    expect(fired.flat()).toHaveLength(1);
    expect(
      (
        await send(`/api/schedule/${task.id}`, "PATCH", {
          enabled: false,
          title: "paused"
        })
      ).status
    ).toBe(200);
    expect(await tickScheduledTasks(db, task.nextRun + 90000)).toEqual([]);
    expect(
      (await send(`/api/schedule/${task.id}/run`, "POST", {})).status
    ).toBe(200);
    expect((await listScheduledTasks(db, projectId))[0]?.lastResult).toContain(
      "paused"
    );
    expect((await send(`/api/schedule/${task.id}`, "DELETE")).status).toBe(200);
    expect(await listScheduledTasks(db, projectId)).toEqual([]);
  });
  it("commits only selected files while preserving unrelated staging and special filenames", async () => {
    const repo = path.join(root, "repo");
    await fs.mkdir(repo);
    await runGit(repo, ["init"]);
    await runGit(repo, ["config", "user.name", "Fixture"]);
    await runGit(repo, ["config", "user.email", "fixture@example.invalid"]);
    await fs.writeFile(path.join(repo, "a file.txt"), "a");
    await fs.writeFile(path.join(repo, "unrelated.txt"), "b");
    await runGit(repo, ["add", "--", "unrelated.txt"]);
    await performCommit(repo, "selected", true, ["a file.txt"]);
    expect(
      (await runGit(repo, ["show", "--pretty=", "--name-only", "HEAD"])).trim()
    ).toBe("a file.txt");
    expect((await loadGitStatus(repo)).entries).toEqual([
      { path: "unrelated.txt", index: "A", working_dir: " " }
    ]);
  });
  it("discovers MCP schemas, validates calls, handles tool errors and early exits", async () => {
    const config = {
      name: "fixture",
      command: process.execPath,
      args: [path.resolve("server/test-fixtures/mcp-server.mjs")]
    };
    const tools = await listMcpToolsFromProcess(config);
    expect(tools.find((t) => t.name === "echo")?.inputSchema).toMatchObject({
      required: ["text"]
    });
    expect(await callMcpTool(config, "echo", { text: "hello" })).toBe("hello");
    await expect(callMcpTool(config, "echo", { text: 123 })).rejects.toThrow(
      "schema"
    );
    await expect(callMcpTool(config, "fail", {})).rejects.toThrow(
      "fixture failure"
    );
    await expect(
      listMcpToolsFromProcess(
        {
          name: "exit",
          command: process.execPath,
          args: ["-e", "process.exit(0)"]
        },
        500
      )
    ).rejects.toThrow();
    await expect(
      listMcpToolsFromProcess(
        {
          name: "timeout",
          command: process.execPath,
          args: ["-e", "setInterval(()=>{},1000)"]
        },
        200
      )
    ).rejects.toThrow();
  }, 20000);
  it("streams terminal output, accepts input, isolates sessions and stops processes", async () => {
    const session = startTerminalSession(
      projectId,
      root,
      process.platform === "win32"
        ? "$value = Read-Host 'INPUT'; Write-Output ('RECEIVED:' + $value); Start-Sleep -Seconds 30"
        : "echo INPUT; read value; echo RECEIVED:$value; sleep 30",
      true
    );
    await vi.waitFor(
      () =>
        expect(getTerminalSession(projectId, session.id).output).toContain(
          "INPUT"
        ),
      { timeout: 10000 }
    );
    expect(() => getTerminalSession("other", session.id)).toThrow("不存在");
    getTerminalSession(projectId, session.id).process.write("test-input\r");
    await vi.waitFor(
      () =>
        expect(getTerminalSession(projectId, session.id).output).toContain(
          "RECEIVED:test-input"
        ),
      { timeout: 10000 }
    );
    stopTerminalSession(projectId, session.id);
    await vi.waitFor(
      () =>
        expect(getTerminalSession(projectId, session.id).running).toBe(false),
      { timeout: 10000 }
    );
  }, 30000);
  it("deletes only project-owned data", async () => {
    const db = await getDb();
    const session = await createSession(db, projectId);
    await addMessage(db, session.id, "user", "hello");
    await createScheduledTask(db, {
      projectId,
      title: "owned",
      intervalMs: 30000,
      action: "log"
    });
    const other = await createProject(db, { name: "other" });
    const otherSession = await createSession(db, other.id);
    await addMessage(db, otherSession.id, "user", "keep");
    await deleteProject(db, projectId);
    const schema = await import("../server/src/lib/db/schema.ts");
    expect(
      (await db.select().from(schema.messages)).map((m) => m.content)
    ).toEqual(["keep"]);
    expect(await listScheduledTasks(db, projectId)).toEqual([]);
  });
});
