import { useState } from "react";
import { ChevronLeft, ChevronRight, List, Type, Sun, Moon, Minus, Plus } from "lucide-react";
import { epubContent } from "./readerData";
import { Book } from "../bookData";

interface EpubReaderProps {
  book: Book;
}

export function EpubReader({ book }: EpubReaderProps) {
  const [page, setPage] = useState(0);
  const [showToc, setShowToc] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [fontSize, setFontSize] = useState(17);
  const [showSettings, setShowSettings] = useState(false);

  const pages = epubContent.pages;
  const current = pages[page];

  const bg = darkMode ? "#1a1208" : "#faf6ed";
  const textColor = darkMode ? "#d4c5a0" : "#2c1a0e";
  const mutedColor = darkMode ? "#7a6040" : "#9a7a58";
  const surfaceColor = darkMode ? "#261a0c" : "#f0e8d8";

  return (
    <div className="flex h-full" style={{ background: bg, transition: "background 0.3s" }}>
      {/* TOC drawer */}
      {showToc && (
        <aside
          className="w-56 flex-shrink-0 flex flex-col border-r"
          data-testid="epub-reader-toc"
          style={{ background: surfaceColor, borderColor: darkMode ? "rgba(255,255,255,0.08)" : "rgba(92,61,30,0.12)" }}
        >
          <div className="px-5 py-4 border-b" style={{ borderColor: darkMode ? "rgba(255,255,255,0.08)" : "rgba(92,61,30,0.12)" }}>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: mutedColor, fontFamily: "Inter, sans-serif" }}>目录</p>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {epubContent.chapters.map((ch, i) => (
              <button
                key={ch.id}
                data-testid={`epub-reader-chapter-${ch.id}`}
                className="w-full text-left px-5 py-2.5 text-sm transition-colors"
                style={{
                  background: i === epubContent.currentChapter - 1 ? (darkMode ? "rgba(193,127,58,0.2)" : "rgba(193,127,58,0.12)") : "transparent",
                  color: i === epubContent.currentChapter - 1 ? "#c17f3a" : textColor,
                  fontFamily: "Inter, sans-serif",
                  fontWeight: i === epubContent.currentChapter - 1 ? 500 : 400,
                  opacity: i > epubContent.currentChapter - 1 ? 0.45 : 1,
                }}
              >
                {ch.title}
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* Reading area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div
          className="flex items-center justify-between px-6 py-3 border-b"
          style={{ borderColor: darkMode ? "rgba(255,255,255,0.06)" : "rgba(92,61,30,0.08)", background: surfaceColor }}
        >
          <button onClick={() => setShowToc(v => !v)} data-testid="epub-reader-toc-toggle" style={{ color: mutedColor }}>
            <List size={18} />
          </button>
          <div className="text-center">
            <p className="text-xs font-medium" style={{ fontFamily: "Inter, sans-serif", color: mutedColor }}>
              第 {epubContent.currentChapter} 章 · {epubContent.chapters[epubContent.currentChapter - 1].title}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSettings(v => !v)} data-testid="epub-reader-settings-toggle" style={{ color: mutedColor }}>
              <Type size={17} />
            </button>
            <button onClick={() => setDarkMode(v => !v)} data-testid="epub-reader-dark-toggle" style={{ color: mutedColor }}>
              {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div
            className="flex items-center justify-center gap-6 px-6 py-3 border-b"
            style={{ background: surfaceColor, borderColor: darkMode ? "rgba(255,255,255,0.06)" : "rgba(92,61,30,0.08)" }}
          >
            <span className="text-xs" style={{ color: mutedColor, fontFamily: "Inter, sans-serif" }}>字号</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setFontSize(v => Math.max(13, v - 1))}
                data-testid="epub-reader-font-decrease"
                className="w-7 h-7 rounded-full flex items-center justify-center border transition-colors"
                style={{ borderColor: mutedColor, color: mutedColor }}
              >
                <Minus size={12} />
              </button>
              <span className="text-sm w-6 text-center" style={{ color: textColor, fontFamily: "Inter, sans-serif" }}>{fontSize}</span>
              <button
                onClick={() => setFontSize(v => Math.min(24, v + 1))}
                data-testid="epub-reader-font-increase"
                className="w-7 h-7 rounded-full flex items-center justify-center border transition-colors"
                style={{ borderColor: mutedColor, color: mutedColor }}
              >
                <Plus size={12} />
              </button>
            </div>
            <div className="flex gap-2 ml-4">
              {[{ label: "衬线", font: "serif" }, { label: "无衬线", font: "sans" }].map(opt => (
                <button
                  key={opt.font}
                  data-testid={`epub-reader-font-${opt.font}`}
                  className="px-3 py-1 rounded-full text-xs border transition-colors"
                  style={{ borderColor: mutedColor, color: mutedColor, fontFamily: "Inter, sans-serif" }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Text content */}
        <div className="flex-1 overflow-y-auto" data-testid="epub-reader-area">
          <div className="max-w-[640px] mx-auto px-6 py-12">
            <p
              className="leading-[2] whitespace-pre-wrap"
              style={{
                fontFamily: "Source Serif 4, serif",
                fontSize: `${fontSize}px`,
                color: textColor,
                letterSpacing: "0.02em",
              }}
            >
              {current.text}
            </p>
          </div>
        </div>

        {/* Bottom navigation */}
        <div
          className="flex items-center justify-between px-6 py-4 border-t"
          style={{ borderColor: darkMode ? "rgba(255,255,255,0.06)" : "rgba(92,61,30,0.08)", background: surfaceColor }}
        >
          <button
            onClick={() => setPage(v => Math.max(0, v - 1))}
            disabled={page === 0}
            data-testid="epub-reader-prev"
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm transition-all disabled:opacity-30"
            style={{ background: darkMode ? "rgba(255,255,255,0.06)" : "rgba(92,61,30,0.08)", color: textColor, fontFamily: "Inter, sans-serif" }}
          >
            <ChevronLeft size={15} /> 上一页
          </button>
          <div className="flex flex-col items-center gap-1">
            <div className="flex gap-1">
              {pages.map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all cursor-pointer"
                  onClick={() => setPage(i)}
                  style={{
                    width: i === page ? "20px" : "6px",
                    height: "6px",
                    background: i === page ? "#c17f3a" : (darkMode ? "rgba(255,255,255,0.2)" : "rgba(92,61,30,0.2)"),
                  }}
                />
              ))}
            </div>
            <span className="text-xs" data-testid="epub-reader-page-indicator" style={{ color: mutedColor, fontFamily: "Inter, sans-serif" }}>
              {page + 1} / {pages.length}
            </span>
          </div>
          <button
            onClick={() => setPage(v => Math.min(pages.length - 1, v + 1))}
            disabled={page === pages.length - 1}
            data-testid="epub-reader-next"
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm transition-all disabled:opacity-30"
            style={{ background: darkMode ? "rgba(255,255,255,0.06)" : "rgba(92,61,30,0.08)", color: textColor, fontFamily: "Inter, sans-serif" }}
          >
            下一页 <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
