import { useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Bookmark, RotateCcw } from "lucide-react";
import { pdfPages } from "./readerData";
import { Book } from "../bookData";

interface PdfReaderProps {
  book: Book;
}

export function PdfReader({ book }: PdfReaderProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [bookmarked, setBookmarked] = useState(false);

  const page = pdfPages[pageIndex];

  return (
    <div className="flex flex-col h-full" style={{ background: "#4a4a4a" }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0" style={{ background: "#2d2d2d" }}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPageIndex(v => Math.max(0, v - 1))}
            disabled={pageIndex === 0}
            className="p-1.5 rounded transition-colors hover:bg-white/10 disabled:opacity-30"
            style={{ color: "#d0d0d0" }}
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-1">
            <input
              className="w-10 text-center text-xs py-0.5 rounded outline-none"
              style={{ background: "#1a1a1a", color: "#d0d0d0", border: "1px solid rgba(255,255,255,0.15)", fontFamily: "Inter, sans-serif" }}
              value={pageIndex + 1}
              readOnly
            />
            <span className="text-xs" style={{ color: "#888", fontFamily: "Inter, sans-serif" }}>/ {pdfPages.length}</span>
          </div>
          <button
            onClick={() => setPageIndex(v => Math.min(pdfPages.length - 1, v + 1))}
            disabled={pageIndex === pdfPages.length - 1}
            className="p-1.5 rounded transition-colors hover:bg-white/10 disabled:opacity-30"
            style={{ color: "#d0d0d0" }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <p className="text-xs truncate max-w-[200px]" style={{ color: "#aaa", fontFamily: "Inter, sans-serif" }}>
          {book.title}
        </p>

        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(v => Math.max(50, v - 10))} className="p-1.5 rounded hover:bg-white/10 transition-colors" style={{ color: "#d0d0d0" }}>
            <ZoomOut size={15} />
          </button>
          <span className="text-xs w-12 text-center" style={{ color: "#aaa", fontFamily: "Inter, sans-serif" }}>{zoom}%</span>
          <button onClick={() => setZoom(v => Math.min(200, v + 10))} className="p-1.5 rounded hover:bg-white/10 transition-colors" style={{ color: "#d0d0d0" }}>
            <ZoomIn size={15} />
          </button>
          <div className="w-px h-4 mx-1" style={{ background: "rgba(255,255,255,0.15)" }} />
          <button onClick={() => setZoom(100)} className="p-1.5 rounded hover:bg-white/10 transition-colors" style={{ color: "#d0d0d0" }}>
            <RotateCcw size={14} />
          </button>
          <button
            onClick={() => setBookmarked(v => !v)}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            style={{ color: bookmarked ? "#c17f3a" : "#d0d0d0" }}
          >
            <Bookmark size={15} fill={bookmarked ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      {/* PDF page */}
      <div className="flex-1 overflow-auto flex items-start justify-center py-6 px-4">
        <div
          className="shadow-2xl"
          style={{
            width: `${(595 * zoom) / 100}px`,
            minWidth: "280px",
            transformOrigin: "top center",
            background: "#ffffff",
          }}
        >
          {/* Page content */}
          <div className="px-12 py-14">
            {/* Page number header */}
            <div className="flex justify-between items-center mb-10 pb-3 border-b" style={{ borderColor: "#e0e0e0" }}>
              <span className="text-xs" style={{ color: "#999", fontFamily: "Inter, sans-serif" }}>{book.title}</span>
              <span className="text-xs" style={{ color: "#999", fontFamily: "Inter, sans-serif" }}>第 {pageIndex + 1} 页</span>
            </div>

            {page.content.map((block, i) => {
              if (block.type === "heading") {
                return (
                  <h2
                    key={i}
                    className="mb-4 mt-8 first:mt-0"
                    style={{
                      fontFamily: "Playfair Display, serif",
                      fontWeight: 700,
                      color: "#1a1a1a",
                      fontSize: "1.1rem",
                      borderBottom: "2px solid #c17f3a",
                      paddingBottom: "6px",
                    }}
                  >
                    {block.text}
                  </h2>
                );
              }
              if (block.type === "callout") {
                return (
                  <blockquote
                    key={i}
                    className="my-6 px-5 py-4 rounded-r-lg border-l-4"
                    style={{
                      borderColor: "#c17f3a",
                      background: "#fef9f0",
                      fontFamily: "Source Serif 4, serif",
                      fontStyle: "italic",
                      color: "#5c3d1e",
                      fontSize: "0.9rem",
                      lineHeight: 1.7,
                    }}
                  >
                    {block.text}
                  </blockquote>
                );
              }
              return (
                <p
                  key={i}
                  className="mb-4"
                  style={{
                    fontFamily: "Source Serif 4, serif",
                    color: "#333",
                    fontSize: "0.875rem",
                    lineHeight: 1.9,
                    textAlign: "justify",
                    textIndent: "2em",
                  }}
                >
                  {block.text}
                </p>
              );
            })}

            {/* Footer */}
            <div className="mt-16 pt-4 border-t flex justify-center" style={{ borderColor: "#e0e0e0" }}>
              <span className="text-xs" style={{ color: "#ccc", fontFamily: "Inter, sans-serif" }}>{pageIndex + 1}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
