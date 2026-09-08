import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  Download,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Search,
  Star,
  Trash2,
  X
} from "lucide-react";
import { apiGet, apiSend } from "../api";
import { useDismissableLayer } from "../lib/useDismissableLayer";
import { useWorkbench } from "../store";
import type { Session } from "./ChatPane";

export function SessionsPanel({ onSelect }: { onSelect: () => void }) {
  const { currentId, sessionId, setSessionId, setNotice } = useWorkbench();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"active" | "archived" | "starred">("active");
  const [starred, setStarred] = useState<
    Array<{ id: string; sessionId: string; title: string; content: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [menuId, setMenuId] = useState<string | null>(null);
  const requestRef = useRef(0);
  const menuRef = useDismissableLayer(menuId !== null, () => setMenuId(null));

  const reload = useCallback(async () => {
    if (!currentId) {
      setLoading(false);
      return;
    }
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const data = await apiGet<{ sessions: Session[] }>(
        `/api/sessions?projectId=${encodeURIComponent(currentId)}&q=${encodeURIComponent(q)}`
      );
      if (request !== requestRef.current) return;
      setSessions(data.sessions);
      if (view === "starred") {
        const stars = await apiGet<{ messages: typeof starred }>(
          `/api/messages/starred?projectId=${currentId}`
        );
        if (request === requestRef.current) setStarred(stars.messages);
      }
    } catch (err) {
      if (request === requestRef.current)
        setNotice(err instanceof Error ? err.message : "无法加载会话");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [currentId, q, sessionId, view, setNotice, setSessionId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), q ? 180 : 0);
    return () => {
      window.clearTimeout(timer);
      requestRef.current++;
    };
  }, [reload, q]);

  async function action(run: () => Promise<void>) {
    setMenuId(null);
    try {
      await run();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "操作失败，请重试");
    }
  }

  return (
    <section className="sessions-section" aria-label="最近对话">
      <div className="sidebar-section-label">
        <span>最近对话</span>
        <span className="session-count">{sessions.length || ""}</span>
      </div>
      <div className="session-views" role="group" aria-label="会话视图">
        {(
          [
            ["active", "对话", MessageSquare],
            ["starred", "收藏", Star],
            ["archived", "归档", Archive]
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            className={view === id ? "gpt-icon is-on" : "gpt-icon"}
            title={label}
            aria-label={label}
            aria-pressed={view === id}
            onClick={() => setView(id)}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>
      <div className="sidebar-search">
        <Search size={14} />
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="搜索对话…"
          aria-label="搜索对话"
        />
        {q && (
          <button
            type="button"
            className="gpt-icon"
            aria-label="清空对话搜索"
            onClick={() => setQ("")}
          >
            <X size={13} />
          </button>
        )}
      </div>
      {loading && sessions.length === 0 ? (
        <div
          className="session-skeleton"
          role="status"
          aria-label="正在加载对话"
        >
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {!loading && sessions.length === 0 ? (
        <div className="session-empty">
          <MessageSquare size={22} strokeWidth={1.5} />
          <p>{q ? "没有找到相关对话" : "暂无对话"}</p>
        </div>
      ) : null}
      <div className="sessions-list">
        {view === "starred" &&
          starred
            .filter((m) =>
              `${m.title} ${m.content}`.toLowerCase().includes(q.toLowerCase())
            )
            .map((m) => (
              <button
                type="button"
                key={m.id}
                className="list-btn"
                onClick={() => {
                  setSessionId(m.sessionId);
                  onSelect();
                }}
              >
                <Star size={14} />
                <span>
                  {m.title}
                  <small>{m.content.slice(0, 100)}</small>
                </span>
              </button>
            ))}
        {view !== "starred" &&
          sessions
            .filter((s) => s.archived === (view === "archived"))
            .map((session) => (
              <div
                key={session.id}
                className={
                  session.id === sessionId
                    ? "session-row active"
                    : "session-row"
                }
                ref={menuId === session.id ? menuRef : undefined}
              >
                <button
                  type="button"
                  className="list-btn session-select"
                  aria-current={session.id === sessionId ? "true" : undefined}
                  title={session.title}
                  onClick={() => {
                    setSessionId(session.id);
                    onSelect();
                  }}
                >
                  <MessageSquare size={15} />
                  <span>{session.title}</span>
                  {session.pinned && <Star size={12} className="session-pin" />}
                  {session.archived && <Archive size={12} />}
                </button>
                <button
                  type="button"
                  className="gpt-icon session-menu-trigger"
                  aria-label={`对话操作：${session.title}`}
                  title="对话操作"
                  aria-expanded={menuId === session.id}
                  onClick={() =>
                    setMenuId(menuId === session.id ? null : session.id)
                  }
                >
                  <MoreHorizontal size={16} />
                </button>
                {menuId === session.id && (
                  <div
                    className="gpt-pop ws-pop session-pop"
                    aria-label="对话操作"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        void action(async () => {
                          const title = window.prompt(
                            "会话名称",
                            session.title
                          );
                          if (!title?.trim()) return;
                          await apiSend(
                            `/api/sessions/${session.id}`,
                            "PATCH",
                            { title: title.trim() }
                          );
                          await reload();
                        })
                      }
                    >
                      <Pencil size={14} />
                      重命名
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void action(async () => {
                          await apiSend(
                            `/api/sessions/${session.id}`,
                            "PATCH",
                            { pinned: !session.pinned }
                          );
                          await reload();
                        })
                      }
                    >
                      <Star size={14} />
                      {session.pinned ? "取消置顶" : "置顶对话"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void action(async () => {
                          await apiSend(
                            `/api/sessions/${session.id}`,
                            "PATCH",
                            { archived: !session.archived }
                          );
                          await reload();
                        })
                      }
                    >
                      <Archive size={14} />
                      {session.archived ? "取消归档" : "归档对话"}
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() =>
                        void action(async () => {
                          if (!window.confirm(`删除会话 ${session.title}？`))
                            return;
                          await apiSend(
                            `/api/sessions/${session.id}`,
                            "DELETE"
                          );
                          if (session.id === sessionId) setSessionId(null);
                          await reload();
                        })
                      }
                    >
                      <Trash2 size={14} />
                      删除会话
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void action(async () => {
                          const data = await apiGet<{ markdown: string }>(
                            `/api/sessions/${session.id}/export`
                          );
                          await navigator.clipboard.writeText(data.markdown);
                          setNotice("对话已复制为 Markdown");
                        })
                      }
                    >
                      <Download size={14} />
                      复制为 Markdown
                    </button>
                  </div>
                )}
              </div>
            ))}
      </div>
    </section>
  );
}
