import { Heart, BookOpen } from "lucide-react";
import { Book, typeConfig } from "./bookData";
import { BookCover } from "./BookCover";

interface BookCardProps {
  book: Book;
  viewMode: "grid" | "list";
  onToggleFavorite: (id: string) => void;
  onOpen: (book: Book) => void;
}

export function BookCard({ book, viewMode, onToggleFavorite, onOpen }: BookCardProps) {
  const typeInfo = typeConfig[book.type] ?? { label: "FILE", color: "#5a5a5a", bg: "#f0f0f0" };

  if (viewMode === "list") {
    return (
      <div
        className="flex items-center gap-4 p-3 rounded-xl cursor-pointer group transition-all duration-200"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        onClick={() => onOpen(book)}
      >
        <BookCover book={book} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3
                className="truncate leading-tight"
                style={{ fontFamily: "Playfair Display, serif", color: "var(--foreground)", fontSize: "0.95rem", fontWeight: 600 }}
              >
                {book.title}
              </h3>
              <p className="text-sm mt-0.5 truncate" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                {book.author}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: typeInfo.bg, color: typeInfo.color, fontFamily: "Inter, sans-serif" }}
              >
                {typeInfo.label}
              </span>
              <button
                onClick={e => { e.stopPropagation(); onToggleFavorite(book.id); }}
                className="transition-colors"
                style={{ color: book.isFavorite ? "#c17f3a" : "var(--muted-foreground)" }}
              >
                <Heart size={16} fill={book.isFavorite ? "currentColor" : "none"} />
              </button>
            </div>
          </div>
          {book.progress > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                  {book.progress === 100 ? "已读完" : `已读 ${book.progress}%`}
                </span>
                <span className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                  {book.currentPage}/{book.totalPages} 页
                </span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${book.progress}%`,
                    background: book.progress === 100 ? "#6b9e6b" : "var(--accent)",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col rounded-xl overflow-hidden cursor-pointer group transition-all duration-200 hover:-translate-y-1"
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        boxShadow: "0 2px 8px rgba(92,61,30,0.08)",
      }}
      onClick={() => onOpen(book)}
    >
      <div className="relative p-4 pb-3 flex justify-center" style={{ background: "var(--secondary)" }}>
        <BookCover book={book} size="md" />
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite(book.id); }}
          className="absolute top-2 right-2 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all"
          style={{ background: "rgba(255,255,255,0.9)", color: book.isFavorite ? "#c17f3a" : "var(--muted-foreground)" }}
        >
          <Heart size={14} fill={book.isFavorite ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="p-3 flex flex-col flex-1">
        <h3
          className="leading-snug line-clamp-2 mb-0.5"
          style={{ fontFamily: "Playfair Display, serif", color: "var(--foreground)", fontSize: "0.875rem", fontWeight: 600 }}
        >
          {book.title}
        </h3>
        <p className="text-xs mb-2 truncate" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
          {book.author}
        </p>

        {book.progress > 0 && (
          <div className="mt-auto">
            <div className="h-1 rounded-full overflow-hidden mb-1" style={{ background: "var(--muted)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${book.progress}%`,
                  background: book.progress === 100 ? "#6b9e6b" : "var(--accent)",
                }}
              />
            </div>
            <span className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
              {book.progress === 100 ? "✓ 已读完" : `${book.progress}%`}
            </span>
          </div>
        )}
      </div>

      {/* Hover overlay */}
      <div
        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-xl"
        style={{ background: "rgba(92,61,30,0.12)" }}
      >
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-full"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "Inter, sans-serif", fontSize: "0.8rem" }}
        >
          <BookOpen size={14} />
          <span>继续阅读</span>
        </div>
      </div>
    </div>
  );
}
