import { useState, useRef, useEffect, useCallback } from "react";
import { FileText, ChevronDown, ChevronRight, List, Moon, Sun, Minus, Plus, AlertCircle, RotateCw } from "lucide-react";
import { docContent } from "./readerData";
import { Book } from "../bookData";
import { getDataService } from "../../../services/api";
import { useReadingProgress } from "../../hooks/useReadingProgress";
import { sanitizeHtml } from "../../../utils/sanitize";

const SCROLL_DEBOUNCE_MS = 400;
const FONT_MIN = 14;
const FONT_MAX = 22;
const FONT_DEFAULT = 16;

interface DocReaderProps {
  book: Book;
}

interface TocItem {
  id: string;
  title: string;
  level: number;
}

/** Reader-local theme palette (mirrors EpubReader's light/dark values for cross-reader consistency). */
interface DocTheme {
  gutter: string;
  page: string;
  toolbar: string;
  toolbarBorder: string;
  outlineBg: string;
  outlineBorder: string;
  text: string;
  muted: string;
  accent: string;
}

function docTheme(darkMode: boolean): DocTheme {
  return darkMode
    ? {
        gutter: "#120c05",
        page: "#1a1208",
        toolbar: "#241a0c",
        toolbarBorder: "rgba(255,255,255,0.08)",
        outlineBg: "#1f1609",
        outlineBorder: "rgba(255,255,255,0.08)",
        text: "#d4c5a0",
        muted: "#7a6040",
        accent: "#c17f3a",
      }
    : {
        gutter: "#e8e8e8",
        page: "#ffffff",
        toolbar: "#f3f2f1",
        toolbarBorder: "#d0d0d0",
        outlineBg: "#fafafa",
        outlineBorder: "#e0e0e0",
        text: "#333333",
        muted: "#666666",
        accent: "#1a73e8",
      };
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

function isLegacyDoc(buf: ArrayBuffer): boolean {
  const sig = new Uint8Array(buf.slice(0, 4));
  return sig[0] === 0xd0 && sig[1] === 0xcf && sig[2] === 0x11 && sig[3] === 0xe0;
}

function contentCss(darkMode: boolean, fontSize: number): string {
  const v = darkMode
    ? { bg: "#1a1208", fg: "#d4c5a0", primary: "#e0b577", accent: "#c17f3a", mutedFg: "#9a7a58", muted: "#261a0c", border: "rgba(212,197,160,0.15)", h3: "#c89b63" }
    : { bg: "#f5f0e8", fg: "#2c1a0e", primary: "#5c3d1e", accent: "#c17f3a", mutedFg: "#7a6248", muted: "#ede5d4", border: "rgba(92,61,30,0.15)", h3: "#8b5a2b" };
  return `
  :root{--bg:${v.bg};--fg:${v.fg};--primary:${v.primary};--accent:${v.accent};--muted-fg:${v.mutedFg};--muted:${v.muted};--border:${v.border}}
  html,body{height:100%;margin:0;padding:0}
  body{font-family:"Source Serif 4",serif;color:var(--fg);font-size:${fontSize}px;line-height:1.85;max-width:720px;margin:0 auto;padding:2rem 1.5rem 4rem;background:var(--bg);scroll-behavior:smooth}
  h1{font-family:"Playfair Display",serif;font-size:1.6rem;color:var(--primary);margin-top:0;padding-top:1rem}
  h2{font-family:"Playfair Display",serif;font-size:1.2rem;color:var(--primary);margin-top:2.5rem;padding-top:0.5rem}
  h3{font-family:"Playfair Display",serif;font-size:1rem;color:${v.h3};margin-top:2rem}
  a{color:var(--accent)}
  pre{background:var(--muted);padding:1rem;border-radius:8px;overflow-x:auto}
  code{font-family:"Fira Code",monospace;font-size:0.9em}
  img{max-width:100%;border-radius:8px}
  blockquote{border-left:3px solid var(--accent);padding-left:1rem;margin-left:0;color:var(--muted-fg)}
  table{width:100%;border-collapse:collapse;margin:1rem 0}
  th,td{border:1px solid var(--border);padding:8px 12px;text-align:left}
  p{margin:0.8em 0}
`;
}

const tocItemStyle = (level: number, active: boolean, theme: DocTheme): React.CSSProperties => ({
  paddingLeft: level === 1 ? "12px" : "24px",
  fontFamily: "Inter, sans-serif",
  fontSize: level === 1 ? "0.8rem" : "0.75rem",
  fontWeight: level === 1 ? 600 : 400,
  color: active ? theme.accent : level === 1 ? theme.text : theme.muted,
  background: active ? "color-mix(in srgb, " + theme.accent + " 12%, transparent)" : "transparent",
  borderLeft: active ? `2px solid ${theme.accent}` : "2px solid transparent",
  padding: `6px 12px 6px ${level === 1 ? 12 : 24}px`,
  display: "block", width: "100%", textAlign: "left" as const,
  cursor: "pointer", transition: "all 0.15s",
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
});

const TAP_DETECT_SCRIPT = `(function(){var s=null;document.addEventListener('pointerdown',function(e){s={x:e.clientX,y:e.clientY,t:Date.now()}});document.addEventListener('pointerup',function(e){if(!s)return;var dx=e.clientX-s.x,dy=e.clientY-s.y,d=Math.sqrt(dx*dx+dy*dy),dt=Date.now()-s.t;s=null;if(dt>=300||d>=10)return;var w=window.innerWidth,h=window.innerHeight;if(e.clientX/w<0.3||e.clientX/w>0.7||e.clientY/h<0.3||e.clientY/h>0.7)return;parent.postMessage({type:'reader-center-tap'},'*')});})();`;

interface DocToolbarProps {
  title: string;
  theme: DocTheme;
  darkMode: boolean;
  onToggleDark: () => void;
  fontSize: number;
  onFontChange: (size: number) => void;
  hasToc: boolean;
  onToggleToc: () => void;
}

function DocToolbar({ title, theme, darkMode, onToggleDark, fontSize, onFontChange, hasToc, onToggleToc }: DocToolbarProps) {
  const iconBtn = "w-7 h-7 rounded-full flex items-center justify-center transition-colors";
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 border-b flex-shrink-0"
      data-testid="doc-reader-toolbar"
      style={{ background: theme.toolbar, borderColor: theme.toolbarBorder }}
    >
      {hasToc && (
        <button
          onClick={onToggleToc}
          aria-label="切换目录"
          data-testid="doc-reader-toc-toggle"
          className={iconBtn + " sm:hidden"}
          style={{ color: theme.muted }}
        >
          <List size={16} />
        </button>
      )}
      <span className="flex items-center gap-2 min-w-0">
        <FileText size={14} style={{ color: theme.accent, flexShrink: 0 }} />
        <span className="text-xs font-medium truncate" style={{ color: theme.text, fontFamily: "Inter, sans-serif" }}>
          {title}
        </span>
      </span>
      <div className="flex items-center gap-1 ml-auto">
        <button
          onClick={() => onFontChange(Math.max(FONT_MIN, fontSize - 1))}
          aria-label="减小字号"
          data-testid="doc-reader-font-decrease"
          className={iconBtn + " border"}
          style={{ borderColor: theme.muted, color: theme.muted }}
        >
          <Minus size={12} />
        </button>
        <span className="text-xs w-6 text-center" style={{ color: theme.text, fontFamily: "Inter, sans-serif" }}>{fontSize}</span>
        <button
          onClick={() => onFontChange(Math.min(FONT_MAX, fontSize + 1))}
          aria-label="增大字号"
          data-testid="doc-reader-font-increase"
          className={iconBtn + " border"}
          style={{ borderColor: theme.muted, color: theme.muted }}
        >
          <Plus size={12} />
        </button>
        <button
          onClick={onToggleDark}
          aria-label={darkMode ? "切换到亮色" : "切换到暗色"}
          data-testid="doc-reader-dark-toggle"
          className={iconBtn + " ml-1"}
          style={{ color: theme.muted }}
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </div>
  );
}

