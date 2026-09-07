import { streamText, stepCountIs } from "ai";
import { createXai } from "@ai-sdk/xai";
import type { ChatTurn } from "./assemble.js";
import { workbenchTools } from "./tools.js";

/** Tool loop may continue after read_file/list_dir; default streamText is 1 step. */
export const CHAT_MAX_STEPS = 5;
export const chatStopWhen = stepCountIs(CHAT_MAX_STEPS);

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
    stopWhen: chatStopWhen,
    onFinish: async ({ text }) => {
      await opts.onFinish?.(text);
    }
  });
}
