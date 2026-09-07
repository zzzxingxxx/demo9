import type { TreeNode } from "../files.js";
import { type ChatRef } from "./assemble.js";

export type Mention = { kind: ChatRef["kind"]; name: string };

const KIND_BY_LABEL: Record<string, ChatRef["kind"]> = {
  文件: "file",
  文件夹: "folder",
  知识: "knowledge",
  规则: "rules"
};

export function parseAtMentions(input: string): Mention[] {
  const found: Mention[] = [];
  const re = /@(文件夹|文件|知识|规则)(?:[:：\s]+([^\s@，、。；]+))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input))) {
    const kind = KIND_BY_LABEL[match[1] ?? ""];
    if (!kind) continue;
    found.push({ kind, name: match[2] || "" });
  }
  return found;
}

export type RefLoaders = {
  readFile: (rel: string) => Promise<string>;
  listTree: () => Promise<TreeNode[]>;
  loadRules: () => Promise<{ file: string | null; content: string }>;
  loadKnowledge: (name: string) => Promise<{ title: string; content: string } | null>;
};

function flattenFiles(nodes: TreeNode[], prefix = ""): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type === "file") {
      if (!prefix || node.rel === prefix || node.rel.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)) {
        out.push(node.rel);
      }
    }
    if (node.children) out.push(...flattenFiles(node.children, prefix));
  }
  return out;
}

export async function resolveChatRefs(mentions: Mention[], loaders: RefLoaders): Promise<ChatRef[]> {
  const refs: ChatRef[] = [];
  for (const mention of mentions) {
    if (mention.kind === "file") {
      if (!mention.name) continue;
      const content = await loaders.readFile(mention.name);
      refs.push({ kind: "file", name: mention.name, content });
    } else if (mention.kind === "folder") {
      const tree = await loaders.listTree();
      const files = flattenFiles(tree, mention.name);
      const listing = files.join("\n");
      refs.push({ kind: "folder", name: mention.name || ".", content: listing || "(空目录)" });
    } else if (mention.kind === "rules") {
      const rules = await loaders.loadRules();
      refs.push({ kind: "rules", name: rules.file || "规则", content: rules.content || "(无规则文件)" });
    } else if (mention.kind === "knowledge") {
      const doc = await loaders.loadKnowledge(mention.name);
      if (doc) refs.push({ kind: "knowledge", name: doc.title, content: doc.content });
    }
  }
  return refs;
}
