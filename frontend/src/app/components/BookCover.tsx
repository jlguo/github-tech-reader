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

type SourceKey = "github" | "youtube" | "url" | "file";

const sourceFallback: Record<SourceKey, { label: string; gradient: string; glyph: "github" | "youtube" | "url" | "file" }> = {
  github: { label: "GitHub", gradient: "linear-gradient(135deg, #3a2a1a, #2c1a0e)", glyph: "github" },
  youtube: { label: "YouTube", gradient: "linear-gradient(135deg, #7a2e1e, #5c1d12)", glyph: "youtube" },
  url: { label: "Web", gradient: "linear-gradient(135deg, #2f5a52, #1d3a34)", glyph: "url" },
  file: { label: "File", gradient: "linear-gradient(135deg, #6b4a28, #5c3d1e)", glyph: "file" },
};

function SourceGlyph({ glyph, px }: { glyph: SourceKey; px: number }) {
  const common = { width: px, height: px, viewBox: "0 0 24 24", fill: "#f5f0e8", "aria-hidden": true } as const;
  if (glyph === "github") {
    return (
      <svg {...common}>
        <path d="M12 .5C5.73.5.5 5.73.5 12.02c0 5.1 3.29 9.41 7.86 10.94.58.11.79-.25.79-.56 0-.27-.01-1.16-.02-2.1-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.68.8.56A11.52 11.52 0 0 0 23.5 12.02C23.5 5.73 18.27.5 12 .5z" />
      </svg>
    );
  }
  if (glyph === "youtube") {
    return (
      <svg {...common}>
        <path d="M23.5 6.2a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.51A3.02 3.02 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3.02 3.02 0 0 0 2.12 2.14c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51A3.02 3.02 0 0 0 23.5 17.8 31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8zM9.6 15.57V8.43L15.82 12 9.6 15.57z" />
      </svg>
    );
  }
  if (glyph === "url") {
    return (
      <svg {...common} fill="none" stroke="#f5f0e8" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9.2" />
        <path d="M3 12h18" />
        <path d="M12 2.8c2.6 2.6 4 5.9 4 9.2s-1.4 6.6-4 9.2c-2.6-2.6-4-5.9-4-9.2s1.4-6.6 4-9.2z" />
      </svg>
    );
  }
  return (
    <svg {...common} fill="none" stroke="#f5f0e8" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2.8h7.5L19 8.3V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.8a1 1 0 0 1 1-1z" />
      <path d="M13 2.8V8h5" />
    </svg>
  );
}

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
    const sourceKey: SourceKey = (book.sourceType as SourceKey) ?? "file";
    const fb = sourceFallback[sourceKey] ?? sourceFallback.file;
    const glyphPx = size === "sm" ? 28 : size === "md" ? 40 : 56;
    return (
      <div
        className={`${s.width} ${s.height} relative flex-shrink-0 flex flex-col items-center justify-center shadow-md`}
        style={{ background: fb.gradient, borderRadius: "2px 6px 6px 2px" }}
        data-testid={`book-cover-color-${book.id}`}
        data-source={sourceKey}
      >
        <div
          className="absolute left-0 top-0 h-full w-3 opacity-30"
          style={{ background: "linear-gradient(to right, rgba(0,0,0,0.4), transparent)" }}
        />
        <SourceGlyph glyph={fb.glyph} px={glyphPx} />
        <div
          className={`mt-2 px-1.5 py-0.5 rounded ${s.titleSize} font-semibold tracking-wide`}
          style={{
            background: "rgba(245,240,232,0.16)",
            color: "#f5f0e8",
            fontFamily: "Inter, sans-serif",
          }}
        >
          {fb.label}
        </div>
        {book.title && (
          <p
            className={`${s.titleSize} mt-1 text-center leading-tight px-2 line-clamp-2`}
            style={{ color: "rgba(245,240,232,0.82)", fontFamily: "Inter, sans-serif" }}
          >
            {book.title.length > 16 ? book.title.slice(0, 16) + "…" : book.title}
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
