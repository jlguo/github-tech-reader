import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { List, ChevronRight } from "lucide-react";
import { Book } from "../bookData";
import { htmlContent as mockContent } from "./readerData";
import { getDataService, type IDataService } from "../../../services/api";
import { useReadingProgress } from "../../hooks/useReadingProgress";
import { sanitizeHtml } from "../../../utils/sanitize";
import type { BookmarkReaderApi, BookmarkAnchor, BookmarkCapableReaderProps } from "./bookmarkTypes";

const SCROLL_DEBOUNCE_MS = 2000;

interface HtmlReaderProps extends BookmarkCapableReaderProps { book: Book; }

interface TocItem { id: string; title: string; level: number; }
interface TocNode extends TocItem { children: TocNode[]; }

function buildTocTree(items: TocItem[]): TocNode[] {
  const root: TocNode[] = [];
  const stack: TocNode[] = [];
  for (const item of items) {
    const node: TocNode = { ...item, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }
  return root;
}

function TocTreeItem({
  node,
  depth,
  activeId,
  onSelect,
}: {
  node: TocNode;
  depth: number;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;
  const isActive = node.id === activeId;

  return (
    <div>
      <button
        onClick={() => (hasChildren ? setCollapsed((v) => !v) : onSelect(node.id))}
        className="flex items-center gap-1.5 w-full text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        style={{
          paddingLeft: `${10 + depth * 16}px`,
          paddingRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
          fontSize: depth === 0 ? "0.8rem" : "0.75rem",
          fontWeight: depth === 0 ? 600 : 400,
          color: isActive ? "var(--accent)" : depth === 0 ? "var(--foreground)" : "var(--muted-foreground)",
          background: isActive ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        {hasChildren && (
          <ChevronRight
            size={14}
            style={{
              flexShrink: 0,
              transition: "transform 0.15s",
              transform: collapsed ? "rotate(0deg)" : "rotate(90deg)",
              color: "var(--muted-foreground)",
            }}
          />
        )}
        {!hasChildren && <span style={{ width: 14, flexShrink: 0 }} />}
        <span className="truncate">{node.title}</span>
      </button>
      {!collapsed &&
        hasChildren &&
        node.children.map((child) => (
          <TocTreeItem
            key={child.id}
            node={child}
            depth={depth + 1}
            activeId={activeId}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
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
`;

const TAP_DETECT_SCRIPT = `(function(){var s=null;document.addEventListener('pointerdown',function(e){s={x:e.clientX,y:e.clientY,t:Date.now()}});document.addEventListener('pointerup',function(e){if(!s)return;var dx=e.clientX-s.x,dy=e.clientY-s.y,d=Math.sqrt(dx*dx+dy*dy),dt=Date.now()-s.t;s=null;if(dt>=300||d>=10)return;var w=window.innerWidth,h=window.innerHeight;if(e.clientX/w<0.3||e.clientX/w>0.7||e.clientY/h<0.3||e.clientY/h>0.7)return;parent.postMessage({type:'reader-center-tap'},'*')});})();`;

// A srcdoc iframe's base URL is about:srcdoc, so any non-anchor link navigation destroys
// the book. Intercept clicks: # anchors scroll natively, everything else opens in a new tab.
// Relative repo paths are resolved to the source repo's blob URL when known.
function buildLinkHandlerScript(repoBase: string | undefined): string {
  const base = JSON.stringify(repoBase ? repoBase.replace(/\/+$/, "") : "");
  return `(function(){var BASE=${base};document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a');if(!a)return;var href=a.getAttribute('href');if(!href)return;if(href.charAt(0)==='#')return;e.preventDefault();var url;if(/^[a-z][a-z0-9+.-]*:/i.test(href)){url=href;}else if(BASE){var p=href.replace(/^\\.?\\//,'');url=BASE+'/blob/HEAD/'+p;}else{return;}window.open(url,'_blank','noopener,noreferrer');});})();`;
}

function wrapCoverHtml(html: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;height:100%;overflow:hidden}body{display:flex;align-items:center;justify-content:center}</style>
</head><body>${html}</body></html>`;
}

export function HtmlReader({ book, onBookmarkReady, restoreAnchor }: HtmlReaderProps) {
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
  const pendingScrollRef = useRef<number | null>(null);

  useEffect(() => {
    getDataService().then(setService);
  }, []);

  useEffect(() => {
    if (!service) return;

    const isRepoBook = book.sourceType === "github" || book.sourceType === "youtube";
    const isImportedFile = book.sourceType === "file";

    if (isRepoBook) {
      service.getBookByRepo(book.id)
        .then(d => { setRealHtml(d.html_content); setLoaded(true); })
        .catch(() => setLoaded(true));
    } else if (isImportedFile && !book.isDemo) {
      service.getBookContent(book.id)
        .then(d => { setRealHtml(d.html_content); setLoaded(true); })
        .catch(() => setLoaded(true));
    } else {
      setRealHtml(typeof mockContent === 'string' ? mockContent : (mockContent as {html: string}).html);
      setLoaded(true);
    }
  }, [service, book.id, book.sourceType, book.isDemo]);

  const displayHtml = realHtml ? sanitizeHtml(realHtml) : "";

  let content = displayHtml;
  if (content) {
    content = content.replace(/<!--COVER_START-->[\s\S]*?<!--COVER_END-->/, "");
    content = content.replace(/<ul class="toc">[\s\S]*?<\/ul>/, "");
    content = content.replace(/<h1[^>]*>[^<]*\/[^<]*<\/h1>/, "");
    content = content.replace(/Chapter (\d+): /g, "第$1章 ");
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
  const tocTree = buildTocTree(tocItems);

  const scrollToSection = useCallback((id: string) => {
    setActiveId(id);
    setShowMobileToc(false);
    const iframe = wrapperRef.current?.querySelector("iframe");
    const el = iframe?.contentDocument?.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const getAnchor = useCallback((): BookmarkAnchor | null => {
    const iframe = wrapperRef.current?.querySelector("iframe");
    const doc = iframe?.contentDocument;
    if (!doc) return null;
    const de = doc.documentElement;
    const maxScroll = de.scrollHeight - de.clientHeight;
    return { kind: "scroll", percent: maxScroll > 0 ? Math.round((de.scrollTop / maxScroll) * 100) : 0 };
  }, []);

  useEffect(() => {
    onBookmarkReady?.({ getAnchor });
    return () => onBookmarkReady?.(null);
  }, [onBookmarkReady, getAnchor]);

  useEffect(() => {
    if (!restoreAnchor || restoreAnchor.kind !== "scroll") return;
    const iframe = wrapperRef.current?.querySelector("iframe");
    const doc = iframe?.contentDocument;
    if (doc) {
      const de = doc.documentElement;
      const maxScroll = de.scrollHeight - de.clientHeight;
      if (maxScroll > 0) de.scrollTop = (restoreAnchor.percent / 100) * maxScroll;
    } else {
      pendingScrollRef.current = restoreAnchor.percent;
    }
  }, [restoreAnchor]);

  const handleContentLoad = useCallback(() => {
    const iframe = wrapperRef.current?.querySelector("iframe");
    if (!iframe?.contentDocument) return;

    const doc = iframe.contentDocument;

    if (pendingScrollRef.current !== null) {
      const de = doc.documentElement;
      const maxScroll = de.scrollHeight - de.clientHeight;
      if (maxScroll > 0) de.scrollTop = (pendingScrollRef.current / 100) * maxScroll;
      pendingScrollRef.current = null;
    }

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

  const scopedHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CONTENT_CSS}</style><script>${TAP_DETECT_SCRIPT}</script><script>${buildLinkHandlerScript(book.sourceUrl)}</script></head><body>${anchoredHtml}</body></html>`;

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
              {tocTree.map((node) => (
                <TocTreeItem
                  key={node.id}
                  node={node}
                  depth={0}
                  activeId={activeId}
                  onSelect={scrollToSection}
                />
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
                  {tocTree.map((node) => (
                    <TocTreeItem
                      key={node.id}
                      node={node}
                      depth={0}
                      activeId={activeId}
                      onSelect={scrollToSection}
                    />
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
