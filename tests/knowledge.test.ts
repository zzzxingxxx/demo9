import { describe, expect, it } from "vitest";
import {
  attachKnowledgeSlices,
  extractDocumentText,
  parseTags,
  sliceText
} from "../server/src/lib/knowledge.ts";
import type { KnowledgeDoc } from "../server/src/lib/db/schema.ts";

function helloPdf(): Uint8Array {
  const text = "Hello Knowledge";
  const stream = `BT /F1 12 Tf 20 50 Td (${text}) Tj ET`;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 80] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj"
  ];
  const body = objects.join("\n");
  const header = "%PDF-1.4\n";
  const xrefOffset = header.length + body.length + 1;
  const pdf = `${header}${body}\nxref\n0 6\n0000000000 65535 f \ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function doc(partial: Partial<KnowledgeDoc> & Pick<KnowledgeDoc, "title" | "text">): KnowledgeDoc {
  return {
    id: partial.id || "1",
    projectId: "p",
    title: partial.title,
    tags: partial.tags || "",
    sourceName: partial.title,
    text: partial.text,
    createdAt: 1
  };
}

describe("knowledge extract and attach", () => {
  it("extracts md/txt and PDF text, then attachKnowledgeSlices pulls tagged docs", async () => {
    const md = await extractDocumentText("note.md", new TextEncoder().encode("# 标题\n内容"));
    expect(md).toContain("标题");
    const txt = await extractDocumentText("a.txt", new TextEncoder().encode("plain"));
    expect(txt).toBe("plain");

    const pdfText = await extractDocumentText("doc.pdf", helloPdf());
    expect(pdfText).toContain("Hello Knowledge");

    expect(parseTags("架构, 后端")).toEqual(["架构", "后端"]);
    expect(sliceText("abcdef", 2)).toEqual(["ab", "cd", "ef"]);

    const attached = attachKnowledgeSlices(
      [
        doc({ title: "架构.md", tags: "架构", text: "分层说明" }),
        doc({ title: "无关.md", tags: "", text: "skip" })
      ],
      "架构"
    );
    expect(attached).toContain("架构.md");
    expect(attached).toContain("分层说明");
    expect(attached).not.toContain("skip");
  });
});
