export async function readChatStream(
  response: Response,
  onDelta: (text: string) => void
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("无流式响应");
  const decoder = new TextDecoder();
  let buffer = "";
  let complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";
      for (const frame of frames) {
        if (!frame.startsWith("data: ")) continue;
        const event = JSON.parse(frame.slice(6)) as {
          type: string;
          text?: string;
          error?: string;
        };
        if (event.type === "error") throw new Error(event.error || "生成失败");
        if (event.type === "delta") onDelta(event.text || "");
        if (event.type === "done") complete = true;
      }
      if (done) break;
    }
    if (!complete) throw new Error("连接中断，原会话已保留");
  } finally {
    reader.releaseLock();
  }
}
