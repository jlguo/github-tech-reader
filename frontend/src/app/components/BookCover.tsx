import { Book, typeConfig } from "./bookData";

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

  if (book.cover) {
    return (
      <div
        className={`${s.width} ${s.height} relative flex-shrink-0 overflow-hidden shadow-md`}
        style={{ borderRadius: "2px 6px 6px 2px" }}
        data-testid={`book-cover-img-${book.id}`}
      >
        <img
          src={book.cover}
          alt={book.title}
          className="w-full h-full object-cover"
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
        {/* Spine shadow */}
        <div
          className="absolute left-0 top-0 h-full w-3 opacity-30"
          style={{ background: "linear-gradient(to right, rgba(0,0,0,0.4), transparent)" }}
        />
      </div>
    );
  }

  // Document cover — no image
  return (
    <div
      className={`${s.width} ${s.height} relative flex-shrink-0 flex flex-col items-center justify-center shadow-md`}
      style={{
        background: `linear-gradient(135deg, ${book.coverColor}, ${book.coverColor}cc)`,
        borderRadius: "2px 6px 6px 2px",
      }}
      data-testid={`book-cover-color-${book.id}`}
    >
      {/* Spine shadow */}
      <div
        className="absolute left-0 top-0 h-full w-3 opacity-30"
        style={{ background: "linear-gradient(to right, rgba(0,0,0,0.4), transparent)" }}
      />
      <div
        className={`px-1.5 py-0.5 rounded mb-2 ${s.titleSize} font-semibold tracking-wide`}
        style={{ background: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.9)", fontFamily: "Inter, sans-serif" }}
        data-testid={`book-cover-type-${book.id}`}
      >
        {typeInfo.label}
      </div>
      <div
        className={`${s.titleSize} text-center px-2 leading-tight`}
        style={{ color: "rgba(255,255,255,0.85)", fontFamily: "Inter, sans-serif", wordBreak: "break-all" }}
      >
        {book.title.slice(0, 12)}
      </div>
      {book.isDemo && (
        <div
          className={`mt-1.5 px-1.5 py-0.5 rounded ${s.titleSize} font-medium`}
          style={{
            background: "rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.7)",
            fontFamily: "Inter, sans-serif",
          }}
        >
          示例
        </div>
      )}
    </div>
  );
}
