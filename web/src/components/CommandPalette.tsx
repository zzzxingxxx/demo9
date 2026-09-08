import { useEffect, useState } from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import { apiGet } from "../api";
import { knowledgeTabPath, useWorkbench } from "../store";
import { Modal } from "./Modal";

type Hit = { kind: string; id: string; title: string; hint?: string };
const KIND_NAMES: Record<string, string> = {
  project: "项目",
  session: "对话",
  file: "文件",
  knowledge: "知识",
  skill: "技能"
};

export function CommandPalette() {
  const {
    currentId,
    setCurrentId,
    setSessionId,
    setNotice,
    paletteOpen,
    setPaletteOpen,
    openTab,
    setSkillId
  } = useWorkbench();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, setPaletteOpen]);

  useEffect(() => {
    if (!paletteOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ q });
    if (currentId) params.set("projectId", currentId);
    apiGet<{ items: Hit[] }>(`/api/search?${params.toString()}`)
      .then((d) => {
        if (!cancelled) setHits(d.items);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "搜索失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, paletteOpen, currentId, setNotice]);

  if (!paletteOpen) return null;

  return (
    <Modal
      open={paletteOpen}
      onClose={() => setPaletteOpen(false)}
      label="命令面板"
      initialFocus="input"
      className="palette"
    >
      <div className="palette-search">
        <Search size={19} />
        <input
          value={q}
          aria-label="全局搜索"
          placeholder="搜索项目、会话、文件、知识、技能"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              document
                .querySelector<HTMLButtonElement>("#palette-results button")
                ?.focus();
            }
          }}
        />
        <button
          type="button"
          className="gpt-icon"
          title="关闭搜索"
          aria-label="关闭搜索"
          onClick={() => setPaletteOpen(false)}
        >
          <X size={17} />
        </button>
      </div>
      {loading ? (
        <div className="palette-empty" role="status">
          <LoaderCircle size={18} className="spin" />
          正在搜索
        </div>
      ) : error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : hits.length === 0 ? (
        <div className="palette-empty">
          <Search size={20} />
          <span>{q ? "没有找到相关结果" : "暂无搜索结果"}</span>
        </div>
      ) : (
        <ul
          id="palette-results"
          aria-label="搜索结果"
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("button")
            );
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement
            );
            buttons[
              (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                buttons.length
            ]?.focus();
          }}
        >
          {hits.map((hit) => (
            <li key={`${hit.kind}-${hit.id}`}>
              <button
                type="button"
                className="list-btn"
                onClick={() => {
                  void (async () => {
                    try {
                      if (hit.kind === "project") setCurrentId(hit.id);
                      if (hit.kind === "session") setSessionId(hit.id);
                      if (hit.kind === "skill") setSkillId(hit.id);
                      if (hit.kind === "file" && currentId) {
                        const data = await apiGet<{
                          path: string;
                          content: string;
                        }>(
                          `/api/files/content?projectId=${encodeURIComponent(currentId)}&path=${encodeURIComponent(hit.id)}`
                        );
                        openTab(
                          {
                            path: data.path,
                            content: data.content,
                            original: data.content
                          },
                          currentId
                        );
                      }
                      if (hit.kind === "knowledge") {
                        const data = await apiGet<{
                          knowledge: { title: string; text: string };
                        }>(`/api/knowledge/${hit.id}`);
                        openTab(
                          {
                            path: knowledgeTabPath(
                              hit.id,
                              data.knowledge.title
                            ),
                            content: data.knowledge.text,
                            original: data.knowledge.text
                          },
                          currentId || undefined
                        );
                      }
                      setPaletteOpen(false);
                    } catch (err) {
                      setNotice(
                        err instanceof Error ? err.message : "无法打开"
                      );
                    }
                  })();
                }}
              >
                <span className="palette-kind">
                  {KIND_NAMES[hit.kind] || hit.kind}
                </span>
                <span>{hit.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
