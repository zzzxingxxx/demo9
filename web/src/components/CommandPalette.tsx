import { useEffect, useState } from "react";
import { apiGet } from "../api";
import { useWorkbench } from "../store";

type Hit = { kind: string; id: string; title: string; hint?: string };

export function CommandPalette() {
  const { currentId, setCurrentId, setSessionId, setNotice, paletteOpen, setPaletteOpen } = useWorkbench();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

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
    const params = new URLSearchParams({ q });
    if (currentId) params.set("projectId", currentId);
    apiGet<{ items: Hit[] }>(`/api/search?${params.toString()}`)
      .then((d) => setHits(d.items))
      .catch((err: unknown) => setNotice(err instanceof Error ? err.message : "搜索失败"));
  }, [q, paletteOpen, currentId, setNotice]);

  if (!paletteOpen) return null;

  return (
    <div className="palette-backdrop" onClick={() => setPaletteOpen(false)}>
      <div
        className="palette"
        role="dialog"
        aria-label="命令面板"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          placeholder="搜索项目、会话、文件、知识、技能"
          onChange={(e) => setQ(e.target.value)}
        />
        <ul>
          {hits.map((hit) => (
            <li key={`${hit.kind}-${hit.id}`}>
              <button
                type="button"
                className="list-btn"
                onClick={() => {
                  if (hit.kind === "project") setCurrentId(hit.id);
                  if (hit.kind === "session") setSessionId(hit.id);
                  setPaletteOpen(false);
                }}
              >
                <span className="muted">{hit.kind}</span> {hit.title}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
