import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { List } from "lucide-react";
import { Book } from "../bookData";
import { htmlContent as mockContent } from "./readerData";
import { getDataService, type IDataService } from "../../../services/api";
import { useReadingProgress } from "../../hooks/useReadingProgress";
import { sanitizeHtml } from "../../../utils/sanitize";

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

const TAP_DETECT_SCRIPT = `(function(){var s=null;document.addEventListener('pointerdown',function(e){s={x:e.clientX,y:e.clientY,t:Date.now()}});document.addEventListener('pointerup',function(e){if(!s)return;var dx=e.clientX-s.x,dy=e.clientY-s.y,d=Math.sqrt(dx*dx+dy*dy),dt=Date.now()-s.t;s=null;if(dt>=300||d>=10)return;var w=window.innerWidth,h=window.innerHeight;if(e.clientX/w<0.3||e.clientX/w>0.7||e.clientY/h<0.3||e.clientY/h>0.7)return;parent.postMessage({type:'reader-center-tap'},'*')});})();`;

function wrapCoverHtml(html: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;height:100%;overflow:hidden}body{display:flex;align-items:center;justify-content:center}</style>
</head><body>${html}</body></html>`;
}

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
  const [showCover, setShowCover] = useState(false);
  const coverHtmlRef = useRef<string>("");

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

  const displayHtml = realHtml ? sanitizeHtml(realHtml) : "";

  // Cover detection — extract and strip COVER_START/COVER_END markers
  let content = displayHtml;
  if (content) {
    content = content.replace(/<!--COVER_START-->[\s\S]*?<!--COVER_END-->/, "");
  }

  useLayoutEffect(() => {
    if (!displayHtml) return;
    const coverMatch = displayHtml.match(/<!--COVER_START-->\s*([\s\S]*?)\s*<!--COVER_END-->/);
    if (coverMatch) {
      coverHtmlRef.current = coverMatch[1];
      setShowCover(true);
    }
  }, [displayHtml]);
  const anchoredHtml = injectAnchorIds(content);
  const tocItems = extractToc(content);

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

  // Scroll to first chapter heading after cover overlay is dismissed
  useEffect(() => {
    if (!showCover && coverHtmlRef.current && tocItems.length > 0) {
      const timer = setTimeout(() => {
        scrollToSection(tocItems[0].id);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [showCover, tocItems, scrollToSection]);

  const scopedHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CONTENT_CSS}</style><script>${TAP_DETECT_SCRIPT}</script></head><body>${anchoredHtml}</body></html>`;

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: "var(--background)", color: "var(--muted-foreground)" }}>
        加载中...
      </div>
    );
  }

  return (
    <>
      {showCover && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "#f5f0e8",
          display: "flex", flexDirection: "column"
        }}>
          <iframe
            srcDoc={wrapCoverHtml(coverHtmlRef.current)}
            style={{ flex: 1, border: "none", width: "100%" }}
            title="Book Cover"
          />
          <div style={{
            padding: "2rem", textAlign: "center",
            background: "linear-gradient(to top, #f5f0e8 60%, transparent)"
          }}>
            <button
              onClick={() => setShowCover(false)}
              style={{
                padding: "0.75rem 2.5rem", fontSize: "1.1rem",
                fontFamily: "'Playfair Display', serif",
                background: "#5c3d1e", color: "#f5f0e8",
                border: "none", borderRadius: "8px", cursor: "pointer",
                boxShadow: "0 4px 12px rgba(92,61,30,0.3)"
              }}
            >
              开始阅读
            </button>
          </div>
        </div>
      )}
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
    </>
  );
}