export function DocReader({ book }: DocReaderProps) {
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({ 0: true, 1: true, 2: true, 3: true });
  const [realHtml, setRealHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState("s0");
  const [showMobileToc, setShowMobileToc] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [fontSize, setFontSize] = useState(FONT_DEFAULT);
  const [reloadKey, setReloadKey] = useState(0);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { save } = useReadingProgress(book.id);
  const theme = docTheme(darkMode);

  const toggle = (i: number) => setExpandedSections(v => ({ ...v, [i]: !v[i] }));

  useEffect(() => {
    if (book.isDemo) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRealHtml(null);
    (async () => {
      try {
        const svc = await getDataService();
        const blobUrl = await svc.getImportedFileBlobUrl(book.id);
        if (cancelled) return;
        if (!blobUrl) {
          setError("无法加载文档");
          setLoading(false);
          return;
        }
        const resp = await fetch(blobUrl);
        const buf = await resp.arrayBuffer();
        if (cancelled) return;
        if (isLegacyDoc(buf)) {
          setError("暂不支持旧版 .doc 格式，请转换为 .docx 后重新上传。");
          setLoading(false);
          return;
        }
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
  }, [book.id, book.isDemo, reloadKey]);

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

    if (book.progress > 0 && book.progress < 100) {
      const maxScroll = doc.documentElement.scrollHeight - doc.documentElement.clientHeight;
      if (maxScroll > 0) doc.documentElement.scrollTop = (book.progress / 100) * maxScroll;
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
  }, [save, book.progress]);

  if (book.isDemo) {
    return (
      <div className="flex h-full" style={{ background: theme.gutter }}>
        <aside className="w-52 flex-shrink-0 hidden sm:flex flex-col border-r" data-testid="doc-reader-outline" style={{ background: theme.outlineBg, borderColor: theme.outlineBorder }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: theme.outlineBorder }}>
            <FileText size={14} style={{ color: theme.accent }} />
            <span className="text-xs font-semibold" style={{ color: theme.text, fontFamily: "Inter, sans-serif" }}>文档大纲</span>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {docContent.sections.map((sec, i) => (
              <div key={i}>
                <button
                  onClick={() => toggle(i)}
                  data-testid={`doc-reader-section-${i}`}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
                  style={{ color: theme.text, fontFamily: "Inter, sans-serif" }}
                >
                  {expandedSections[i] ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  {sec.heading}
                </button>
              </div>
            ))}
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 py-6 px-4 overflow-hidden" data-testid="doc-reader-body" style={{ background: theme.gutter }}>
          <div className="w-full max-w-3xl mx-auto flex-1 min-h-0 shadow-lg flex flex-col" style={{ background: theme.page }}>
            <DocToolbar
              title={docContent.title}
              theme={theme}
              darkMode={darkMode}
              onToggleDark={() => setDarkMode(v => !v)}
              fontSize={fontSize}
              onFontChange={setFontSize}
              hasToc={false}
              onToggleToc={() => {}}
            />

            <div className="px-8 py-6 overflow-y-auto flex-1 min-h-0" style={{ fontSize: `${fontSize}px` }}>
              <h1 className="font-bold mb-1" style={{ color: theme.text, fontFamily: "Playfair Display, serif", fontSize: "1.4em" }}>{docContent.title}</h1>
              <p className="mb-6" style={{ color: theme.muted, fontSize: "0.75em" }}>{docContent.subtitle}</p>

              {docContent.sections.map((sec, i) => (
                expandedSections[i] && (
                  <div key={i} className="mb-6">
                    <h2 className="font-semibold mb-3" style={{ color: theme.text, fontFamily: "Inter, sans-serif", fontSize: "1.05em" }}>{sec.heading}</h2>
                    {sec.content && <p className="leading-relaxed mb-2" style={{ color: theme.text, fontSize: "0.85em" }}>{sec.content}</p>}
                    {sec.bullets && (
                      <ul className="list-disc pl-4 space-y-1">
                        {sec.bullets.map((b, j) => <li key={j} style={{ color: theme.text, fontSize: "0.85em" }}>{b}</li>)}
                      </ul>
                    )}
                    {sec.table && (
                      <table className="w-full mt-2 border-collapse" style={{ borderColor: theme.toolbarBorder, fontSize: "0.8em" }}>
                        <thead>
                          <tr style={{ background: theme.toolbar }}>
                            {sec.table.headers.map((h, j) => <th key={j} className="border px-3 py-2 text-left font-semibold" style={{ borderColor: theme.toolbarBorder, color: theme.text }}>{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {sec.table.rows.map((row, j) => (
                            <tr key={j}>
                              {row.map((c, k) => <td key={k} className="border px-3 py-2" style={{ borderColor: theme.toolbarBorder, color: theme.text }}>{c}</td>)}
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
    const isLegacy = error.includes(".doc");
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 text-center" data-testid="doc-reader-error" style={{ background: theme.gutter }}>
        <AlertCircle size={40} style={{ color: theme.accent }} />
        <p className="max-w-sm text-sm" style={{ color: theme.text, fontFamily: "Inter, sans-serif", lineHeight: 1.6 }}>{error}</p>
        {!isLegacy && (
          <button
            onClick={() => setReloadKey(k => k + 1)}
            data-testid="doc-reader-retry"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: theme.accent, color: "#fff", fontFamily: "Inter, sans-serif" }}
          >
            <RotateCw size={14} /> 重试
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3" data-testid="doc-reader-loading" style={{ background: theme.gutter, color: theme.muted }}>
        <RotateCw size={22} className="animate-spin" style={{ color: theme.accent }} />
        <span className="text-sm" style={{ fontFamily: "Inter, sans-serif" }}>正在转换文档…</span>
      </div>
    );
  }

  const displayHtml = realHtml ? sanitizeHtml(realHtml) : "";
  const anchoredHtml = injectAnchorIds(displayHtml);
  const scopedHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${contentCss(darkMode, fontSize)}</style><script>${TAP_DETECT_SCRIPT}</script></head><body>${anchoredHtml}</body></html>`;

  return (
    <div className="flex h-full" style={{ background: theme.gutter }}>
      {tocItems.length > 0 && (
        <>
          <aside
            className="w-52 flex-shrink-0 hidden sm:flex flex-col border-r"
            data-testid="doc-reader-outline"
            style={{ background: theme.outlineBg, borderColor: theme.outlineBorder }}
          >
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: theme.outlineBorder }}>
              <FileText size={14} style={{ color: theme.accent }} />
              <span className="text-xs font-semibold" style={{ color: theme.text, fontFamily: "Inter, sans-serif" }}>文档大纲</span>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {tocItems.map((item, i) => (
                <button
                  key={item.id}
                  data-testid={`doc-reader-section-${i}`}
                  className="block w-full text-left transition-colors"
                  style={tocItemStyle(item.level, item.id === activeId, theme)}
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
                style={{ background: theme.outlineBg }}
              >
                <div className="px-5 py-4 border-b" style={{ borderColor: theme.outlineBorder }}>
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: theme.muted, fontFamily: "Inter, sans-serif" }}>
                    目录 ({tocItems.length} 节)
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto py-2">
                  {tocItems.map(item => (
                    <button
                      key={item.id}
                      className="block w-full text-left transition-colors"
                      style={tocItemStyle(item.level, item.id === activeId, theme)}
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

      <div className="flex-1 flex flex-col items-center py-6 px-4 overflow-hidden" data-testid="doc-reader-body" style={{ background: theme.gutter }}>
        <div className="w-full max-w-3xl flex-1 min-h-0 shadow-lg flex flex-col" style={{ background: theme.page }}>
          <DocToolbar
            title={book.title}
            theme={theme}
            darkMode={darkMode}
            onToggleDark={() => setDarkMode(v => !v)}
            fontSize={fontSize}
            onFontChange={setFontSize}
            hasToc={tocItems.length > 0}
            onToggleToc={() => setShowMobileToc(v => !v)}
          />

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
