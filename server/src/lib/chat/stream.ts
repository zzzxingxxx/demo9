import { streamText } from "ai";
import { createXai } from "@ai-sdk/xai";
import type { ChatTurn } from "./assemble.js";

export function streamWorkbenchChat(opts: {
  apiKey: string;
  model: string;
  messages: ChatTurn[];
  abortSignal?: AbortSignal;
  onFinish?: (text: string) => Promise<void>;
}) {
  const xai = createXai({ apiKey: opts.apiKey });
  return streamText({
    model: xai(opts.model),
    messages: opts.messages,
    abortSignal: opts.abortSignal,
    onFinish: async ({ text }) => {
      await opts.onFinish?.(text);
    }
  });
}
