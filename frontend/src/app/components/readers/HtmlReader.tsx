import { useState, useRef, useEffect, useCallback } from "react";
import { List } from "lucide-react";
import { Book } from "../bookData";
import { htmlContent as mockContent } from "./readerData";
import { API_BASE_URL } from "../../../config/api";

const SCROLL_DEBOUNCE_MS = 2000;

interface HtmlReaderProps { book: Book; }

interface TocItem { id: string; title: string; level: number; }

const tocItemStyle = (level: number, active: boolean): React.CSSProperties => ({
  paddingLeft: level === 1 ? "12px" : "24px",
  fontFamily: "Inter, sans-serif",
  fontSize: level === 1 ? "0.8rem" : "0.75rem",
  fontWeight: level === 1 ? 600 : 400,
  color: active ? "var(--accent)" : level === 1 ? "var(--foreground)" : "var(--muted-foreground)",
  background: active ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
  borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
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
    const cleaned = attrs.replace(/\s*id\s*=\s*(["'])[^"']*\1/gi, "");
    return `<h${level} id="s${idx++}"${cleaned}>`;
  });
}

export function HtmlReader({ book }: HtmlReaderProps) {
  const [realHtml, setRealHtml] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState("s0");
  const [showMobileToc, setShowMobileToc] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (book.category === "generated") {
      fetch(`${API_BASE_URL}/books/by-repo/${book.id}`)
        .then(r => r.json())
        .then(d => { setRealHtml(d.html_content); setLoaded(true); })
        .catch(() => setLoaded(true));
    } else if (book.category === "documents" && !book.isDemo) {
      fetch(`${API_BASE_URL}/books/${book.id}`)
        .then(r => r.json())
        .then(d => { setRealHtml(d.html_content); setLoaded(true); })
        .catch(() => setLoaded(true));
    } else {
      setLoaded(true);
    }
  }, [book.id, book.category, book.isDemo]);

  const displayHtml = realHtml || mockContent.html;
  const anchoredHtml = injectAnchorIds(displayHtml);
  const tocItems = extractToc(displayHtml);

  const scrollToSection = useCallback((id: string) => {
    setActiveId(id);
    setShowMobileToc(false);
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
        fetch(`${API_BASE_URL}/reading/progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo_id: book.id, section, position: Math.round(position * 100), completed: position > 0.95 }),
        }).catch(() => {});
      }
    };

    let timer: ReturnType<typeof setTimeout>;
    doc.addEventListener("scroll", () => { clearTimeout(timer); timer = setTimeout(onScroll, SCROLL_DEBOUNCE_MS); }, { passive: true });

    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [book.id, book.category, activeId, tocItems]);

  if (!loaded) {
    return <div className="flex items-center justify-center h-full" data-testid="html-reader-loading" style={{ color: "var(--muted-foreground)" }}>加载中...</div>;
  }

  const scopedHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    :root{--bg:#f5f0e8;--fg:#2c1a0e;--primary:#5c3d1e;--accent:#c17f3a;--muted-fg:#7a6248;--muted:#ede5d4;--border:rgba(92,61,30,0.15)}
    html,body{height:100%;margin:0;padding:0}
    body{font-family:"Source Serif 4",serif;color:var(--fg);font-size:16px;line-height:1.85;max-width:720px;margin:0 auto;padding:2rem 1.5rem 4rem;background:var(--bg);scroll-behavior:smooth}
    h1{font-family:"Playfair Display",serif;font-size:1.6rem;color:var(--primary);margin-top:0;padding-top:1rem}
    h2{font-family:"Playfair Display",serif;font-size:1.2rem;color:var(--primary);margin-top:2.5rem;padding-top:0.5rem}
    h3{font-family:"Playfair Display",serif;font-size:1rem;color:#8b5a2b;margin-top:2rem}
    a{color:var(--accent)}
    pre{background:var(--muted);padding:1rem;border-radius:8px;overflow-x:auto}
    code{font-family:"Fira Code",monospace;font-size:0.9em}
    img{max-width:100%;border-radius:8px}
    blockquote{border-left:3px solid var(--accent);padding-left:1rem;margin-left:0;color:var(--muted-fg)}
    table{width:100%;border-collapse:collapse;margin:1rem 0}
    th,td{border:1px solid var(--border);padding:8px 12px;text-align:left}
  </style></head><body>${anchoredHtml}</body></html>`;

  return (
    <div className="flex h-full relative">
      {/* Desktop TOC sidebar */}
      <aside className="hidden lg:block w-56 flex-shrink-0 overflow-y-auto border-r" data-testid="html-reader-toc" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="p-4 font-semibold text-sm" style={{ color: "var(--foreground)", fontFamily: "Playfair Display, serif" }}>
          目录 ({tocItems.length} 节)
        </div>
        {tocItems.map((item) => (
          <button
            key={item.id}
            data-testid={`html-reader-toc-${item.id}`}
            style={tocItemStyle(item.level, item.id === activeId)}
            onClick={() => scrollToSection(item.id)}
          >
            {item.title}
          </button>
        ))}
      </aside>

      {/* Mobile TOC overlay */}
      {showMobileToc && (
        <div className="lg:hidden fixed inset-0 z-30 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileToc(false)} data-testid="html-reader-toc-backdrop" />
          <aside className="relative w-64 flex-shrink-0 overflow-y-auto h-full z-40" data-testid="html-reader-toc-mobile" style={{ background: "var(--card)", borderRight: "1px solid var(--border)" }}>
            <div className="p-4 font-semibold text-sm flex items-center justify-between" style={{ color: "var(--foreground)", fontFamily: "Playfair Display, serif" }}>
              <span>目录 ({tocItems.length} 节)</span>
              <button onClick={() => setShowMobileToc(false)} className="text-xs px-2 py-0.5 rounded" style={{ color: "var(--muted-foreground)", background: "var(--muted)" }}>
                关闭
              </button>
            </div>
            {tocItems.map((item) => (
              <button
                key={item.id}
                data-testid={`html-reader-toc-${item.id}`}
                style={tocItemStyle(item.level, item.id === activeId)}
                onClick={() => scrollToSection(item.id)}
              >
                {item.title}
              </button>
            ))}
          </aside>
        </div>
      )}

      {/* Mobile TOC toggle button */}
      <button
        className="lg:hidden fixed bottom-6 left-4 z-20 w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
        style={{ background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)" }}
        onClick={() => setShowMobileToc(v => !v)}
        data-testid="html-reader-toc-toggle"
      >
        <List size={18} />
      </button>

      <main className="flex-1 h-full" data-testid="html-reader-content" style={{ background: "var(--background)" }}>
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
