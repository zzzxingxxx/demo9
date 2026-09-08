import { streamText, stepCountIs } from "ai";
import { createXai } from "@ai-sdk/xai";
import type { McpConfig } from "../mcp.js";
import type { ChatTurn } from "./assemble.js";
import { webTools, workbenchTools } from "./tools.js";

/** Tool loop may continue after read_file/list_dir; default streamText is 1 step. */
export const CHAT_MAX_STEPS = 5;
export const chatStopWhen = stepCountIs(CHAT_MAX_STEPS);

export type ChatImage = { mimeType: string; dataBase64: string };

export function streamWorkbenchChat(opts: {
  apiKey: string;
  model: string;
  messages: ChatTurn[];
  abortSignal?: AbortSignal;
  rootPath?: string | null;
  images?: ChatImage[];
  mcpServers?: McpConfig[];
  onFinish?: (text: string, usage?: { tokensIn: number; tokensOut: number }) => Promise<void>;
}) {
  const xai = createXai({ apiKey: opts.apiKey });
  const mcp = opts.mcpServers ?? [];
  const tools = opts.rootPath ? workbenchTools(opts.rootPath, mcp) : webTools(mcp);
  const images = opts.images ?? [];
  const messages =
    images.length === 0
      ? opts.messages
      : opts.messages.map((m, i, arr) => {
          const lastUser = [...arr].map((x, idx) => ({ x, idx })).reverse().find((e) => e.x.role === "user");
          if (!lastUser || i !== lastUser.idx || m.role !== "user") return m;
          return {
            role: "user" as const,
            content: [
              { type: "text" as const, text: m.content },
              ...images.map((img) => ({
                type: "image" as const,
                image: `data:${img.mimeType};base64,${img.dataBase64}`
              }))
            ]
          };
        });
  return streamText({
    model: xai(opts.model),
    messages: messages as never,
    abortSignal: opts.abortSignal,
    tools,
    stopWhen: chatStopWhen,
    onFinish: async ({ text, usage }) => {
      const u = usage as { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number } | undefined;
      const tokensIn = Number(u?.inputTokens ?? u?.promptTokens ?? 0);
      const tokensOut = Number(u?.outputTokens ?? u?.completionTokens ?? 0);
      await opts.onFinish?.(text, { tokensIn, tokensOut });
    }
  });
}
