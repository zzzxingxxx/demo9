import { FormEvent, useEffect, useState } from "react";
import { apiGet, apiSend } from "../api";
import { knowledgeTabPath, useWorkbench } from "../store";

type Doc = { id: string; title: string; tags: string; sourceName?: string };
type SourceCard = { id: string; title: string; snippet: string; score: number };
type VectorHit = {
  id: string;
  docId: string;
  title: string;
  score: number;
  text: string;
  citation: { start: number; end: number; snippet: string };
};

export function KnowledgePanel() {
  const { currentId, setNotice, openTab } = useWorkbench();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tags, setTags] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [q, setQ] = useState("");
  const [cards, setCards] = useState<SourceCard[]>([]);
  const [vectorHits, setVectorHits] = useState<VectorHit[]>([]);
  const [preview, setPreview] = useState<{ title: string; text: string; start: number; end: number } | null>(null);

  async function reload() {
    if (!currentId) return;
    const data = await apiGet<{ knowledge: Doc[] }>(
      `/api/knowledge?projectId=${encodeURIComponent(currentId)}`
    );
    setDocs(data.knowledge);
  }

  useEffect(() => {
    reload().catch((err: unknown) => setNotice(err instanceof Error ? err.message : "无法加载知识"));
  }, [currentId]);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!currentId || files.length === 0) return;
    try {
      for (const file of files) {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        bytes.forEach((b) => {
          binary += String.fromCharCode(b);
        });
        await apiSend("/api/knowledge", "POST", {
          projectId: currentId,
          filename: file.name,
          tags,
          contentBase64: btoa(binary)
        });
      }
      setFiles([]);
      setTags("");
      await reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "上传失败");
    }
  }

  async function onIngestUrl(e: FormEvent) {
    e.preventDefault();
    if (!currentId || !url.trim()) return;
    try {
      await apiSend("/api/knowledge/url", "POST", { projectId: currentId, url: url.trim(), tags });
      setUrl("");
      await reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "URL 入库失败");
    }
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    if (!currentId) return;
    try {
      const data = await apiGet<{ cards: SourceCard[] }>(
        `/api/knowledge/search?projectId=${encodeURIComponent(currentId)}&q=${encodeURIComponent(q)}`
      );
      setCards(data.cards);
      const vec = await apiGet<{ hits: VectorHit[] }>(
        `/api/knowledge/vector?projectId=${encodeURIComponent(currentId)}&q=${encodeURIComponent(q)}`
      );
      setVectorHits(vec.hits);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "检索失败");
    }
  }

  async function openCitation(id: string, query: string) {
    try {
      const data = await apiGet<{
        knowledge: { title: string; text: string };
        citation: { start: number; end: number; snippet: string };
      }>(`/api/knowledge/${id}?q=${encodeURIComponent(query)}`);
      setPreview({
        title: data.knowledge.title,
        text: data.knowledge.text,
        start: data.citation.start,
        end: data.citation.end
      });
      openTab({
        path: knowledgeTabPath(id, data.knowledge.title),
        content: data.knowledge.text,
        original: data.knowledge.text
      });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "无法打开来源");
    }
  }

  if (!currentId) return <p className="hint">先选择项目。</p>;

  return (
    <div>
      <form className="stack" onSubmit={onUpload}>
        <input
          type="file"
          accept=".md,.txt,.pdf"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="标签，逗号分隔" />
        <button className="btn btn-primary" type="submit" disabled={files.length === 0}>
          上传知识
        </button>
      </form>
      <form className="stack" onSubmit={onIngestUrl}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https:// 抓取入库" />
        <button className="btn" type="submit" disabled={!url.trim()}>
          URL 入库
        </button>
      </form>
      <form className="stack" onSubmit={onSearch}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="知识关键词 / 向量检索" />
        <button className="btn" type="submit">
          检索
        </button>
      </form>
      {cards.length > 0 ? (
        <div className="section">
          <h3>来源卡片</h3>
          {cards.map((card) => (
            <button
              key={card.id}
              type="button"
              className="source-card"
              onClick={() => void openCitation(card.id, q)}
            >
              <strong>{card.title}</strong>
              <span>{card.snippet}</span>
            </button>
          ))}
        </div>
      ) : null}
      {vectorHits.length > 0 ? (
        <div className="section">
          <h3>向量检索</h3>
          {vectorHits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              className="source-card"
              onClick={() => void openCitation(hit.docId, q)}
            >
              <strong>{hit.title}</strong>
              <span>{hit.citation.snippet}</span>
            </button>
          ))}
        </div>
      ) : null}
      {preview ? (
        <pre className="cite-preview">
          {preview.text.slice(0, preview.start)}
          <mark>{preview.text.slice(preview.start, preview.end) || preview.title}</mark>
          {preview.text.slice(preview.end)}
        </pre>
      ) : null}
      {docs.map((d) => (
        <div key={d.id} className="hint">
          {d.title}
          {d.tags ? ` · ${d.tags}` : ""}
        </div>
      ))}
    </div>
  );
}
