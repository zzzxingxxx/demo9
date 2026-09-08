import { parseInline, parseMarkdown } from "@wb/shared";

function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((span, i) => {
        if (span.type === "code") return <code key={i}>{span.value}</code>;
        if (span.type === "bold") return <strong key={i}>{span.value}</strong>;
        if (span.type === "link") {
          return (
            <a key={i} href={span.href} target="_blank" rel="noreferrer">
              {span.text}
            </a>
          );
        }
        return <span key={i}>{span.value}</span>;
      })}
    </>
  );
}

export function MarkdownBody({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  if (blocks.length === 0) return <p className="md-p">{text}</p>;
  return (
    <div className="md-body">
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          const Tag = (block.level <= 1 ? "h3" : block.level === 2 ? "h4" : "h5") as "h3" | "h4" | "h5";
          return (
            <Tag key={i}>
              <InlineText text={block.text} />
            </Tag>
          );
        }
        if (block.type === "code") {
          return (
            <pre key={i} className="md-code">
              <code>{block.code}</code>
            </pre>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>
                  <InlineText text={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="md-p">
            <InlineText text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
