import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let root: string;
let a: string;
let b: string;
const mcpIds: string[] = [];
test.beforeEach(async ({ page, request }) => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "wb-browser-"));
  await fs.mkdir(path.join(root, "a"));
  await fs.mkdir(path.join(root, "b"));
  await fs.writeFile(
    path.join(root, "a", "notes with space.txt"),
    "original A"
  );
  await fs.writeFile(
    path.join(root, "b", "notes with space.txt"),
    "original B"
  );
  const first = await request.post("/api/projects", {
    data: { name: "Browser A", rootPath: path.join(root, "a") }
  });
  expect(first.ok()).toBeTruthy();
  a = (await first.json()).project.id;
  const second = await request.post("/api/projects", {
    data: { name: "Browser B", rootPath: path.join(root, "b") }
  });
  b = (await second.json()).project.id;
  await page.addInitScript((id) => {
    if (!localStorage.getItem("wb.currentProject"))
      localStorage.setItem("wb.currentProject", id);
  }, a);
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/");
  await expect(page.getByLabel("项目", { exact: true })).toHaveValue(a);
});
test.afterEach(async ({ request }) => {
  for (const id of mcpIds.splice(0)) await request.delete(`/api/mcp/${id}`);
  if (a) await request.delete(`/api/projects/${a}`);
  if (b) await request.delete(`/api/projects/${b}`);
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
});
async function tool(page: Page, label: string) {
  await page.getByRole("button", { name: "工具", exact: true }).click();
  await page
    .locator("#workspace-tools")
    .getByRole("button", { name: label, exact: true })
    .click();
}

test("project drafts, diff ownership and recovery after a failed chat", async ({
  page
}) => {
  await page.getByRole("button", { name: "项目文件", exact: true }).click();
  await page
    .locator(".file-entry")
    .filter({ hasText: "notes with space.txt" })
    .click();
  const editor = page.getByRole("textbox", {
    name: "Editor content",
    exact: true
  });
  await editor.waitFor();
  await editor.press("ControlOrMeta+A");
  await editor.pressSequentially("draft A");
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("wb.workspaceDrafts.v1"))
    )
    .toContain("draft A");
  await page.getByLabel("项目", { exact: true }).selectOption(b);
  await page.getByLabel("项目", { exact: true }).selectOption(a);
  await page.getByRole("button", { name: "项目文件", exact: true }).click();
  await expect(page.locator(".monaco-editor").first()).toContainText("draft A");
  await page.reload();
  await page.getByRole("button", { name: "项目文件", exact: true }).click();
  await expect(page.locator(".monaco-editor").first()).toContainText("draft A");
  await tool(page, "Agent");
  await page.getByRole("button", { name: "导入计划", exact: true }).click();
  await page
    .getByLabel("Agent 任务")
    .fill("### notes with space.txt\n```txt\nproposed A\n```");
  await page.getByRole("button", { name: "解析计划", exact: true }).click();
  await page
    .getByRole("button", { name: "预览 notes with space.txt", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "确认写盘", exact: true })
  ).toBeVisible();
  await page.getByLabel("项目", { exact: true }).selectOption(b);
  await page.getByRole("button", { name: "项目文件", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "确认写盘", exact: true })
  ).toHaveCount(0);
  expect(
    await fs.readFile(path.join(root, "b", "notes with space.txt"), "utf8")
  ).toBe("original B");
  await page.getByLabel("项目", { exact: true }).selectOption(a);
  await page.getByRole("button", { name: "项目文件", exact: true }).click();
  await expect(page.locator(".diff-panel")).toContainText("original A");
  await page.screenshot({
    path: "test-results/desktop-diff.png",
    animations: "disabled"
  });
  await page.getByRole("button", { name: "确认写盘", exact: true }).click();
  await expect
    .poll(() =>
      fs.readFile(path.join(root, "a", "notes with space.txt"), "utf8")
    )
    .toBe("proposed A\n");
  await page.getByRole("button", { name: "对话", exact: true }).first().click();
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: 'data: {"type":"delta","text":"partial"}\n\ndata: {"type":"error","error":"fixture model failure"}\n\n'
    })
  );
  await page.getByLabel("消息输入框").fill("recover this message");
  await page.getByLabel("消息输入框").press("Enter");
  await expect(page.locator(".notice")).toContainText("fixture model failure");
  await expect(page.getByLabel("消息输入框")).toHaveValue(
    "recover this message"
  );
  await expect(page.locator(".msg")).toHaveCount(0);
});

