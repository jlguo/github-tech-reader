import { useState, useRef, useEffect } from "react";
import { List, Code2, ExternalLink, ChevronRight } from "lucide-react";
import { htmlContent } from "./readerData";
import { Book } from "../bookData";

interface HtmlReaderProps {
  book: Book;
}

const tocItemStyle = (level: number, active: boolean): React.CSSProperties => ({
  paddingLeft: level === 1 ? "12px" : "24px",
  fontFamily: "Inter, sans-serif",
  fontSize: level === 1 ? "0.8rem" : "0.75rem",
  fontWeight: level === 1 ? 600 : 400,
  color: active ? "#c25b16" : level === 1 ? "#2c1a0e" : "#7a6248",
  background: active ? "rgba(194,91,22,0.08)" : "transparent",
  borderLeft: active ? "2px solid #c25b16" : "2px solid transparent",
  padding: `6px 12px 6px ${level === 1 ? 12 : 24}px`,
  display: "block",
  width: "100%",
  textAlign: "left" as const,
  cursor: "pointer",
  transition: "all 0.15s",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

// Inject scoped styles into the HTML string
const scopedHtml = `
<style>
  .html-reader-body {
    font-family: "Source Serif 4", serif;
    color: #2c1a0e;
    font-size: 16px;
    line-height: 1.85;
  }
  .html-reader-body h1 {
    font-family: "Playfair Display", serif;
    font-size: 1.6rem;
    font-weight: 700;
    color: #2c1a0e;
    margin: 2rem 0 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid #c25b16;
  }
  .html-reader-body h2 {
    font-family: "Playfair Display", serif;
    font-size: 1.15rem;
    font-weight: 600;
    color: #3a2010;
    margin: 1.75rem 0 0.75rem;
  }
  .html-reader-body h3 {
    font-family: "Inter", sans-serif;
    font-size: 0.95rem;
    font-weight: 600;
    color: #5c3d1e;
    margin: 1.25rem 0 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .html-reader-body p {
    margin: 0 0 1rem;
    text-align: justify;
  }
  .html-reader-body ul, .html-reader-body ol {
    margin: 0.5rem 0 1rem 1.5rem;
  }
  .html-reader-body li {
    margin-bottom: 0.4rem;
  }
  .html-reader-body strong {
    font-weight: 600;
    color: #3a2010;
  }
  .html-reader-body code {
    font-family: "JetBrains Mono", monospace;
    font-size: 0.82rem;
    background: #ede5d4;
    color: #8b3a0a;
    padding: 1px 5px;
    border-radius: 3px;
  }
  .html-reader-body pre {
    background: #2c1a0e;
    color: #e8d8c0;
    padding: 1rem 1.25rem;
    border-radius: 8px;
    overflow-x: auto;
    margin: 1rem 0;
    font-size: 0.82rem;
    line-height: 1.65;
  }
  .html-reader-body pre code {
    background: transparent;
    color: inherit;
    padding: 0;
    font-size: inherit;
  }
  .html-reader-body blockquote {
    margin: 1.25rem 0;
    padding: 0.75rem 1.25rem;
    border-left: 3px solid #c25b16;
    background: #fdf5ec;
    border-radius: 0 6px 6px 0;
    font-style: italic;
    color: #5c3d1e;
  }
  .html-reader-body blockquote p {
    margin: 0;
  }
  .html-reader-body a {
    color: #c25b16;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .html-reader-body table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
    font-size: 0.875rem;
  }
  .html-reader-body th {
    background: #5c3d1e;
    color: white;
    padding: 8px 12px;
    text-align: left;
    font-family: "Inter", sans-serif;
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .html-reader-body td {
    padding: 8px 12px;
    border-bottom: 1px solid #ede5d4;
    color: #2c1a0e;
  }
  .html-reader-body tr:nth-child(even) td {
    background: #faf6ed;
  }
</style>
<div class="html-reader-body">${htmlContent.html}</div>
`;

export function HtmlReader({ book }: HtmlReaderProps) {
  const [showToc, setShowToc] = useState(true);
  const [showSource, setShowSource] = useState(false);
  const [activeId, setActiveId] = useState("s1");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Source+Serif+4:wght@300;400;600&family=Inter:wght@400;500;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
    </head><body style="margin:0;padding:0;">${scopedHtml}</body></html>`);
    doc.close();

    // Track scroll position to update active TOC item
    const win = iframe.contentWindow;
    if (!win) return;
    const onScroll = () => {
      const headings = doc.querySelectorAll("h1[id], h2[id]");
      let current = "s1";
      headings.forEach(el => {
        if ((el as HTMLElement).offsetTop - 80 <= win.scrollY) {
          current = el.id;
        }
      });
      setActiveId(current);
    };
    win.addEventListener("scroll", onScroll);
    return () => win.removeEventListener("scroll", onScroll);
  }, [showSource]);

  const scrollTo = (id: string) => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    const el = doc?.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
  };

  return (
    <div className="flex h-full" style={{ background: "#f5f0e8" }}>
      {/* TOC sidebar */}
      {showToc && (
        <aside
          className="w-52 flex-shrink-0 flex flex-col border-r overflow-hidden"
          style={{ background: "#fffdf7", borderColor: "rgba(92,61,30,0.12)" }}
        >
          <div
            className="px-4 py-3 border-b flex items-center justify-between"
            style={{ borderColor: "rgba(92,61,30,0.12)" }}
          >
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#7a6248", fontFamily: "Inter, sans-serif" }}>
              目录
            </span>
            <span className="text-xs" style={{ color: "#b5a08a", fontFamily: "Inter, sans-serif" }}>
              {htmlContent.toc.length} 节
            </span>
          </div>
          <nav className="flex-1 overflow-y-auto py-2">
            {htmlContent.toc.map(item => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                style={tocItemStyle(item.level, activeId === item.id)}
              >
                {item.level === 2 && (
                  <ChevronRight size={10} style={{ display: "inline", marginRight: "4px", opacity: 0.5 }} />
                )}
                {item.title}
              </button>
            ))}
          </nav>
        </aside>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div
          className="flex items-center gap-2 px-4 py-2 border-b flex-shrink-0"
          style={{ background: "#fffdf7", borderColor: "rgba(92,61,30,0.1)" }}
        >
          <button
            onClick={() => setShowToc(v => !v)}
            className="p-1.5 rounded transition-colors"
            style={{
              background: showToc ? "rgba(194,91,22,0.12)" : "transparent",
              color: showToc ? "#c25b16" : "#7a6248",
            }}
            title="目录"
          >
            <List size={16} />
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 flex-1 min-w-0 text-xs overflow-hidden" style={{ fontFamily: "Inter, sans-serif", color: "#b5a08a" }}>
            <span className="truncate">{book.title}</span>
            <span>/</span>
            <span className="truncate" style={{ color: "#c25b16" }}>
              {htmlContent.toc.find(t => t.id === activeId)?.title || ""}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSource(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors"
              style={{
                background: showSource ? "rgba(194,91,22,0.12)" : "transparent",
                color: showSource ? "#c25b16" : "#7a6248",
                fontFamily: "Inter, sans-serif",
                border: "1px solid rgba(194,91,22,0.2)",
              }}
            >
              <Code2 size={13} />
              {showSource ? "预览" : "源码"}
            </button>
            <button
              className="p-1.5 rounded transition-colors"
              style={{ color: "#7a6248" }}
              title="在新窗口打开"
            >
              <ExternalLink size={15} />
            </button>
          </div>
        </div>

        {/* Content */}
        {showSource ? (
          <div className="flex-1 overflow-auto" style={{ background: "#1e1410" }}>
            <pre
              className="p-6 text-xs leading-relaxed h-full"
              style={{ fontFamily: "JetBrains Mono, monospace", color: "#e8d8c0", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}
            >
              <span style={{ color: "#b5a08a" }}>{`<!DOCTYPE html>\n<html lang="zh">\n<head>\n  <meta charset="UTF-8">\n  <title>CSS权威指南</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n`}</span>
              {htmlContent.html
                .replace(/</g, "<")
                .replace(/>/g, ">")
                .split("\n")
                .map((line, i) => {
                  const indent = line.match(/^(\s*)/)?.[1] || "";
                  const rest = line.slice(indent.length);
                  const colored = rest
                    .replace(/(&lt;\/?[a-z0-9]+)/g, '<span style="color:#c25b16">$1</span>')
                    .replace(/((?:class|id|href|src)=&quot;[^&]*&quot;)/g, '<span style="color:#8bc25b">$1</span>');
                  return (
                    <span key={i}>
                      <span style={{ color: "#5a4030", userSelect: "none", marginRight: "16px", fontSize: "0.7rem" }}>
                        {String(i + 1).padStart(3, " ")}
                      </span>
                      <span dangerouslySetInnerHTML={{ __html: indent + colored }} />
                      {"\n"}
                    </span>
                  );
                })}
              <span style={{ color: "#b5a08a" }}>{`</body>\n</html>`}</span>
            </pre>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            className="flex-1 w-full border-0"
            title="html-reader"
            sandbox="allow-same-origin"
            style={{ background: "#faf6ed" }}
          />
        )}

        {/* Status bar */}
        <div
          className="flex items-center justify-between px-4 py-1.5 border-t flex-shrink-0"
          style={{ background: "#fffdf7", borderColor: "rgba(92,61,30,0.08)" }}
        >
          <span className="text-xs" style={{ color: "#b5a08a", fontFamily: "Inter, sans-serif" }}>
            HTML · UTF-8
          </span>
          <span className="text-xs" style={{ color: "#b5a08a", fontFamily: "Inter, sans-serif" }}>
            已读 {book.progress}% · 第 {book.currentPage} / {book.totalPages} 页
          </span>
        </div>
      </div>
    </div>
  );
}
