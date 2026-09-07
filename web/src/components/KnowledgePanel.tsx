import { FormEvent, useEffect, useState } from "react";
import { apiGet, apiSend } from "../api";
import { useWorkbench } from "../store";

type Doc = { id: string; title: string; tags: string };

export function KnowledgePanel() {
  const { currentId, setNotice } = useWorkbench();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);

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
    if (!currentId || !file) return;
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    try {
      await apiSend("/api/knowledge", "POST", {
        projectId: currentId,
        filename: file.name,
        tags,
        contentBase64: btoa(binary)
      });
      setFile(null);
      setTags("");
      await reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "上传失败");
    }
  }

  if (!currentId) return <p className="hint">先选择项目。</p>;

  return (
    <div>
      <form className="stack" onSubmit={onUpload}>
        <input
          type="file"
          accept=".md,.txt,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="标签，逗号分隔" />
        <button className="btn btn-primary" type="submit" disabled={!file}>
          上传知识
        </button>
      </form>
      {docs.map((d) => (
        <div key={d.id} className="hint">
          {d.title}
          {d.tags ? ` · ${d.tags}` : ""}
        </div>
      ))}
    </div>
  );
}
