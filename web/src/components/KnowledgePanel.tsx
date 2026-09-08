import { useEffect, useState } from "react";
import {
  BookOpen,
  Pencil,
  Trash2,
  Search,
  Upload,
  Save,
  X
} from "lucide-react";
import { apiGet, apiSend } from "../api";
import { knowledgeTabPath, useWorkbench } from "../store";
import { Modal } from "./Modal";
import { useToolAction } from "./toolUi";

type Doc = {
  id: string;
  title: string;
  tags: string;
  text?: string;
  sourceName?: string;
};
type Card = { id: string; title: string; snippet: string; score: number };

export function KnowledgePanel() {
  const { currentId, openTab, setCiteDraft } = useWorkbench();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tags, setTags] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadKey, setUploadKey] = useState(0);
  const [url, setUrl] = useState("");
  const [q, setQ] = useState("");
  const [cards, setCards] = useState<Card[] | null>(null);
  const [mode, setMode] = useState("");
  const [editing, setEditing] = useState<Doc | null>(null);
  const { run, busy, error } = useToolAction();
  async function reload() {
    if (currentId)
      setDocs(
        (
          await apiGet<{ knowledge: Doc[] }>(
            `/api/knowledge?projectId=${currentId}`
          )
        ).knowledge
      );
  }
  useEffect(() => {
    void run(reload);
  }, [currentId]);
  async function loadDoc(id: string) {
    return (await apiGet<{ knowledge: Doc }>(`/api/knowledge/${id}`)).knowledge;
  }
  return (
    <div className="stack">
      {error}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            for (const file of files) {
              if (file.size > 10 * 1024 * 1024)
                throw new Error("单个文件不能超过 10 MB");
              const contentBase64 = await new Promise<string>(
                (resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () =>
                    resolve(String(reader.result).split(",")[1]!);
                  reader.onerror = () => reject(new Error("无法读取文件"));
                  reader.readAsDataURL(file);
                }
              );
              await apiSend("/api/knowledge", "POST", {
                projectId: currentId,
                filename: file.name,
                tags,
                contentBase64
              });
            }
            setFiles([]);
            setUploadKey((k) => k + 1);
            await reload();
          });
        }}
      >
        <input
          key={uploadKey}
          type="file"
          aria-label="知识文件"
          accept=".md,.txt,.pdf"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
        />
        <input
          aria-label="上传标签"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="标签，逗号分隔"
        />
        <button
          className="btn btn-primary"
          disabled={busy || !currentId || !files.length}
        >
          <Upload size={15} />
          上传知识
        </button>
      </form>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await apiSend("/api/knowledge/url", "POST", {
              projectId: currentId,
              url,
              tags
            });
            setUrl("");
            await reload();
          });
        }}
      >
        <input
          aria-label="知识网页地址"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
        />
        <button className="btn" disabled={busy || !currentId || !url.trim()}>
          URL 入库
        </button>
      </form>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const data = await apiGet<{ cards: Card[]; mode: string }>(
              `/api/knowledge/search?projectId=${currentId}&q=${encodeURIComponent(q)}`
            );
            setCards(data.cards);
            setMode(data.mode);
          });
        }}
      >
        <input
          aria-label="知识检索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="检索知识"
        />
        <div className="row-actions">
          <button className="btn" disabled={busy || !currentId || !q.trim()}>
            <Search size={15} />
            检索
          </button>
          {cards && (
            <button
              className="gpt-icon"
              type="button"
              title="清除检索"
              onClick={() => setCards(null)}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </form>
      {cards && (
        <div className="section">
          <h3>{mode === "semantic" ? "语义检索" : "关键词检索"}</h3>
          {!cards.length && <p className="hint">没有找到相关内容</p>}
          {cards.map((card) => (
            <button
              key={card.id}
              className="source-card"
              onClick={() =>
                void run(async () => {
                  const doc = await loadDoc(card.id);
                  openTab(
                    {
                      path: knowledgeTabPath(doc.id, doc.title),
                      content: doc.text || "",
                      original: doc.text || ""
                    },
                    currentId!
                  );
                })
              }
            >
              <strong>{card.title}</strong>
              <span>{card.snippet}</span>
            </button>
          ))}
        </div>
      )}
      <div className="section">
        <h3>文档 · {docs.length}</h3>
        {!docs.length && <p className="hint">暂无知识文档</p>}
        {docs.map((doc) => (
          <div className="tool-list-item" key={doc.id}>
            <button
              className="list-btn"
              onClick={() =>
                void run(async () => {
                  const d = await loadDoc(doc.id);
                  openTab(
                    {
                      path: knowledgeTabPath(d.id, d.title),
                      content: d.text || "",
                      original: d.text || ""
                    },
                    currentId!
                  );
                })
              }
            >
              <BookOpen size={15} />
              <span>
                {doc.title}
                <small>{doc.tags}</small>
              </span>
            </button>
            <button
              className="gpt-icon"
              title={`编辑 ${doc.title}`}
              aria-label={`编辑 ${doc.title}`}
              disabled={busy}
              onClick={() =>
                void run(async () => setEditing(await loadDoc(doc.id)))
              }
            >
              <Pencil size={15} />
            </button>
            <button
              className="gpt-icon"
              title={`引用 ${doc.title}`}
              aria-label={`引用 ${doc.title}`}
              onClick={() => setCiteDraft(`@知识 ${JSON.stringify(doc.title)}`)}
            >
              <BookOpen size={15} />
            </button>
            <button
              className="gpt-icon btn-danger"
              title={`删除 ${doc.title}`}
              aria-label={`删除 ${doc.title}`}
              disabled={busy}
              onClick={() => {
                if (window.confirm(`删除知识文档 ${doc.title}？`))
                  void run(async () => {
                    await apiSend(`/api/knowledge/${doc.id}`, "DELETE");
                    setCards(null);
                    await reload();
                  });
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <Modal
        open={!!editing}
        onClose={() => {
          if (!busy) setEditing(null);
        }}
        label="编辑知识"
      >
        {editing && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await apiSend(`/api/knowledge/${editing.id}`, "PATCH", {
                  title: editing.title,
                  tags: editing.tags,
                  text: editing.text || ""
                });
                setEditing(null);
                setCards(null);
                await reload();
              });
            }}
          >
            <h2>编辑知识</h2>
            {error}
            <label>
              标题
              <input
                value={editing.title}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
                required
              />
            </label>
            <label>
              标签
              <input
                value={editing.tags}
                onChange={(e) =>
                  setEditing({ ...editing, tags: e.target.value })
                }
              />
            </label>
            <label>
              正文
              <textarea
                className="document-editor"
                value={editing.text || ""}
                onChange={(e) =>
                  setEditing({ ...editing, text: e.target.value })
                }
              />
            </label>
            <div className="row-actions">
              <button
                className="btn"
                type="button"
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !editing.title.trim()}
              >
                <Save size={15} />
                保存
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
