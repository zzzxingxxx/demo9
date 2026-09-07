import { FormEvent, useEffect, useRef, useState } from "react";
import { apiGet, apiSend } from "../api";
import { useWorkbench } from "../store";

export type Session = {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
};

type ChatMessage = {
  id?: string;
  role: string;
  content: string;
};

export function SessionsPanel() {
  const { currentId, sessionId, setSessionId, setNotice } = useWorkbench();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [q, setQ] = useState("");

  async function reload() {
    if (!currentId) return;
    const data = await apiGet<{ sessions: Session[] }>(
      `/api/sessions?projectId=${encodeURIComponent(currentId)}&q=${encodeURIComponent(q)}`
    );
    setSessions(data.sessions);
    if (!sessionId && data.sessions[0]) setSessionId(data.sessions[0].id);
  }

  useEffect(() => {
    reload().catch((err: unknown) => setNotice(err instanceof Error ? err.message : "无法加载会话"));
  }, [currentId, q]);

  if (!currentId) return <p className="hint">先选择项目。</p>;

  return (
    <div>
      <div className="stack">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索会话" />
        <button
          className="btn"
          type="button"
          onClick={async () => {
            const created = await apiSend<{ session: Session }>("/api/sessions", "POST", {
              projectId: currentId
            });
            setSessionId(created.session.id);
            await reload();
          }}
        >
          新会话
        </button>
      </div>
      {sessions.map((s) => (
        <div key={s.id} className={s.id === sessionId ? "session-row active" : "session-row"}>
          <button type="button" className="list-btn" onClick={() => setSessionId(s.id)}>
            {s.pinned ? "★ " : ""}
            {s.title}
            {s.archived ? "（归档）" : ""}
          </button>
          <span className="row-actions">
            <button
              type="button"
              onClick={async () => {
                const title = window.prompt("会话名称", s.title);
                if (!title) return;
                await apiSend(`/api/sessions/${s.id}`, "PATCH", { title });
                await reload();
              }}
            >
              改名
            </button>
            <button
              type="button"
              onClick={async () => {
                await apiSend(`/api/sessions/${s.id}`, "PATCH", { pinned: !s.pinned });
                await reload();
              }}
            >
              置顶
            </button>
            <button
              type="button"
              onClick={async () => {
                await apiSend(`/api/sessions/${s.id}`, "PATCH", { archived: !s.archived });
                await reload();
              }}
            >
              归档
            </button>
            <button
              type="button"
              onClick={async () => {
                const data = await apiGet<{ markdown: string }>(`/api/sessions/${s.id}/export`);
                await navigator.clipboard.writeText(data.markdown);
                setNotice("已复制 Markdown");
              }}
            >
              导出
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

export function ChatPane() {
  const { currentId, sessionId, setSessionId, setNotice } = useWorkbench();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function loadMessages(id: string) {
    const data = await apiGet<{ messages: ChatMessage[] }>(`/api/sessions/${id}/messages`);
    setMessages(data.messages);
  }

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    loadMessages(sessionId).catch((err: unknown) =>
      setNotice(err instanceof Error ? err.message : "无法加载消息")
    );
  }, [sessionId, setNotice]);

  async function send(content: string, truncateFromMessageId?: string) {
    if (!currentId || !content.trim() || streaming) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setStreaming(true);
    setMessages((prev) => [...prev, { role: "user", content }, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          projectId: currentId,
          sessionId,
          content,
          truncateFromMessageId
        })
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const newId = res.headers.get("x-session-id");
      if (newId && newId !== sessionId) setSessionId(newId);
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("无流式响应");
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const snapshot = acc;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") next[next.length - 1] = { ...last, content: snapshot };
          return next;
        });
      }
      if (newId) await loadMessages(newId);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setNotice(err instanceof Error ? err.message : "发送失败");
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const content = draft;
    setDraft("");
    void send(content);
  }

  return (
    <>
      <div className="chat-log">
        {messages.length === 0 ? (
          <p className="hint">从这里开始：写周报、读文档提问、或起草方案。引用文件请用 @。</p>
        ) : (
          messages.map((m, i) => (
            <article key={m.id || i} className={`bubble ${m.role}`}>
              <header>
                {m.role === "user" ? "用户" : "助手"}
                {m.role === "user" && m.id ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      const next = window.prompt("编辑后重发", m.content);
                      if (next) void send(next, m.id);
                    }}
                  >
                    编辑重发
                  </button>
                ) : null}
              </header>
              <pre>{m.content}</pre>
            </article>
          ))
        )}
      </div>
      <form className="composer" onSubmit={onSubmit}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="输入消息，用 @ 引用文件、知识或规则"
        />
        {streaming ? (
          <button className="btn" type="button" onClick={() => abortRef.current?.abort()}>
            停止
          </button>
        ) : (
          <button className="btn btn-primary" type="submit">
            发送
          </button>
        )}
      </form>
    </>
  );
}
