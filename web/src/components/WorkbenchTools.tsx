import { lazy, Suspense, useState } from "react";
import { Search, Download } from "lucide-react";
import { apiGet, apiSend } from "../api";
import { useWorkbench } from "../store";
import { useToolAction } from "./toolUi";
export { GitPanel } from "./tools/GitPanel";
export { AgentPanel } from "./tools/AgentPanel";
export { SchedulePanel } from "./tools/SchedulePanel";
export { McpPanel } from "./tools/McpPanel";
const LazyTerminal = lazy(() =>
  import("./tools/TerminalPanel").then((m) => ({ default: m.TerminalPanel }))
);
export function TerminalPanel() {
  return (
    <Suspense fallback={<p role="status">正在加载终端</p>}>
      <LazyTerminal />
    </Suspense>
  );
}

export function ContentSearchPanel() {
  const { currentId, openTab } = useWorkbench();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<
    Array<{ rel: string; line: number; text: string }>
  >([]);
  const [searched, setSearched] = useState(false);
  const { run, busy, error } = useToolAction();
  return (
    <div className="stack">
      {error}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const data = await apiGet<{ hits: typeof hits }>(
              `/api/files/content-search?projectId=${currentId}&q=${encodeURIComponent(q)}`
            );
            setHits(data.hits);
            setSearched(true);
          });
        }}
      >
        <input
          aria-label="内容搜索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索项目内容"
        />
        <button className="btn" disabled={busy || !currentId || !q.trim()}>
          <Search size={15} />
          搜索
        </button>
      </form>
      {searched && !hits.length && <p className="hint">没有匹配的内容</p>}
      {hits.map((hit, i) => (
        <button
          className="list-btn"
          key={i}
          onClick={() =>
            void run(async () => {
              const data = await apiGet<{ content: string }>(
                `/api/files/content?projectId=${currentId}&path=${encodeURIComponent(hit.rel)}`
              );
              openTab(
                {
                  path: hit.rel,
                  content: data.content,
                  original: data.content
                },
                currentId!
              );
            })
          }
        >
          <strong>
            {hit.rel}:{hit.line}
          </strong>
          <span>{hit.text}</span>
        </button>
      ))}
    </div>
  );
}

export function WebPanel() {
  const { currentId, setCiteDraft } = useWorkbench();
  const [q, setQ] = useState("");
  const [url, setUrl] = useState("");
  const [results, setResults] = useState<Array<{ title: string; url: string }>>(
    []
  );
  const [page, setPage] = useState("");
  const { run, busy, error } = useToolAction();
  return (
    <div className="stack">
      {error}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () =>
            setResults(
              (
                await apiGet<{ results: typeof results }>(
                  `/api/web/search?q=${encodeURIComponent(q)}`
                )
              ).results
            )
          );
        }}
      >
        <input
          aria-label="网页搜索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索网页"
        />
        <button className="btn" disabled={busy || !q.trim()}>
          <Search size={15} />
          搜索
        </button>
      </form>
      {results.map((r) => (
        <div className="tool-list-item" key={r.url}>
          <a href={r.url} target="_blank" rel="noreferrer">
            {r.title}
          </a>
          <button
            className="gpt-icon"
            title="读取网页"
            onClick={() => setUrl(r.url)}
          >
            <Download size={15} />
          </button>
        </div>
      ))}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const data = await apiSend<{ title: string; text: string }>(
              "/api/web/fetch",
              "POST",
              { url }
            );
            setPage(`${data.title}\n${data.text}`);
          });
        }}
      >
        <input
          aria-label="网页地址"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
        />
        <button className="btn" disabled={busy || !url.trim()}>
          <Download size={15} />
          读取网页
        </button>
      </form>
      {page && (
        <>
          <pre className="term-out">{page}</pre>
          <div className="row-actions">
            <button
              className="btn"
              onClick={() => setCiteDraft(`${url}\n${page.slice(0, 12000)}`)}
            >
              引用进对话
            </button>
            <button
              className="btn"
              disabled={!currentId || busy}
              onClick={() =>
                void run(async () => {
                  await apiSend("/api/knowledge/url", "POST", {
                    projectId: currentId,
                    url
                  });
                })
              }
            >
              加入知识库
            </button>
          </div>
        </>
      )}
    </div>
  );
}
