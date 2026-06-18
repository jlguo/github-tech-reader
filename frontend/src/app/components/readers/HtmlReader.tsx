import { useState, useRef, useEffect, useCallback } from "react";
import { List } from "lucide-react";
import { Book } from "../bookData";
import { htmlContent as mockContent } from "./readerData";
import { getDataService, type IDataService } from "../../../services/api";
import { useReadingProgress } from "../../hooks/useReadingProgress";

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
`;

export function HtmlReader({ book }: HtmlReaderProps) {
  const [realHtml, setRealHtml] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState("s0");
  const [showMobileToc, setShowMobileToc] = useState(false);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [service, setService] = useState<IDataService | null>(null);
  const { save } = useReadingProgress(book.id);

  useEffect(() => {
    getDataService().then(setService);
  }, []);

  useEffect(() => {
    if (!service) return;

    if (book.category === "generated") {
      service.getBookByRepo(book.id)
        .then(d => { setRealHtml(d.html_content); setLoaded(true); })
        .catch(() => setLoaded(true));
    } else if (book.category === "documents" && !book.isDemo) {
      service.getBookContent(book.id)
        .then(d => { setRealHtml(d.html_content); setLoaded(true); })
        .catch(() => setLoaded(true));
    } else {
      setRealHtml(typeof mockContent === 'string' ? mockContent : (mockContent as {html: string}).html);
      setLoaded(true);
    }
  }, [service, book.id, book.category, book.isDemo]);

  const displayHtml = realHtml || "";
  const anchoredHtml = injectAnchorIds(displayHtml);
  const tocItems = extractToc(displayHtml);

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

  const scopedHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CONTENT_CSS}</style></head><body>${anchoredHtml}</body></html>`;

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: "var(--background)", color: "var(--muted-foreground)" }}>
        加载中...
      </div>
    );
  }

  return (
    <div className="flex h-full" style={{ background: "var(--background)" }}>
      {tocItems.length > 0 && (
        <>
          <aside
            className="w-56 flex-shrink-0 border-r hidden lg:flex flex-col"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
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
                  className="block transition-colors"
                  style={tocItemStyle(item.level, item.id === activeId)}
                  onClick={() => scrollToSection(item.id)}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </aside>

          {showMobileToc && (
            <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden" onClick={() => setShowMobileToc(false)}>
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
                      className="block transition-colors"
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
          className="fixed bottom-16 right-4 lg:hidden z-30 w-10 h-10 rounded-full shadow-lg flex items-center justify-center"
          style={{ background: "var(--accent)", color: "white" }}
        >
          <List size={18} />
        </button>
      )}

      <div ref={wrapperRef} className="flex-1">
        <iframe
          srcDoc={scopedHtml}
          className="w-full h-full"
          style={{ border: "none" }}
          title={book.title}
          onLoad={handleContentLoad}
        />
      </div>
    </div>
  );
}
