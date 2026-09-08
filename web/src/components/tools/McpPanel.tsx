import { useEffect, useState } from "react";
import { Plug, Pencil, Trash2, Save, Play, X, RefreshCw } from "lucide-react";
import { apiGet, apiSend } from "../../api";
import { useToolAction } from "../toolUi";
type Server = {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  allowedTools: string[];
};
type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};
const blank = { name: "", command: "", args: "[]", env: "{}" };

export function McpPanel() {
  const [servers, setServers] = useState<Server[]>([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [tools, setTools] = useState<Record<string, Tool[]>>({});
  const [connection, setConnection] = useState<Record<string, string>>({});
  const [call, setCall] = useState<{
    server: Server;
    tool: Tool;
    args: string;
  } | null>(null);
  const [output, setOutput] = useState("");
  const { run, busy, error } = useToolAction();
  async function reload() {
    setServers((await apiGet<{ servers: Server[] }>("/api/mcp")).servers);
  }
  useEffect(() => {
    void run(reload);
  }, []);
  return (
    <div className="stack">
      {error}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await apiSend(
              editing ? `/api/mcp/${editing}` : "/api/mcp",
              editing ? "PATCH" : "POST",
              {
                name: form.name,
                command: form.command,
                args: JSON.parse(form.args),
                env: JSON.parse(form.env),
                ...(editing ? { allowedTools: [] } : {})
              }
            );
            setForm(blank);
            setEditing(null);
            setTools({});
            setConnection({});
            await reload();
          });
        }}
      >
        <label>
          名称
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          可执行命令
          <input
            required
            value={form.command}
            onChange={(e) => setForm({ ...form, command: e.target.value })}
            placeholder="node / npx"
          />
        </label>
        <label>
          参数（JSON 数组）
          <textarea
            value={form.args}
            onChange={(e) => setForm({ ...form, args: e.target.value })}
            spellCheck={false}
          />
        </label>
        <label>
          环境变量（JSON 对象）
          <textarea
            value={form.env}
            onChange={(e) => setForm({ ...form, env: e.target.value })}
            spellCheck={false}
          />
        </label>
        <div className="row-actions">
          <button
            className="btn"
            disabled={busy || !form.name.trim() || !form.command.trim()}
          >
            {editing ? <Save size={15} /> : <Plug size={15} />}
            {editing ? "保存 MCP" : "添加 MCP"}
          </button>
          {editing && (
            <button
              className="gpt-icon"
              type="button"
              title="取消编辑"
              onClick={() => {
                setEditing(null);
                setForm(blank);
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </form>
      {!servers.length && <p className="hint">暂无 MCP 服务器</p>}
      {servers.map((server) => (
        <div className="task-item" key={server.id}>
          <div className="tool-list-item">
            <strong>{server.name}</strong>
            <label className="check-row">
              <input
                type="checkbox"
                checked={server.enabled}
                disabled={busy}
                onChange={(e) =>
                  void run(async () => {
                    await apiSend(`/api/mcp/${server.id}`, "PATCH", {
                      enabled: e.target.checked
                    });
                    await reload();
                  })
                }
              />
              启用
            </label>
          </div>
          <code className="task-command">
            {server.command} {server.args.join(" ")}
          </code>
          <p className="hint">{connection[server.id] || "尚未检测"}</p>
          <div className="row-actions">
            <button
              className="gpt-icon"
              title={`检测 ${server.name}`}
              aria-label={`检测 ${server.name}`}
              disabled={busy || !server.enabled}
              onClick={() =>
                void run(async () => {
                  setConnection((s) => ({ ...s, [server.id]: "正在连接" }));
                  try {
                    const data = await apiSend<{ tools: Tool[] }>(
                      `/api/mcp/${server.id}/tools`,
                      "POST",
                      {}
                    );
                    setTools((t) => ({ ...t, [server.id]: data.tools }));
                    setConnection((s) => ({
                      ...s,
                      [server.id]: `连接成功 · ${data.tools.length} 个工具`
                    }));
                  } catch (err) {
                    setConnection((s) => ({ ...s, [server.id]: "连接失败" }));
                    throw err;
                  }
                })
              }
            >
              <RefreshCw size={15} />
            </button>
            <button
              className="gpt-icon"
              title={`编辑 ${server.name}`}
              disabled={busy}
              onClick={() => {
                setEditing(server.id);
                setForm({
                  name: server.name,
                  command: server.command,
                  args: JSON.stringify(server.args, null, 2),
                  env: JSON.stringify(server.env, null, 2)
                });
              }}
            >
              <Pencil size={15} />
            </button>
            <button
              className="gpt-icon btn-danger"
              title={`删除 ${server.name}`}
              disabled={busy}
              onClick={() => {
                if (window.confirm(`删除 ${server.name}？`))
                  void run(async () => {
                    await apiSend(`/api/mcp/${server.id}`, "DELETE");
                    if (call?.server.id === server.id) setCall(null);
                    await reload();
                  });
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
          {tools[server.id]?.map((tool) => (
            <div className="mcp-tool" key={tool.name}>
              <strong>{tool.name}</strong>
              <p className="hint">{tool.description}</p>
              <details>
                <summary>参数 schema</summary>
                <pre className="term-out">
                  {JSON.stringify(tool.inputSchema, null, 2)}
                </pre>
              </details>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={server.allowedTools.includes(tool.name)}
                  disabled={busy || !server.enabled}
                  onChange={(e) =>
                    void run(async () => {
                      await apiSend(`/api/mcp/${server.id}`, "PATCH", {
                        allowedTools: e.target.checked
                          ? [...server.allowedTools, tool.name]
                          : server.allowedTools.filter((t) => t !== tool.name)
                      });
                      await reload();
                    })
                  }
                />
                允许对话调用
              </label>
              <button
                className="btn"
                disabled={!server.enabled}
                onClick={() => {
                  setCall({ server, tool, args: "{}" });
                  setOutput("");
                }}
              >
                <Play size={15} />
                调用工具
              </button>
            </div>
          ))}
        </div>
      ))}
      {call && (
        <form
          className="stack task-item"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const data = await apiSend<{ output: string }>(
                `/api/mcp/${call.server.id}/call`,
                "POST",
                {
                  name: call.tool.name,
                  arguments: JSON.parse(call.args),
                  confirm: true
                }
              );
              setOutput(data.output);
            });
          }}
        >
          <strong>
            {call.server.name} / {call.tool.name}
          </strong>
          <label>
            参数（JSON）
            <textarea
              value={call.args}
              onChange={(e) => setCall({ ...call, args: e.target.value })}
            />
          </label>
          <div className="row-actions">
            <button className="btn btn-primary" disabled={busy}>
              <Play size={15} />
              确认执行
            </button>
            <button
              className="gpt-icon"
              title="关闭调用"
              type="button"
              onClick={() => setCall(null)}
            >
              <X size={15} />
            </button>
          </div>
          {output && <pre className="term-out">{output}</pre>}
        </form>
      )}
    </div>
  );
}
