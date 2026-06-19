import { useState, useRef, useEffect, useCallback } from "react";
import { FileText, ChevronDown, ChevronRight, List } from "lucide-react";
import { docContent } from "./readerData";
import { Book } from "../bookData";
import { getDataService } from "../../../services/api";
import { useReadingProgress } from "../../hooks/useReadingProgress";

const SCROLL_DEBOUNCE_MS = 2000;

interface DocReaderProps {
  book: Book;
}

interface TocItem {
  id: string;
  title: string;
  level: number;
}

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

const CONTENT_CSS = `
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
  p{margin:0.8em 0}
`;

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

export function DocReader({ book }: DocReaderProps) {
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({ 0: true, 1: true, 2: true, 3: true });
  const [realHtml, setRealHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState("s0");
  const [showMobileToc, setShowMobileToc] = useState(false);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { save } = useReadingProgress(book.id);

  const toggle = (i: number) => setExpandedSections(v => ({ ...v, [i]: !v[i] }));

  useEffect(() => {
    if (book.isDemo) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const svc = await getDataService();
        const blobUrl = await svc.getImportedFileBlobUrl(book.id);
        if (cancelled) return;
        if (!blobUrl) {
          setError("无法加载文档");
          return;
        }
        const resp = await fetch(blobUrl);
        const buf = await resp.arrayBuffer();
        if (cancelled) return;
        const mammoth = (await import("mammoth/mammoth.browser")).default;
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (cancelled) return;
        setRealHtml(result.value);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "文档加载失败");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [book.id, book.isDemo]);

  const tocItems = realHtml ? extractToc(realHtml) : [];

  const scrollToSection = useCallback((id: string) => {
    setActiveId(id);
    setShowMobileToc(false);
    const iframe = wrapperRef.current?.querySelector("iframe");
    const el = iframe?.contentDocument?.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleContentLoad = useCallback(() => {
    const iframe = wrapperRef.current?.querySelector("iframe");
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
      const pct = Math.round(position * 100);

      save({
        percent: pct,
        completed: position > 0.95,
        metadata: {},
      });
    };

    let timer: ReturnType<typeof setTimeout>;
    doc.addEventListener("scroll", () => { clearTimeout(timer); timer = setTimeout(onScroll, SCROLL_DEBOUNCE_MS); }, { passive: true });

    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [save]);

  if (book.isDemo) {
    return (
      <div className="flex h-full" style={{ background: "#f5f5f5" }}>
        <aside className="w-52 flex-shrink-0 hidden sm:flex flex-col border-r" data-testid="doc-reader-outline" style={{ background: "#fafafa", borderColor: "#e0e0e0" }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "#e0e0e0" }}>
            <FileText size={14} style={{ color: "#1a73e8" }} />
            <span className="text-xs font-semibold" style={{ color: "#333", fontFamily: "Inter, sans-serif" }}>文档大纲</span>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {docContent.sections.map((sec, i) => (
              <div key={i}>
                <button
                  onClick={() => toggle(i)}
                  data-testid={`doc-reader-section-${i}`}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-gray-100 transition-colors"
                  style={{ color: "#333", fontFamily: "Inter, sans-serif" }}
                >
                  {expandedSections[i] ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  {sec.heading}
                </button>
              </div>
            ))}
          </div>
        </aside>

        <div className="flex-1 overflow-y-auto flex justify-center py-6 px-4" data-testid="doc-reader-body" style={{ background: "#e8e8e8" }}>
          <div className="w-full max-w-3xl shadow-lg" style={{ background: "#ffffff" }}>
            <div
              className="flex items-center gap-4 px-6 py-2 border-b"
              style={{ background: "#f3f2f1", borderColor: "#d0d0d0" }}
            >
              {["文件", "开始", "插入", "设计", "布局", "引用", "审阅", "视图"].map(tab => (
                <button
                  key={tab}
                  data-testid={`doc-reader-tab-${tab}`}
                  className="text-xs py-1 px-2 rounded transition-colors hover:bg-gray-200"
                  style={{ color: tab === "开始" ? "#1a73e8" : "#444", fontFamily: "Inter, sans-serif", fontWeight: tab === "开始" ? 600 : 400 }}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="px-8 py-6">
              <h1 className="text-xl font-bold mb-1" style={{ color: "#1a1a1a", fontFamily: "Playfair Display, serif" }}>{docContent.title}</h1>
              <p className="text-xs mb-6" style={{ color: "#666" }}>{docContent.subtitle}</p>

              {docContent.sections.map((sec, i) => (
                expandedSections[i] && (
                  <div key={i} className="mb-6">
                    <h2 className="text-base font-semibold mb-3" style={{ color: "#1a1a1a", fontFamily: "Inter, sans-serif" }}>{sec.heading}</h2>
                    {sec.content && <p className="text-xs leading-relaxed mb-2" style={{ color: "#444" }}>{sec.content}</p>}
                    {sec.bullets && (
                      <ul className="list-disc pl-4 space-y-1">
                        {sec.bullets.map((b, j) => <li key={j} className="text-xs" style={{ color: "#444" }}>{b}</li>)}
                      </ul>
                    )}
                    {sec.table && (
                      <table className="w-full text-xs mt-2 border-collapse" style={{ borderColor: "#ddd" }}>
                        <thead>
                          <tr style={{ background: "#f5f5f5" }}>
                            {sec.table.headers.map((h, j) => <th key={j} className="border px-3 py-2 text-left font-semibold" style={{ borderColor: "#ddd" }}>{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {sec.table.rows.map((row, j) => (
                            <tr key={j}>
                              {row.map((c, k) => <td key={k} className="border px-3 py-2" style={{ borderColor: "#ddd" }}>{c}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center text-red-500 p-4">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: "var(--background)", color: "var(--muted-foreground)" }}>
        加载中...
      </div>
    );
  }

  const displayHtml = realHtml || "";
  const anchoredHtml = injectAnchorIds(displayHtml);
  const scopedHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CONTENT_CSS}</style></head><body>${anchoredHtml}</body></html>`;

  return (
    <div className="flex h-full" style={{ background: "#f5f5f5" }}>
      {tocItems.length > 0 && (
        <>
          <aside
            className="w-52 flex-shrink-0 hidden sm:flex flex-col border-r"
            data-testid="doc-reader-outline"
            style={{ background: "#fafafa", borderColor: "#e0e0e0" }}
          >
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "#e0e0e0" }}>
              <FileText size={14} style={{ color: "#1a73e8" }} />
              <span className="text-xs font-semibold" style={{ color: "#333", fontFamily: "Inter, sans-serif" }}>文档大纲</span>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {tocItems.map((item, i) => (
                <button
                  key={item.id}
                  data-testid={`doc-reader-section-${i}`}
                  className="block w-full text-left transition-colors"
                  style={tocItemStyle(item.level, item.id === activeId)}
                  onClick={() => scrollToSection(item.id)}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </aside>

          {showMobileToc && (
            <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm sm:hidden" onClick={() => setShowMobileToc(false)}>
              <div
                className="absolute left-0 top-0 bottom-0 w-64 shadow-lg overflow-y-auto flex flex-col"
                onClick={e => e.stopPropagation()}
                style={{ background: "var(--card)" }}
              >
                <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                    目录 ({tocItems.length} 节)
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto py-2">
                  {tocItems.map(item => (
                    <button
                      key={item.id}
                      className="block w-full text-left transition-colors"
                      style={tocItemStyle(item.level, item.id === activeId)}
                      onClick={() => scrollToSection(item.id)}
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tocItems.length > 0 && (
        <button
          onClick={() => setShowMobileToc(v => !v)}
          className="fixed bottom-16 right-4 sm:hidden z-30 w-10 h-10 rounded-full shadow-lg flex items-center justify-center"
          style={{ background: "var(--accent)", color: "white" }}
        >
          <List size={18} />
        </button>
      )}

      <div className="flex-1 flex flex-col items-center py-6 px-4 overflow-hidden" data-testid="doc-reader-body" style={{ background: "#e8e8e8" }}>
        <div className="w-full max-w-3xl shadow-lg flex flex-col min-h-0" style={{ background: "#ffffff" }}>
          <div
            className="flex items-center gap-4 px-6 py-2 border-b flex-shrink-0"
            style={{ background: "#f3f2f1", borderColor: "#d0d0d0" }}
          >
            {["文件", "开始", "插入", "设计", "布局", "引用", "审阅", "视图"].map(tab => (
              <button
                key={tab}
                data-testid={`doc-reader-tab-${tab}`}
                className="text-xs py-1 px-2 rounded transition-colors hover:bg-gray-200"
                style={{ color: tab === "开始" ? "#1a73e8" : "#444", fontFamily: "Inter, sans-serif", fontWeight: tab === "开始" ? 600 : 400 }}
              >
                {tab}
              </button>
            ))}
          </div>

          <div ref={wrapperRef} className="flex-1 min-h-0">
            <iframe
              srcDoc={scopedHtml}
              className="w-full h-full border-none"
              title={book.title}
              onLoad={handleContentLoad}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
