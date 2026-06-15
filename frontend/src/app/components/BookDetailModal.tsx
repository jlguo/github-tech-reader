import { X, BookOpen, Heart, Share2, Download, Tag, Calendar, HardDrive } from "lucide-react";
import { Book, typeConfig } from "./bookData";
import { BookCover } from "./BookCover";

interface BookDetailModalProps {
  book: Book | null;
  onClose: () => void;
  onToggleFavorite: (id: string) => void;
  onRead?: (book: Book) => void;
}

export function BookDetailModal({ book, onClose, onToggleFavorite, onRead }: BookDetailModalProps) {
  if (!book) return null;
  const typeInfo = typeConfig[book.type];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0" style={{ background: "rgba(44,26,14,0.6)", backdropFilter: "blur(4px)" }} />

      <div
        className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden"
        style={{ background: "var(--card)", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header strip */}
        <div className="h-1 w-full" style={{ background: typeInfo.color }} />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full transition-colors"
          style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
        >
          <X size={18} />
        </button>

        <div className="p-6 flex gap-5">
          <BookCover book={book} size="lg" />
          <div className="flex-1 min-w-0 pt-1">
            <div
              className="text-xs px-2 py-0.5 rounded-full inline-block mb-2 font-medium"
              style={{ background: typeInfo.bg, color: typeInfo.color, fontFamily: "Inter, sans-serif" }}
            >
              {typeInfo.label}
            </div>
            <h2
              className="leading-tight mb-1"
              style={{ fontFamily: "Playfair Display, serif", color: "var(--foreground)", fontWeight: 700, fontSize: "1.25rem" }}
            >
              {book.title}
            </h2>
            <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
              {book.author}
            </p>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => onRead?.(book)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "Inter, sans-serif" }}
              >
                <BookOpen size={14} />
                {book.progress === 0 ? "开始阅读" : book.progress === 100 ? "重新阅读" : "继续阅读"}
              </button>
              <button
                onClick={() => onToggleFavorite(book.id)}
                className="p-2 rounded-full transition-colors"
                style={{
                  background: book.isFavorite ? "#fef3e2" : "var(--muted)",
                  color: book.isFavorite ? "#c17f3a" : "var(--muted-foreground)",
                }}
              >
                <Heart size={16} fill={book.isFavorite ? "currentColor" : "none"} />
              </button>
              <button
                className="p-2 rounded-full transition-colors"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
              >
                <Share2 size={16} />
              </button>
              <button
                className="p-2 rounded-full transition-colors"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
              >
                <Download size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Progress */}
        {book.progress > 0 && (
          <div className="px-6 pb-4">
            <div className="flex justify-between text-xs mb-2" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
              <span>{book.progress === 100 ? "已读完" : `已读 ${book.progress}%`}</span>
              <span>{book.currentPage} / {book.totalPages} 页</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${book.progress}%`, background: book.progress === 100 ? "#6b9e6b" : "var(--accent)" }}
              />
            </div>
          </div>
        )}

        <div className="px-6 pb-6 space-y-4">
          {/* Description */}
          <div>
            <h4 className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
              简介
            </h4>
            <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)", fontFamily: "Source Serif 4, serif" }}>
              {book.description}
            </p>
          </div>

          {/* Meta info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
              <Calendar size={13} />
              <span>添加于 {book.addedDate}</span>
            </div>
            {book.lastRead && (
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                <BookOpen size={13} />
                <span>上次阅读 {book.lastRead}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
              <HardDrive size={13} />
              <span>{book.size}</span>
            </div>
          </div>

          {/* Tags */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Tag size={13} style={{ color: "var(--muted-foreground)" }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                标签
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {book.tags.map(tag => (
                <span
                  key={tag}
                  className="text-xs px-2.5 py-1 rounded-full"
                  style={{ background: "var(--secondary)", color: "var(--secondary-foreground)", fontFamily: "Inter, sans-serif" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
