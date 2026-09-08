import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  Check,
  Code2,
  Command,
  Copy,
  FileText,
  Folder,
  FolderOpen,
  BookOpen,
  Lightbulb,
  LoaderCircle,
  Paperclip,
  X,
  GitBranch,
  ImagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Square,
  Star
} from "lucide-react";
import { createUnifiedDiff, extractCodeBlocks } from "@wb/shared";
import { apiGet, apiSend } from "../api";
import { MarkdownBody } from "../lib/markdown";
import { readChatStream } from "../lib/chatStream";
import { knowledgeTabPath, useWorkbench } from "../store";

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
  starred?: boolean;
};

type SourceCard = { id: string; title: string; snippet: string; score: number };

const SUGGESTIONS = [
  {
    title: "梳理项目结构",
    icon: Code2,
    prompt: "请帮我梳理当前项目的结构，介绍主要模块，并给出下一步建议。"
  },
  {
    title: "润色一段文字",
    icon: FileText,
    prompt: "请帮我润色下面的文字，保留原意，让表达更清晰自然：\n\n"
  },
  {
    title: "制定行动计划",
    icon: Lightbulb,
    prompt: "我有一个想法，请和我一起把它拆解成可执行的步骤：\n\n"
  }
];

export function ChatPane({ onCreateProject }: { onCreateProject: () => void }) {
  const {
    currentId,
    projects,
    sessionId,
    setSessionId,
    setNotice,
    activePath,
    tree,
    tabs,
    setPendingDiff,
    citeDraft,
    setCiteDraft,
    openTab,
    skillId,
    setSkillId,
    composerDraft: draft,
    setComposerDraft
  } = useWorkbench();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const setDraft = (value: string | ((previous: string) => string)) =>
    setComposerDraft(
      typeof value === "function"
        ? value(useWorkbench.getState().composerDraft)
        : value
    );
  const [streaming, setStreaming] = useState(false);
  const [skills, setSkills] = useState<Array<{ id: string; name: string }>>([]);
  const [sourceCards, setSourceCards] = useState<SourceCard[]>([]);
  const [images, setImages] = useState<
    Array<{ mimeType: string; dataBase64: string }>
  >([]);
  const [plusOpen, setPlusOpen] = useState(false);
  const [loading, setLoading] = useState(Boolean(sessionId));
  const [copied, setCopied] = useState<string | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestSessionRef = useRef<string | null>(null);
  const requestProjectRef = useRef<string | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const followTailRef = useRef(true);
  const empty = messages.length === 0 && !loading;
  const model = (localStorage.getItem("wb.model") || "grok-4.5").replace(
    "grok-",
    "Grok "
  );
  const currentProject = projects.find((project) => project.id === currentId);

  function resizeDraft() {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  useEffect(() => {
    if (!citeDraft) return;
    setDraft((d) => (d ? `${d}\n${citeDraft}` : citeDraft));
    setCiteDraft(null);
  }, [citeDraft, setCiteDraft]);

  useEffect(() => {
    resizeDraft();
  }, [draft]);

  async function loadMessages(id: string) {
    const data = await apiGet<{ messages: ChatMessage[] }>(
      `/api/sessions/${id}/messages`
    );
    if (useWorkbench.getState().sessionId === id) setMessages(data.messages);
  }

  useEffect(() => {
    apiGet<{ skills: Array<{ id: string; name: string }> }>(
      `/api/skills${currentId ? `?projectId=${encodeURIComponent(currentId)}` : ""}`
    )
      .then((d) => setSkills(d.skills))
      .catch(() => undefined);
  }, [currentId]);

  useEffect(() => {
    if (
      abortRef.current &&
      requestSessionRef.current === sessionId &&
      requestProjectRef.current === currentId
    )
      return;
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setSourceCards([]);
    followTailRef.current = true;
    setShowScrollDown(false);
    let cancelled = false;
    if (!sessionId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessages([]);
    apiGet<{ messages: ChatMessage[] }>(`/api/sessions/${sessionId}/messages`)
      .then((data) => {
        if (!cancelled) setMessages(data.messages);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setNotice(err instanceof Error ? err.message : "无法加载消息");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentId, sessionId, setNotice]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (followTailRef.current && scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function send(
    content: string,
    truncateFromMessageId?: string,
    regenerateFromMessageId?: string
  ) {
    if (!currentId || streaming) return;
    const isRegen = Boolean(regenerateFromMessageId);
    if (!isRegen && !content.trim()) return;
    const ac = new AbortController();
    abortRef.current = ac;
    requestSessionRef.current = sessionId;
    requestProjectRef.current = currentId;
    followTailRef.current = true;
    const previousMessages = messages;
    setNotice(null);
    setSourceCards([]);
    setStreaming(true);
    setMessages((prev) => {
      if (isRegen && regenerateFromMessageId) {
        const idx = prev.findIndex((m) => m.id === regenerateFromMessageId);
        const base = idx >= 0 ? prev.slice(0, idx) : prev;
        return [...base, { role: "assistant", content: "" }];
      }
      const index = truncateFromMessageId
        ? prev.findIndex((m) => m.id === truncateFromMessageId)
        : -1;
      return [
        ...(index >= 0 ? prev.slice(0, index) : prev),
        { role: "user", content },
        { role: "assistant", content: "" }
      ];
    });
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          projectId: currentId,
          sessionId: sessionId || undefined,
          model: localStorage.getItem("wb.model") || undefined,
          content: isRegen ? undefined : content,
          skillId: skillId || undefined,
          truncateFromMessageId,
          regenerateFromMessageId,
          images: isRegen || images.length === 0 ? undefined : images
        })
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      if (abortRef.current !== ac || ac.signal.aborted) return;
      setPlusOpen(false);
      const cardsHeader = res.headers.get("x-source-cards");
      if (cardsHeader) {
        try {
          setSourceCards(
            JSON.parse(decodeURIComponent(cardsHeader)) as SourceCard[]
          );
        } catch {
          setSourceCards([]);
        }
      }
      const newId = res.headers.get("x-session-id");
      if (newId && newId !== sessionId) {
        requestSessionRef.current = newId;
        setSessionId(newId);
      }
      let acc = "";
      await readChatStream(res, (delta) => {
        if (abortRef.current !== ac || ac.signal.aborted) return;
        acc += delta;
        const snapshot = acc;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant")
            next[next.length - 1] = { ...last, content: snapshot };
          return next;
        });
      });
      setImages([]);
      if (!isRegen) setDraft((value) => (value === content ? "" : value));
      if (abortRef.current === ac && newId) await loadMessages(newId);
    } catch (err) {
      if (
        abortRef.current !== ac ||
        useWorkbench.getState().currentId !== currentId
      )
        return;
      setMessages(previousMessages);
      if (!isRegen) setDraft((value) => value || content);
      setNotice(
        ac.signal.aborted
          ? "生成已停止，原会话已保留"
          : err instanceof Error
            ? err.message
            : "发送失败"
      );
    } finally {
      if (abortRef.current === ac) {
        setStreaming(false);
        abortRef.current = null;
      }
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!currentId || streaming || loading || !draft.trim()) return;
    const content = draft;
    void send(content);
  }

  return (
    <section
      className={empty ? "gpt-chat is-empty" : "gpt-chat"}
      aria-label="对话"
    >
      <div
        className="gpt-scroll"
        ref={scrollRef}
        onScroll={() => {
          const element = scrollRef.current;
          if (!element) return;
          const nearBottom =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            100;
          followTailRef.current = nearBottom;
          setShowScrollDown(!nearBottom);
        }}
      >
        <div className="gpt-col">
          {loading ? (
            <div className="chat-loading" role="status">
              <LoaderCircle size={22} className="spin" />
              <span>正在加载对话…</span>
            </div>
          ) : empty ? (
            <div className="welcome">
              <span className="welcome-mark">
                <Command size={30} strokeWidth={1.5} />
              </span>
              <span className="welcome-eyebrow">AI 工作台</span>
              <h1 className="gpt-hello">今天，想完成什么？</h1>
              <p className="welcome-context">
                <Folder size={14} />
                <span>{currentProject?.name || "尚未选择项目"}</span>
              </p>
              {!currentId && (
                <button
                  type="button"
                  className="btn btn-primary welcome-create"
                  onClick={onCreateProject}
                >
                  <Plus size={16} />
                  创建第一个项目
                </button>
              )}
            </div>
          ) : (
            messages.map((m, i) => (
              <article key={m.id || i} className={`msg ${m.role}`}>
                <div className="msg-card">
                  {m.role === "assistant" && (
                    <div className="message-author">
                      <Command size={15} />
                      <span>工作台</span>
                    </div>
                  )}
                  {m.role === "assistant" && !m.content ? (
                    <div className="thinking" role="status">
                      {streaming ? (
                        <>
                          <span />
                          <span />
                          <span />
                          <small>正在思考</small>
                        </>
                      ) : (
                        <small>已停止生成</small>
                      )}
                    </div>
                  ) : (
                    <MarkdownBody text={m.content} />
                  )}
                  {m.role === "assistant"
                    ? extractCodeBlocks(m.content).map((block, bi) => (
                        <button
                          key={bi}
                          type="button"
                          className="gpt-apply"
                          onClick={() => {
                            const tab = tabs.find((t) => t.path === activePath);
                            if (!tab || !activePath) {
                              setNotice("先打开一个文件再应用到画布");
                              return;
                            }
                            setPendingDiff({
                              projectId: currentId!,
                              path: activePath,
                              before: tab.original,
                              after: block.code,
                              diff: createUnifiedDiff(
                                activePath,
                                tab.original,
                                block.code
                              )
                            });
                          }}
                        >
                          应用到画布
                        </button>
                      ))
                    : null}
                  <div className="msg-actions">
                    {m.content && (
                      <button
                        type="button"
                        title={
                          copied === (m.id || String(i)) ? "已复制" : "复制内容"
                        }
                        aria-label={
                          copied === (m.id || String(i)) ? "已复制" : "复制内容"
                        }
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(m.content);
                            setCopied(m.id || String(i));
                          } catch {
                            setNotice("无法复制，请检查剪贴板权限");
                          }
                        }}
                      >
                        {copied === (m.id || String(i)) ? (
                          <Check size={14} />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    )}
                    {m.id ? (
                      <button
                        type="button"
                        title={m.starred ? "取消收藏" : "收藏"}
                        aria-label={m.starred ? "取消收藏" : "收藏"}
                        onClick={async () => {
                          await apiSend(`/api/messages/${m.id}/star`, "POST", {
                            starred: !m.starred
                          });
                          if (sessionId) await loadMessages(sessionId);
                        }}
                      >
                        <Star
                          size={14}
                          fill={m.starred ? "currentColor" : "none"}
                        />
                      </button>
                    ) : null}
                    {m.id && sessionId ? (
                      <button
                        type="button"
                        title="从此分支"
                        aria-label="从此分支"
                        onClick={async () => {
                          const created = await apiSend<{ session: Session }>(
                            "/api/sessions/" + sessionId + "/branch",
                            "POST",
                            { messageId: m.id }
                          );
                          setSessionId(created.session.id);
                        }}
                      >
                        <GitBranch size={14} />
                      </button>
                    ) : null}
                    {m.role === "user" && m.id ? (
                      <button
                        type="button"
                        title="编辑重发"
                        aria-label="编辑重发"
                        onClick={() => {
                          const next = window.prompt("编辑后重发", m.content);
                          if (next) void send(next, m.id);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                    ) : null}
                    {m.role === "assistant" && m.id && !streaming ? (
                      <button
                        type="button"
                        title="重新生成"
                        aria-label="重新生成"
                        onClick={() => void send("", undefined, m.id)}
                      >
                        <RefreshCw size={14} />
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
      {showScrollDown && !empty && (
        <button
          type="button"
          className="scroll-to-bottom"
          aria-label="回到最新消息"
          onClick={() => {
            followTailRef.current = true;
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: "smooth"
            });
          }}
        >
          <ArrowDown size={16} />
          最新消息
        </button>
      )}
      {sourceCards.length > 0 ? (
        <div className="source-row">
          {sourceCards.map((card) => (
            <button
              key={card.id}
              type="button"
              className="source-card"
              onClick={async () => {
                const data = await apiGet<{
                  knowledge: { title: string; text: string };
                }>(`/api/knowledge/${card.id}`);
                openTab({
                  path: knowledgeTabPath(card.id, data.knowledge.title),
                  content: data.knowledge.text,
                  original: data.knowledge.text
                });
              }}
            >
              <strong>{card.title}</strong>
              <span>{card.snippet}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="gpt-dock">
        <form className="gpt-col gpt-box" onSubmit={onSubmit}>
          {images.length > 0 && (
            <div className="attachment-list">
              {images.map((image, index) => (
                <div className="attachment-chip" key={index}>
                  <img
                    src={`data:${image.mimeType};base64,${image.dataBase64}`}
                    alt={`待发送图片 ${index + 1}`}
                  />
                  <span>图片 {index + 1}</span>
                  <button
                    className="gpt-icon"
                    type="button"
                    aria-label={`移除图片 ${index + 1}`}
                    disabled={streaming}
                    onClick={() =>
                      setImages((previous) =>
                        previous.filter((_, item) => item !== index)
                      )
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {plusOpen ? (
            <div id="composer-references" className="at-bar" aria-label="引用">
              <button
                type="button"
                className="btn"
                disabled={!activePath}
                onClick={() => {
                  if (activePath)
                    setDraft((d) =>
                      `${d} @文件 ${JSON.stringify(activePath)} `.trimStart()
                    );
                }}
              >
                <FileText size={14} />
                文件
              </button>
              <button
                type="button"
                className="btn"
                disabled={tree.length === 0}
                onClick={() => setDraft((d) => `${d} @文件夹 . `.trimStart())}
              >
                <FolderOpen size={14} />
                文件夹
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setDraft((d) => `${d} @知识 `.trimStart())}
              >
                <BookOpen size={14} />
                知识
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setDraft((d) => `${d} @规则 `.trimStart())}
              >
                <Command size={14} />
                规则
              </button>
              <select
                value={skillId}
                onChange={(e) => setSkillId(e.target.value)}
                aria-label="技能"
              >
                <option value="">无技能</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <label className="gpt-icon" title="看图">
                <ImagePlus size={16} />
                <input
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  aria-label="看图"
                  disabled={streaming}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    e.target.value = "";
                    try {
                      const bytes = new Uint8Array(await file.arrayBuffer());
                      let binary = "";
                      bytes.forEach((byte) => {
                        binary += String.fromCharCode(byte);
                      });
                      setImages([
                        {
                          mimeType: file.type || "image/png",
                          dataBase64: btoa(binary)
                        }
                      ]);
                    } catch {
                      setNotice("无法读取图片，请重新选择");
                    }
                  }}
                />
              </label>
            </div>
          ) : null}
          <div className="gpt-box-main">
            <textarea
              ref={draftRef}
              value={draft}
              aria-label="消息输入框"
              disabled={!currentId}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  e.keyCode !== 229
                ) {
                  e.preventDefault();
                  onSubmit(e);
                }
              }}
              placeholder={
                currentId
                  ? "说说你想做什么，或添加文件作为参考…"
                  : "创建项目后，开始你的第一段对话"
              }
              rows={2}
            />
          </div>
          <div className="composer-toolbar">
            <button
              type="button"
              className={plusOpen ? "composer-attach is-on" : "composer-attach"}
              title="添加引用或图片"
              aria-label="添加引用或图片"
              aria-expanded={plusOpen}
              aria-controls="composer-references"
              disabled={!currentId}
              onClick={() => setPlusOpen((value) => !value)}
            >
              <Paperclip size={18} />
            </button>
            <div className="composer-toolbar-end">
              {skillId && (
                <span className="active-skill">
                  {skills.find((skill) => skill.id === skillId)?.name}
                </span>
              )}
              <span className="model-badge">{model}</span>
              {streaming ? (
                <button
                  className="gpt-send"
                  type="button"
                  title="停止"
                  aria-label="停止"
                  onClick={() => abortRef.current?.abort()}
                >
                  <Square size={12} />
                </button>
              ) : (
                <button
                  className="gpt-send"
                  type="submit"
                  title="发送"
                  aria-label="发送"
                  disabled={!draft.trim() || !currentId || loading}
                >
                  <ArrowUp size={19} />
                </button>
              )}
            </div>
          </div>
        </form>
        {empty && currentId && (
          <div className="gpt-col quick-start">
            <div className="suggestion-grid">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.title}
                  className="suggestion"
                  type="button"
                  onClick={() => {
                    setDraft((value) =>
                      value.trim()
                        ? `${suggestion.prompt}\n\n${value}`
                        : suggestion.prompt
                    );
                    draftRef.current?.focus();
                  }}
                >
                  <suggestion.icon size={18} strokeWidth={1.7} />
                  <span>{suggestion.title}</span>
                  <ArrowUpRight size={14} className="suggestion-arrow" />
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="composer-status" role="status">
          {streaming ? (
            <>
              <LoaderCircle size={12} className="spin" />
              正在生成回答
            </>
          ) : (
            <>
              <span className="status-dot" />
              {currentId ? "当前项目已就绪" : "等待创建项目"}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
