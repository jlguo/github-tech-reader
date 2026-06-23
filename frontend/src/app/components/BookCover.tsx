import { useState } from "react";
import { Book, typeConfig } from "./bookData";

function thumbnailScale(s: { width: string; height: string }): string {
  if (s.width === "w-16") return "0.16";
  if (s.width === "w-24") return "0.24";
  return "0.32";
}

function wrapCoverForThumbnail(html: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:400px;height:600px;overflow:hidden}body{display:flex;align-items:center;justify-content:center}</style></head><body>${html}</body></html>`;
}

interface BookCoverProps {
  book: Book;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { width: "w-16", height: "h-24", spine: "w-3", titleSize: "text-[8px]" },
  md: { width: "w-24", height: "h-36", spine: "w-4", titleSize: "text-[10px]" },
  lg: { width: "w-32", height: "h-48", spine: "w-5", titleSize: "text-xs" },
};

const fallbackType = { label: "FILE", color: "#5a5a5a", bg: "#f0f0f0" };

export function BookCover({ book, size = "md" }: BookCoverProps) {
  const s = sizeMap[size];
  const typeInfo = typeConfig[book.type] ?? fallbackType;
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  if ((!book.cover || imgError) && book.coverHtml) {
    return (
      <div
        className={`${s.width} ${s.height} relative flex-shrink-0 overflow-hidden shadow-md`}
        style={{ borderRadius: "2px 6px 6px 2px" }}
        data-testid={`book-cover-html-${book.id}`}
      >
        <iframe
          srcDoc={wrapCoverForThumbnail(book.coverHtml)}
          style={{
            width: "400px",
            height: "600px",
            border: "none",
            transform: `scale(${thumbnailScale(s)})`,
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
          title={book.title}
        />
      </div>
    );
  }

  if (!book.cover || imgError) {
    return (
      <div
        className={`${s.width} ${s.height} relative flex-shrink-0 flex flex-col items-center justify-center shadow-md`}
        style={{
          background: `linear-gradient(135deg, ${book.coverColor}, ${book.coverColor}cc)`,
          borderRadius: "2px 6px 6px 2px",
        }}
        data-testid={`book-cover-color-${book.id}`}
      >
        <div
          className="absolute left-0 top-0 h-full w-3 opacity-30"
          style={{ background: "linear-gradient(to right, rgba(0,0,0,0.4), transparent)" }}
        />
        <div className={`px-1.5 py-0.5 rounded ${s.titleSize} font-semibold tracking-wide`}
          style={{ background: typeInfo.bg, color: typeInfo.color, fontFamily: "Inter, sans-serif" }}>
          {typeInfo.label}
        </div>
        {book.title && (
          <p className={`${s.titleSize} mt-1 text-center leading-tight px-1 line-clamp-3`}
            style={{ color: "rgba(255,255,255,0.85)", fontFamily: "Inter, sans-serif" }}>
            {book.title.length > 12 ? book.title.slice(0, 12) + "..." : book.title}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={`${s.width} ${s.height} relative flex-shrink-0 overflow-hidden shadow-md`}
      style={{
        borderRadius: "2px 6px 6px 2px",
        background: imgLoaded ? "transparent" : book.coverColor,
      }}
      data-testid={`book-cover-img-${book.id}`}
    >
      <img
        src={book.cover}
        alt={book.title}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
        style={{ opacity: imgLoaded ? 1 : 0, transition: "opacity 0.3s" }}
        onLoad={() => setImgLoaded(true)}
        onError={() => setImgError(true)}
      />
      <div
        className={`absolute top-1.5 right-1.5 px-1 py-0.5 rounded ${s.titleSize} font-semibold tracking-wide`}
        style={{ background: typeInfo.bg, color: typeInfo.color, fontFamily: "Inter, sans-serif" }}
        data-testid={`book-cover-type-${book.id}`}
      >
        {typeInfo.label}
      </div>
      {book.isDemo && (
        <div
          className={`absolute bottom-1.5 left-1.5 px-1 py-0.5 rounded ${s.titleSize} font-medium`}
          style={{
            background: "color-mix(in srgb, var(--accent) 15%, transparent)",
            color: "var(--accent)",
            fontFamily: "Inter, sans-serif",
          }}
        >
          示例
        </div>
      )}
      <div
        className="absolute left-0 top-0 h-full w-3 opacity-30"
        style={{ background: "linear-gradient(to right, rgba(0,0,0,0.4), transparent)" }}
      />
    </div>
  );
}
