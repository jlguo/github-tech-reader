import { X, BookOpen, Heart, Share2, Download, Trash2, Tag, Calendar, HardDrive, Pencil, Sparkles } from "lucide-react";
import { useState } from "react";
import { Book, typeConfig } from "./bookData";
import { BookCover } from "./BookCover";

interface BookDetailModalProps {
  book: Book | null;
  onClose: () => void;
  onToggleFavorite: (id: string) => void;
  onRead?: (book: Book) => void;
  onDelete?: (bookId: string) => void;
  onUpdate?: (bookId: string, data: Record<string, any>) => void;
  onGenerate?: (bookId: string) => void;
}

export function BookDetailModal({ book, onClose, onToggleFavorite, onRead, onDelete, onUpdate, onGenerate }: BookDetailModalProps) {
  if (!book) return null;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const typeInfo = typeConfig[book.type];
  const isProducing = book.genStatus === "writing";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0" style={{ background: "rgba(44,26,14,0.6)", backdropFilter: "blur(4px)" }} data-testid="book-detail-overlay" />

      <div
        className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden"
        style={{ background: "var(--card)", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
        data-testid="book-detail-content"
      >
        {/* Header strip */}
        <div className="h-1 w-full" style={{ background: typeInfo.color }} />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full transition-colors"
          style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
          data-testid="book-detail-close"
        >
          <X size={18} />
        </button>

        <div className="p-6 flex gap-5">
          <BookCover book={book} size="lg" />
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <div
                className="text-xs px-2 py-0.5 rounded-full inline-block font-medium"
                style={{ background: typeInfo.bg, color: typeInfo.color, fontFamily: "Inter, sans-serif" }}
                data-testid="book-detail-type"
              >
                {typeInfo.label}
              </div>
              {book.isDemo && (
                <div
                  className="text-xs px-2 py-0.5 rounded-full inline-block font-medium"
                  style={{
                    background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                    color: "var(--accent)",
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  示例
                </div>
              )}
            </div>
            <h2
              className="leading-tight mb-1"
              style={{ fontFamily: "Playfair Display, serif", color: "var(--foreground)", fontWeight: 700, fontSize: "1.25rem" }}
              data-testid="book-detail-title"
            >
              {book.title}
            </h2>
            <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }} data-testid="book-detail-author">
              {book.author}
            </p>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => onRead?.(book)}
                disabled={isProducing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "Inter, sans-serif" }}
                data-testid="book-detail-read"
              >
                <BookOpen size={14} />
                {isProducing ? "生成中..." : book.progress === 0 ? "开始阅读" : book.progress === 100 ? "重新阅读" : "继续阅读"}
              </button>
              {!book.isDemo && (book.genStatus === "no_book" || book.genStatus === undefined || book.genStatus === "failed") && (
                <button
                  onClick={() => onGenerate?.(book.id)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all"
                  style={{ background: "var(--accent)", color: "var(--accent-foreground)", fontFamily: "Inter, sans-serif" }}
                  data-testid="book-detail-generate"
                >
                  <Sparkles size={14} />
                  {book.genStatus === "failed" ? "重新生成" : "生成电子书"}
                </button>
              )}
              <button
                onClick={() => onToggleFavorite(book.id)}
                className="p-2 rounded-full transition-colors"
                style={{
                  background: book.isFavorite ? "#fef3e2" : "var(--muted)",
                  color: book.isFavorite ? "var(--accent)" : "var(--muted-foreground)",
                }}
                data-testid="book-detail-favorite"
              >
                <Heart size={16} fill={book.isFavorite ? "currentColor" : "none"} />
              </button>
              <button
                className="p-2 rounded-full transition-colors"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                data-testid="book-detail-share"
              >
                <Share2 size={16} />
              </button>
              <button
                className="p-2 rounded-full transition-colors"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                data-testid="book-detail-download"
              >
                <Download size={16} />
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 rounded-full transition-colors hover:bg-red-50"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                data-testid="book-detail-delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Progress */}
        {book.progress > 0 && (
          <div className="px-6 pb-4" data-testid="book-detail-progress">
            <div className="flex justify-between text-xs mb-2" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
              <span>{book.progress === 100 ? "已读完" : `已读 ${book.progress}%`}</span>
              <span>{book.currentPage} / {book.totalPages} 页</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${book.progress}%`, background: book.progress === 100 ? "#6b9e6b" : "var(--accent)" }}
                data-testid="book-detail-progress-bar"
              />
            </div>
          </div>
        )}

        <div className="px-6 pb-6 space-y-4">
          {/* Description */}
          <div data-testid="book-detail-description">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                简介
              </h4>
              {!isEditing && (
                <button
                  onClick={() => { setIsEditing(true); setEditDesc(book.description); }}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors"
                  style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}
                  data-testid="book-detail-edit"
                >
                  <Pencil size={11} />
                  编辑
                </button>
              )}
            </div>
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  className="w-full text-sm leading-relaxed rounded-lg p-3 border outline-none resize-none"
                  rows={4}
                  style={{
                    color: "var(--foreground)",
                    fontFamily: "Source Serif 4, serif",
                    background: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                  data-testid="book-detail-edit-textarea"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="text-xs px-3 py-1 rounded-full transition-colors"
                    style={{ background: "var(--muted)", color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}
                    data-testid="book-detail-edit-cancel"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => { onUpdate?.(book.id, { description: editDesc }); setIsEditing(false); }}
                    className="text-xs px-3 py-1 rounded-full transition-colors"
                    style={{ background: "var(--accent)", color: "#fff", fontFamily: "Inter, sans-serif" }}
                    data-testid="book-detail-edit-save"
                  >
                    保存
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)", fontFamily: "Source Serif 4, serif" }}>
                {book.description || "暂无简介"}
              </p>
            )}
          </div>

          {/* Meta info */}
          <div className="grid grid-cols-2 gap-3" data-testid="book-detail-meta">
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }} data-testid="book-detail-date">
              <Calendar size={13} />
              <span>添加于 {book.addedDate}</span>
            </div>
            {book.lastRead && (
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }} data-testid="book-detail-last-read">
                <BookOpen size={13} />
                <span>上次阅读 {book.lastRead}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }} data-testid="book-detail-size">
              <HardDrive size={13} />
              <span>{book.size}</span>
            </div>
          </div>

          {/* Tags */}
          <div data-testid="book-detail-tags">
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
                  data-testid={`book-detail-tag-${tag}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
            </div>

            {/* Delete confirmation */}
            {showDeleteConfirm && (
              <div className="mt-3 p-3 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                <p className="text-xs mb-2" style={{ color: "var(--foreground)", fontFamily: "Inter, sans-serif" }}>确认删除？</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="text-xs px-3 py-1 rounded-full transition-colors"
                    style={{ background: "var(--muted)", color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}
                    data-testid="book-detail-delete-cancel"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => { onDelete?.(book.id); }}
                    className="text-xs px-3 py-1 rounded-full transition-colors"
                    style={{ background: "#dc2626", color: "#fff", fontFamily: "Inter, sans-serif" }}
                    data-testid="book-detail-delete-confirm"
                  >
                    删除
                  </button>
                </div>
              </div>
            )}
          </div>
    </div>
  );
}
