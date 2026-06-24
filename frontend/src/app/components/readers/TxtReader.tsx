import { useState, useEffect, useRef, useCallback } from "react";
import { Minus, Plus, Moon, Sun } from "lucide-react";
import { Book } from "../bookData";
import { getDataService } from "../../../services/api";
import { useReadingProgress } from "../../hooks/useReadingProgress";
import type { BookmarkReaderApi, BookmarkAnchor, BookmarkCapableReaderProps } from "./bookmarkTypes";

interface TxtReaderProps extends BookmarkCapableReaderProps {
  book: Book;
}

export function TxtReader({ book, onBookmarkReady, restoreAnchor }: TxtReaderProps) {
  const [text, setText] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(17);
  const [darkMode, setDarkMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { save } = useReadingProgress(book.id);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const svc = await getDataService();
        const blobUrl = await svc.getImportedFileBlobUrl(book.id);
        if (cancelled || !blobUrl) {
          if (!cancelled) setError("Failed to load file");
          return;
        }
        const resp = await fetch(blobUrl);
        const content = await resp.text();
        if (cancelled) return;
        setText(content);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load file");
      }
    })();
    return () => { cancelled = true; };
  }, [book.id]);

  const bg = darkMode ? "#1a1208" : "#faf6ed";
  const textColor = darkMode ? "#d4c5a0" : "#2c1a0e";
  const mutedColor = darkMode ? "#7a6040" : "#9a7a58";

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) return;
    const pct = Math.round((el.scrollTop / maxScroll) * 100);
    save({ percent: Math.max(pct, 1), completed: pct >= 95, metadata: {} });
  }, [save]);

  const getAnchor = useCallback((): BookmarkAnchor | null => {
    const el = scrollRef.current;
    if (!el) return null;
    const maxScroll = el.scrollHeight - el.clientHeight;
    return { kind: "scroll", percent: maxScroll > 0 ? Math.round((el.scrollTop / maxScroll) * 100) : 0 };
  }, []);

  useEffect(() => {
    onBookmarkReady?.({ getAnchor });
    return () => onBookmarkReady?.(null);
  }, [onBookmarkReady, getAnchor]);

  useEffect(() => {
    if (!restoreAnchor || restoreAnchor.kind !== "scroll" || !loaded) return;
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll > 0) el.scrollTop = (restoreAnchor.percent / 100) * maxScroll;
  }, [restoreAnchor, loaded]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center p-4" style={{ color: "#c44" }}>
        {error}
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ color: mutedColor }}>
        加载中...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: bg, transition: "background 0.3s" }}>
      <div
        className="flex items-center justify-between px-6 py-2 border-b flex-shrink-0"
        style={{ borderColor: darkMode ? "rgba(255,255,255,0.06)" : "rgba(92,61,30,0.08)" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setFontSize(v => Math.max(13, v - 1))}
            data-testid="txt-reader-font-decrease"
            className="w-7 h-7 rounded-full flex items-center justify-center border transition-colors"
            style={{ borderColor: mutedColor, color: mutedColor }}
          >
            <Minus size={12} />
          </button>
          <span className="text-sm w-6 text-center" style={{ color: textColor, fontFamily: "Inter, sans-serif" }}>{fontSize}</span>
          <button
            onClick={() => setFontSize(v => Math.min(28, v + 1))}
            data-testid="txt-reader-font-increase"
            className="w-7 h-7 rounded-full flex items-center justify-center border transition-colors"
            style={{ borderColor: mutedColor, color: mutedColor }}
          >
            <Plus size={12} />
          </button>
        </div>
        <button
          onClick={() => setDarkMode(v => !v)}
          data-testid="txt-reader-dark-toggle"
          className="p-1.5 rounded-full transition-colors"
          style={{ color: mutedColor }}
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
        data-testid="txt-reader-area"
      >
        <div className="max-w-[640px] mx-auto px-6 py-8">
          <pre
            className="whitespace-pre-wrap break-words"
            style={{
              fontFamily: "Source Serif 4, serif",
              fontSize: `${fontSize}px`,
              color: textColor,
              lineHeight: 1.85,
              letterSpacing: "0.02em",
              margin: 0,
            }}
          >
            {text}
          </pre>
        </div>
      </div>
    </div>
  );
}
