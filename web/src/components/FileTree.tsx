import { File, Folder } from "lucide-react";
import { apiGet } from "../api";
import { useWorkbench, type TreeNode } from "../store";

function NodeView({ node, onOpen }: { node: TreeNode; onOpen: (rel: string) => void }) {
  if (node.type === "dir") {
    return (
      <details open className="tree-dir">
        <summary>
          <Folder size={12} /> {node.name}
        </summary>
        <div className="tree-children">
          {(node.children || []).map((child) => (
            <NodeView key={child.rel} node={child} onOpen={onOpen} />
          ))}
        </div>
      </details>
    );
  }
  return (
    <button type="button" className="list-btn tree-file" onClick={() => onOpen(node.rel)}>
      <File size={12} /> {node.name}
    </button>
  );
}

export function FileTree() {
  const { currentId, tree, setTree, openTab, setNotice } = useWorkbench();

  async function openFile(rel: string) {
    if (!currentId) return;
    try {
      const data = await apiGet<{ path: string; content: string }>(
        `/api/files/content?projectId=${encodeURIComponent(currentId)}&path=${encodeURIComponent(rel)}`
      );
      openTab({ path: data.path, content: data.content, original: data.content });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "打开失败");
    }
  }

  if (!currentId) return <p className="hint">先选择项目。</p>;
  if (tree.length === 0) {
    return (
      <p className="hint">
        没有可显示的文件。
        <button
          type="button"
          className="btn"
          onClick={() => {
            apiGet<{ tree: TreeNode[] }>(`/api/files?projectId=${encodeURIComponent(currentId)}`)
              .then((d) => setTree(d.tree))
              .catch((err: unknown) => setNotice(err instanceof Error ? err.message : "无法列出文件"));
          }}
        >
          刷新文件树
        </button>
      </p>
    );
  }
  return (
    <div>
      {tree.map((node) => (
        <NodeView key={node.rel} node={node} onOpen={openFile} />
      ))}
    </div>
  );
}