test("knowledge and schedule management", async ({ page }) => {
  await tool(page, "知识库");
  await page
    .getByLabel("知识文件")
    .setInputFiles({
      name: "fixture notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("Original document")
    });
  await page.getByRole("button", { name: "上传知识", exact: true }).click();
  await page
    .getByRole("button", { name: "编辑 fixture notes.md", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "编辑知识" });
  await dialog.getByLabel("标题", { exact: true }).fill("Updated note");
  await dialog.getByLabel("标签", { exact: true }).fill("tag1,tag2");
  await dialog
    .getByRole("textbox", { name: "正文", exact: true })
    .fill("searchable updated content");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel("知识检索").fill("searchable");
  await page.getByRole("button", { name: "检索", exact: true }).click();
  await expect(page.locator(".source-card")).toContainText("Updated note");
  await page.screenshot({
    path: "test-results/desktop-knowledge.png",
    animations: "disabled"
  });
  await page
    .getByRole("button", { name: "删除 Updated note", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "删除 Updated note", exact: true })
  ).toHaveCount(0);
  await tool(page, "定时任务");
  await page.getByLabel("任务标题").fill("Browser task");
  await page.getByLabel("备注", { exact: true }).fill("browser log");
  await page.getByRole("button", { name: "创建定时任务", exact: true }).click();
  await page
    .getByRole("button", { name: "暂停 Browser task", exact: true })
    .click();
  await expect(page.locator(".task-item")).toContainText("已暂停");
  await page
    .getByRole("button", { name: "立即运行 Browser task", exact: true })
    .click();
  await expect(page.locator(".task-item summary")).toContainText("上次运行");
  await page.locator(".task-item summary").click();
  await expect(page.locator(".task-item pre")).toContainText("browser log");
  await page
    .getByRole("button", { name: "删除 Browser task", exact: true })
    .click();
  await expect(page.locator(".task-item")).toHaveCount(0);
});

test("MCP discovery and tool invocation, terminal output and mobile layout", async ({
  page,
  request
}) => {
  const response = await request.post("/api/mcp", {
    data: {
      name: "Browser MCP",
      command: process.execPath,
      args: [path.resolve("server/test-fixtures/mcp-server.mjs")]
    }
  });
  mcpIds.push((await response.json()).server.id);
  await tool(page, "MCP");
  await page
    .getByRole("button", { name: "检测 Browser MCP", exact: true })
    .click();
  const echo = page
    .locator(".mcp-tool")
    .filter({ has: page.getByText("echo", { exact: true }) });
  await echo.getByRole("button", { name: "调用工具", exact: true }).click();
  await page
    .getByRole("textbox", { name: "参数（JSON）", exact: true })
    .fill('{"text":"Browser echo"}');
  await page.getByRole("button", { name: "确认执行", exact: true }).click();
  await expect(page.locator("form.task-item pre")).toContainText(
    "Browser echo"
  );
  await tool(page, "终端");
  await page
    .getByLabel("终端命令")
    .fill(
      process.platform === "win32"
        ? "Write-Output 'Browser terminal'"
        : "echo 'Browser terminal'"
    );
  await page.getByRole("button", { name: "运行命令", exact: true }).click();
  await expect(page.locator(".terminal-panel .hint")).toContainText("已退出");
  await page.getByRole("button", { name: "引用输出", exact: true }).click();
  await expect(page.getByLabel("消息输入框")).toHaveValue(/Browser terminal/);
  await page.screenshot({
    path: "test-results/desktop-terminal.png",
    animations: "disabled"
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/mobile-terminal.png",
    animations: "disabled"
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page.getByRole("button", { name: "关闭面板", exact: true }).click();
  await page.screenshot({
    path: "test-results/mobile-chat.png",
    animations: "disabled"
  });
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "设置", exact: true })
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-settings.png",
    animations: "disabled"
  });
});
