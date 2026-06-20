import { ArrowLeft, MoreVertical, Bookmark } from "lucide-react";
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

interface ReaderModalProps {
  book: Book | null;
  onClose: () => void;
}

const AUTO_HIDE_MS = 2500;

function ReaderContent({ book }: { book: Book }) {
  if (book.isDemo) {
    if (book.category === "manga") return <MangaReader book={book} />;
    switch (book.type) {
      case "epub": return <EpubReader book={book} />;
      case "pdf": return <PdfReader book={book} />;
      case "word": return <DocReader book={book} />;
      case "ppt": return <PptReader book={book} />;
      case "excel": return <ExcelReader book={book} />;
      case "html": return <HtmlReader book={book} />;
      default: return <EpubReader book={book} />;
    }
  }
  switch (book.type) {
    case "pdf": return <PdfReader book={book} />;
    case "epub": return <EpubReader book={book} />;
    case "txt": return <TxtReader book={book} />;
    case "word": return <DocReader book={book} />;
    case "ppt": return <PptReader book={book} />;
    case "excel": return <ExcelReader book={book} />;
    case "html":
      return book.sourceType === "url" ? <HtmlReader book={book} /> : <FileReader book={book} />;
    default:
      return book.sourceType === "file" ? <FileReader book={book} /> : <HtmlReader book={book} />;
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

  if (!book) return null;
  const typeInfo = typeConfig[book.type];

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
          <button
            className="p-2 rounded-full transition-colors hover:bg-black/10"
            style={{ color: isDarkChrome ? "#aaa" : "var(--muted-foreground)" }}
            data-testid="reader-bookmark"
          >
            <Bookmark size={17} />
          </button>
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
      >
        <ReaderContent book={book} />
      </div>
      <button
        type="button"
        aria-label={topbarVisible ? "Hide toolbar" : "Show toolbar"}
        onPointerDown={(e) => { e.stopPropagation(); topbarVisible ? hideTopbar() : showTopbar(); }}
        className="absolute inset-x-0 bottom-0"
        style={{ height: 12, background: "transparent", border: 0, padding: 0, cursor: "pointer", zIndex: 30 }}
        data-testid="reader-tap-strip"
      />

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
