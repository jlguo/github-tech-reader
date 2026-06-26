import { ArrowLeft, MoreVertical, Bookmark, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Book, typeConfig } from "../bookData";
import { EpubReader } from "./EpubReader";
import { PdfReader } from "./PdfReader";
import { DocReader } from "./DocReader";
import { PptReader } from "./PptReader";
import { ExcelReader } from "./ExcelReader";
import { MangaReader } from "./MangaReader";
import { HtmlReader } from "./HtmlReader";
import { FileReader } from "./FileReader";
import { TxtReader } from "./TxtReader";
import type { BookmarkReaderApi, BookmarkAnchor, BookmarkCapableReaderProps } from "./bookmarkTypes";
import { parseAnchor, anchorDefaultLabel } from "./bookmarkTypes";
import type { RemoteBookmark } from "../../../services/api";
import { getDataService } from "../../../services/api";

interface ReaderModalProps {
  book: Book | null;
  onClose: () => void;
}

const AUTO_HIDE_MS = 2500;
const TAP_MAX_MS = 300;
const TAP_MAX_PX = 10;
const CENTER_MIN = 0.3;
const CENTER_MAX = 0.7;

function ReaderContent({ book, onBookmarkReady, restoreAnchor }: {
  book: Book;
  onBookmarkReady?: BookmarkCapableReaderProps["onBookmarkReady"];
  restoreAnchor?: BookmarkAnchor | null;
}) {
  const props = { book, onBookmarkReady, restoreAnchor };
  if (book.isDemo) {
    if (book.category === "manga") return <MangaReader {...props} />;
    switch (book.type) {
      case "epub": return <EpubReader {...props} />;
      case "pdf": return <PdfReader {...props} />;
      case "word": return <DocReader {...props} />;
      case "ppt": return <PptReader {...props} />;
      case "excel": return <ExcelReader {...props} />;
      case "html": return <HtmlReader {...props} />;
      default: return <EpubReader {...props} />;
    }
  }
  switch (book.type) {
    case "pdf": return <PdfReader {...props} />;
    case "epub": return <EpubReader {...props} />;
    case "txt": return <TxtReader {...props} />;
    case "word": return <DocReader {...props} />;
    case "ppt": return <PptReader {...props} />;
    case "excel": return <ExcelReader {...props} />;
    case "html":
      return book.sourceType === "file" ? <FileReader {...props} /> : <HtmlReader {...props} />;
    default:
      return book.sourceType === "file" ? <FileReader {...props} /> : <HtmlReader {...props} />;
  }
}

function getReaderBg(book: Book) {
  switch (book.type) {
    case "pdf": return "#4a4a4a";
    case "ppt": return "#1a1a1a";
    case "excel": return "#f5f5f5";
    case "word": return "#e8e8e8";
    case "html": return "var(--background)";
    default: return book.category === "manga" ? "#0d0d0d" : "#faf6ed";
  }
}

