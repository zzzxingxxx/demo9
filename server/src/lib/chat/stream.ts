import { streamText } from "ai";
import { createXai } from "@ai-sdk/xai";
import type { ChatTurn } from "./assemble.js";
import { workbenchTools } from "./tools.js";

export function streamWorkbenchChat(opts: {
  apiKey: string;
  model: string;
  messages: ChatTurn[];
  abortSignal?: AbortSignal;
  rootPath?: string | null;
  onFinish?: (text: string) => Promise<void>;
}) {
  const xai = createXai({ apiKey: opts.apiKey });
  return streamText({
    model: xai(opts.model),
    messages: opts.messages,
    abortSignal: opts.abortSignal,
    tools: opts.rootPath ? workbenchTools(opts.rootPath) : undefined,
    onFinish: async ({ text }) => {
      await opts.onFinish?.(text);
    }
  });
}
