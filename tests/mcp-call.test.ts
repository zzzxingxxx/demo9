import { describe, expect, it } from "vitest";
import { mcpJsonLine, parseMcpToolCallResult } from "../server/src/lib/mcp.ts";
import { mcpTools, workbenchTools } from "../server/src/lib/chat/tools.ts";

describe("MCP call packing", () => {
  it("mcpJsonLine and parseMcpToolCallResult round-trip tool text", () => {
    expect(JSON.parse(mcpJsonLine(2, "tools/call", { name: "echo", arguments: { q: 1 } }))).toEqual({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "echo", arguments: { q: 1 } }
    });
    expect(
      parseMcpToolCallResult({ result: { content: [{ type: "text", text: "ok" }, { type: "text", text: "more" }] } })
    ).toBe("ok\nmore");
    expect(parseMcpToolCallResult({ error: { message: "boom" } })).toBe("boom");
  });

  it("mcp_call is only attached when servers are configured", () => {
    expect(Object.keys(mcpTools([]))).toEqual([]);
    expect(Object.keys(workbenchTools(".", []))).not.toContain("mcp_call");
    expect(Object.keys(mcpTools([{ name: "s", command: "echo", args: [] }]))).toEqual(["mcp_call"]);
  });
});