export function ReaderModal({ book, onClose }: ReaderModalProps) {
  const [topbarVisible, setTopbarVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  const tapStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const [bookmarkApi, setBookmarkApi] = useState<BookmarkReaderApi | null>(null);
  const [pendingRestore, setPendingRestore] = useState<BookmarkAnchor | null>(null);
  const [bookmarks, setBookmarks] = useState<RemoteBookmark[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const bookRef = useRef(book);
  bookRef.current = book;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setTopbarVisible(false);
      hideTimerRef.current = null;
    }, AUTO_HIDE_MS);
  }, [clearHideTimer]);

  const showTopbar = useCallback(() => {
    setTopbarVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const hideTopbar = useCallback(() => {
    clearHideTimer();
    setTopbarVisible(false);
  }, [clearHideTimer]);

  useEffect(() => {
    if (!book) return;
    setTopbarVisible(true);
    scheduleHide();
    return clearHideTimer;
  }, [book, scheduleHide, clearHideTimer]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin && e.origin !== "null") return;
      if (e.data?.type === "reader-center-tap") {
        topbarVisible ? hideTopbar() : showTopbar();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [topbarVisible, hideTopbar, showTopbar]);

  useEffect(() => {
    setPendingRestore(null);
    setBookmarks([]);
    setDrawerOpen(false);
    if (!book || book.isDemo) return;
    let cancelled = false;
    getDataService().then(s => {
      if (cancelled) return;
      s.getBookmarks(book.id).then(setBookmarks);
    });
    return () => { cancelled = true; };
  }, [book]);

  useEffect(() => {
    if (!pendingRestore) return;
    const t = setTimeout(() => setPendingRestore(null), 100);
    return () => clearTimeout(t);
  }, [pendingRestore]);

  const onContentPointerDown = (e: React.PointerEvent) => {
    tapStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  };

  const onContentPointerUp = (e: React.PointerEvent) => {
    const start = tapStartRef.current;
    tapStartRef.current = null;
    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const duration = Date.now() - start.time;

    if (duration >= TAP_MAX_MS) return;
    if (dist >= TAP_MAX_PX) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.x) / rect.width;
    const relY = (e.clientY - rect.y) / rect.height;
    if (relX < CENTER_MIN || relX > CENTER_MAX || relY < CENTER_MIN || relY > CENTER_MAX) return;

    topbarVisible ? hideTopbar() : showTopbar();
  };

  if (!book) return null;
  const typeInfo = typeConfig[book.type] ?? { label: "FILE", color: "#5a5a5a", bg: "#f0f0f0" };

  const isDarkChrome = book.type === "pdf" || book.type === "ppt" || book.category === "manga";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      data-testid="reader-modal"
      style={{ background: getReaderBg(book) }}
      onPointerDownCapture={() => { if (topbarVisible) scheduleHide(); }}
    >
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-3 border-b"
        data-testid="reader-topbar"
        data-visible={topbarVisible ? "true" : "false"}
        style={{
          background: isDarkChrome ? "rgba(0,0,0,0.7)" : "rgba(245,240,232,0.95)",
          backdropFilter: "blur(8px)",
          borderColor: isDarkChrome ? "rgba(255,255,255,0.08)" : "rgba(92,61,30,0.1)",
          transform: topbarVisible ? "translateY(0)" : "translateY(-100%)",
          opacity: topbarVisible ? 1 : 0,
          pointerEvents: topbarVisible ? "auto" : "none",
          transition: "transform 220ms ease, opacity 220ms ease",
        }}
        aria-hidden={!topbarVisible}
      >
        <button
          onClick={onClose}
          className="flex items-center gap-2 transition-opacity hover:opacity-70"
          style={{ color: isDarkChrome ? "#d0d0d0" : "var(--foreground)" }}
          data-testid="reader-back"
        >
          <ArrowLeft size={18} />
          <span className="text-sm hidden sm:block" style={{ fontFamily: "Inter, sans-serif" }}>返回书架</span>
        </button>

        <div className="flex flex-col items-center">
          <p
            className="text-sm font-medium truncate max-w-[200px] sm:max-w-[320px]"
            style={{ fontFamily: "Playfair Display, serif", color: isDarkChrome ? "#d0d0d0" : "var(--foreground)" }}
            data-testid="reader-title"
          >
            {book.title}
          </p>
          <span
            className="text-xs px-1.5 py-0.5 rounded mt-0.5"
            style={{ background: typeInfo.bg, color: typeInfo.color, fontFamily: "Inter, sans-serif", fontSize: "0.6rem", fontWeight: 600 }}
            data-testid="reader-type-badge"
          >
            {typeInfo.label}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {book.isDemo ? (
            <button
              className="p-2 rounded-full transition-colors hover:bg-black/10"
              style={{ color: isDarkChrome ? "#555" : "var(--muted-foreground)", opacity: 0.4, cursor: "not-allowed" }}
              data-testid="reader-bookmark"
              disabled
              aria-disabled
            >
              <Bookmark size={17} />
            </button>
          ) : bookmarkApi ? (
            <button
              className="p-2 rounded-full transition-colors hover:bg-black/10"
              style={{ color: isDarkChrome ? "#aaa" : "var(--muted-foreground)" }}
              data-testid="reader-bookmark"
              onClick={() => setDrawerOpen(v => !v)}
            >
              <Bookmark size={17} />
            </button>
          ) : null}
          <button
            className="p-2 rounded-full transition-colors hover:bg-black/10"
            style={{ color: isDarkChrome ? "#aaa" : "var(--muted-foreground)" }}
            data-testid="reader-more"
          >
            <MoreVertical size={17} />
          </button>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 relative"
        data-testid="reader-content"
        onPointerDown={onContentPointerDown}
        onPointerUp={onContentPointerUp}
      >
        <ReaderContent book={book} onBookmarkReady={setBookmarkApi} restoreAnchor={pendingRestore} />
      </div>

      {drawerOpen && bookmarkApi && (
        <>
          <div
            className="fixed inset-0 z-20 bg-black/20 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            className="absolute right-0 top-0 bottom-0 w-72 z-30 shadow-xl flex flex-col"
            data-testid="bookmark-drawer"
            style={{
              background: "var(--background)",
              borderLeft: "1px solid rgba(92,61,30,0.1)",
            }}
          >
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "rgba(92,61,30,0.1)" }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                书签 ({bookmarks.length})
              </p>
              <button
                data-testid="bookmark-add"
                className="p-1.5 rounded-full transition-colors hover:bg-black/10"
                style={{ color: "var(--accent)" }}
                onClick={async () => {
                  const anchor = bookmarkApi.getAnchor();
                  if (!anchor) return;
                  const label = anchorDefaultLabel(anchor);
                  const svc = await getDataService();
                  const created = await svc.addBookmark(book.id, label, JSON.stringify(anchor));
                  setBookmarks(prev => [created, ...prev]);
                }}
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {bookmarks.length === 0 && (
                <p className="text-xs text-center py-8" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                  暂无书签
                </p>
              )}
              {bookmarks.map(bm => (
                <div
                  key={bm.id}
                  data-testid="bookmark-item"
                  className="flex items-center gap-2 px-4 py-3 transition-colors cursor-pointer hover:bg-black/5"
                  style={{ borderBottom: "1px solid rgba(92,61,30,0.06)" }}
                  onClick={() => {
                    const parsed = parseAnchor(bm.anchor);
                    if (parsed) setPendingRestore(parsed);
                    setDrawerOpen(false);
                  }}
                >
                  <Bookmark size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: "var(--foreground)", fontFamily: "Inter, sans-serif" }}>
                      {bm.label}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                      {bm.created_at ? new Date(bm.created_at).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <button
                    data-testid="bookmark-delete"
                    className="p-1.5 rounded transition-colors hover:bg-red-100"
                    style={{ color: "#c44", flexShrink: 0 }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const svc = await getDataService();
                      await svc.deleteBookmark(bm.id);
                      setBookmarks(prev => prev.filter(x => x.id !== bm.id));
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {book.progress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: "rgba(0,0,0,0.1)" }} data-testid="reader-progress-bar">
          <div
            className="h-full"
            style={{ width: `${book.progress}%`, background: "var(--accent)", transition: "width 0.5s" }}
          />
        </div>
      )}
    </div>
  );
}
