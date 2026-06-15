import { useState, useRef, useEffect, useCallback } from "react";
import { Book } from "../bookData";
import { htmlContent as mockContent } from "./readerData";

interface HtmlReaderProps { book: Book; }

interface TocItem { id: string; title: string; level: number; }

const API = "http://localhost:8000/api";

const tocItemStyle = (level: number, active: boolean): React.CSSProperties => ({
  paddingLeft: level === 1 ? "12px" : "24px",
  fontFamily: "Inter, sans-serif",
  fontSize: level === 1 ? "0.8rem" : "0.75rem",
  fontWeight: level === 1 ? 600 : 400,
  color: active ? "#c25b16" : level === 1 ? "#2c1a0e" : "#7a6248",
  background: active ? "rgba(194,91,22,0.08)" : "transparent",
  borderLeft: active ? "2px solid #c25b16" : "2px solid transparent",
  padding: `6px 12px 6px ${level === 1 ? 12 : 24}px`,
  display: "block", width: "100%", textAlign: "left" as const,
  cursor: "pointer", transition: "all 0.15s",
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
});

function extractToc(html: string): TocItem[] {
  const items: TocItem[] = [];
  const regex = /<h([1-3])[^>]*>\s*(.*?)\s*<\/h\1>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const level = parseInt(match[1]);
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    items.push({ id: `s${items.length}`, title: title || `Section ${items.length}`, level });
  }
  return items;
}

function injectAnchorIds(html: string): string {
  let idx = 0;
  return html.replace(/<h([1-3])([^>]*)>/gi, (_, level, attrs) => {
    if (attrs.includes("id=")) return `<h${level}${attrs}>`;
    return `<h${level} id="s${idx++}"${attrs}>`;
  });
}

export function HtmlReader({ book }: HtmlReaderProps) {
  const [realHtml, setRealHtml] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState("s0");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (book.category === "generated") {
      fetch(`${API}/books/by-repo/${book.id}`)
        .then(r => r.json())
        .then(d => { setRealHtml(d.html_content); setLoaded(true); })
        .catch(() => setLoaded(true));
    } else {
      setLoaded(true);
    }
  }, [book.id, book.category]);

  const displayHtml = realHtml || mockContent.html;
  const anchoredHtml = injectAnchorIds(displayHtml);
  const tocItems = extractToc(displayHtml);

  const scrollToSection = useCallback((id: string) => {
    setActiveId(id);
    const iframe = contentRef.current?.querySelector("iframe");
    if (!iframe?.contentDocument) return;
    const el = iframe.contentDocument.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleContentLoad = useCallback(() => {
    const iframe = contentRef.current?.querySelector("iframe");
    if (!iframe?.contentDocument) return;

    const doc = iframe.contentDocument;

    const onIntersect = (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target.id.startsWith("s")) {
          setActiveId(entry.target.id);
        }
      }
    };

    const observer = new IntersectionObserver(onIntersect, {
      root: doc,
      rootMargin: "-10% 0px -60% 0px",
      threshold: 0,
    });

    doc.querySelectorAll("h1[id],h2[id],h3[id]").forEach(el => observer.observe(el));

    const onScroll = () => {
      const maxScroll = doc.documentElement.scrollHeight - doc.documentElement.clientHeight;
      const position = maxScroll > 0 ? doc.documentElement.scrollTop / maxScroll : 0;
      const activeIdx = tocItems.findIndex(t => t.id === activeId);
      const section = activeIdx >= 0 ? tocItems[activeIdx].title : null;
      if (book.category === "generated") {
        fetch(`${API}/reading/progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo_id: book.id, section, position: Math.round(position * 100), completed: position > 0.95 }),
        }).catch(() => {});
      }
    };

    let timer: ReturnType<typeof setTimeout>;
    doc.addEventListener("scroll", () => { clearTimeout(timer); timer = setTimeout(onScroll, 2000); }, { passive: true });

    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [book.id, book.category, activeId, tocItems]);

  if (!loaded) {
    return <div className="flex items-center justify-center h-full" style={{ color: "var(--muted-foreground)" }}>加载中...</div>;
  }

  const scopedHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    html,body{height:100%;margin:0;padding:0}
    body{font-family:"Source Serif 4",serif;color:#2c1a0e;font-size:16px;line-height:1.85;max-width:720px;margin:0 auto;padding:2rem 1.5rem 4rem;background:#f5f0e8;scroll-behavior:smooth}
    h1{font-family:"Playfair Display",serif;font-size:1.6rem;color:#5c3d1e;margin-top:0;padding-top:1rem}
    h2{font-family:"Playfair Display",serif;font-size:1.2rem;color:#5c3d1e;margin-top:2.5rem;padding-top:0.5rem}
    h3{font-family:"Playfair Display",serif;font-size:1rem;color:#8b5a2b;margin-top:2rem}
    a{color:#c17f3a}
    pre{background:#ede5d4;padding:1rem;border-radius:8px;overflow-x:auto}
    code{font-family:"Fira Code",monospace;font-size:0.9em}
    img{max-width:100%;border-radius:8px}
    blockquote{border-left:3px solid #c17f3a;padding-left:1rem;margin-left:0;color:#7a6248}
    table{width:100%;border-collapse:collapse;margin:1rem 0}
    th,td{border:1px solid rgba(92,61,30,0.15);padding:8px 12px;text-align:left}
  </style></head><body>${anchoredHtml}</body></html>`;

  return (
    <div className="flex h-full">
      <aside className="w-56 flex-shrink-0 overflow-y-auto border-r" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="p-4 font-semibold text-sm" style={{ color: "var(--foreground)", fontFamily: "Playfair Display, serif" }}>
          目录 ({tocItems.length} 节)
        </div>
        {tocItems.map((item) => (
          <button
            key={item.id}
            style={tocItemStyle(item.level, item.id === activeId)}
            onClick={() => scrollToSection(item.id)}
          >
            {item.title}
          </button>
        ))}
      </aside>
      <main className="flex-1 h-full" style={{ background: "#f5f0e8" }}>
        <div ref={contentRef} className="h-full w-full">
          <iframe
            srcDoc={scopedHtml}
            style={{ width: "100%", height: "100%", border: "none" }}
            onLoad={handleContentLoad}
            sandbox="allow-same-origin"
          />
        </div>
      </main>
    </div>
  );
}
