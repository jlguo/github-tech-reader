import { useState, useRef, useEffect, memo } from "react";
import { X, BookOpen, Heart, Share2, Download, Trash2, Tag, Calendar, HardDrive, Pencil, Sparkles, Plus } from "lucide-react";
import { Book, typeConfig } from "./bookData";
import { BookCover } from "./BookCover";
import { useBookStatus, isProducing as checkIsProducing } from "../hooks/useBookStatus";
import { getDataService } from "../../services/api";
import { isSystemTag } from "../../services/tagPolicy";

const PHASE_LABELS: Record<string, string> = {
  pending: "准备生成...",
  fetching: "正在获取仓库文件...",
  planning: "正在规划章节...",
  cover: "正在设计封面...",
  writing: "正在撰写内容...",
  reviewing: "正在审核内容...",
  publishing: "正在排版发布...",
};

const TYPE_EXTENSION: Record<string, string> = {
  pdf: "pdf",
  epub: "epub",
  word: "docx",
  ppt: "pptx",
  excel: "xlsx",
  txt: "txt",
  html: "html",
};

function sanitizeFilename(name: string): string {
  return (name || "download").replace(/[\\/:*?"<>|]/g, "_").trim() || "download";
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


interface BookDetailModalProps {
  book: Book | null;
  onClose: () => void;
  onToggleFavorite: (id: string) => void;
  onRead?: (book: Book) => void;
  onDelete?: (bookId: string) => void;
  onUpdate?: (bookId: string, data: Record<string, any>) => void;
  onGenerate?: (bookId: string) => void;
  allTags?: string[];
}

export const BookDetailModal = memo(function BookDetailModal({ book, onClose, onToggleFavorite, onRead, onDelete, onUpdate, onGenerate, allTags = [] }: BookDetailModalProps) {
  const [tagInput, setTagInput] = useState("");
  const [showAllTags, setShowAllTags] = useState(false);
  if (!book) return null;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [downloading, setDownloading] = useState(false);
  const deleteConfirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showDeleteConfirm) {
      deleteConfirmRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [showDeleteConfirm]);
  const typeInfo = typeConfig[book.type] ?? { label: "FILE", color: "#5a5a5a", bg: "#f0f0f0" };

  const liveStatus = useBookStatus(!book.isDemo ? book.id : null, book.sourceType);
  const effectiveStatus = liveStatus?.status ?? book.genStatus;
  const effectivePhase = liveStatus?.current_phase ?? undefined;
  const producing = checkIsProducing(effectiveStatus);

  const handleDownload = async () => {
    if (downloading || producing) return;
    setDownloading(true);
    try {
      const svc = await getDataService();
      const baseName = sanitizeFilename(book.title);

      if (book.sourceType === "file") {
        const url = await svc.getImportedFileBlobUrl(book.id);
        if (!url) throw new Error("文件不可用");
        const res = await fetch(url);
        if (!res.ok) throw new Error(`下载失败 (${res.status})`);
        const blob = await res.blob();
        const ext = TYPE_EXTENSION[book.type] ?? "bin";
        triggerBlobDownload(blob, `${baseName}.${ext}`);
        return;
      }

      const isRepoBook = book.sourceType === "github" || book.sourceType === "youtube";
      const { html_content } = isRepoBook
        ? await svc.getBookByRepo(book.id)
        : await svc.getBookContent(book.id);
      if (!html_content) throw new Error("内容不可用");
      triggerBlobDownload(
        new Blob([html_content], { type: "text/html;charset=utf-8" }),
        `${baseName}.html`,
      );
    } catch {
      window.alert("下载失败，请稍后重试");
    } finally {
      setDownloading(false);
    }
  };

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
                disabled={producing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "Inter, sans-serif" }}
                data-testid="book-detail-read"
              >
                <BookOpen size={14} />
                {producing ? (effectivePhase && PHASE_LABELS[effectivePhase]) || "生成中..." : book.progress === 0 ? "开始阅读" : book.progress === 100 ? "重新阅读" : "继续阅读"}
              </button>
              {!book.isDemo && !producing && (effectiveStatus === "no_book" || effectiveStatus === undefined || effectiveStatus === "failed") && (
                <button
                  onClick={() => onGenerate?.(book.id)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all"
                  style={{ background: "var(--accent)", color: "var(--accent-foreground)", fontFamily: "Inter, sans-serif" }}
                  data-testid="book-detail-generate"
                >
                  <Sparkles size={14} />
                  {effectiveStatus === "failed" ? "重新生成" : "生成电子书"}
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
                onClick={handleDownload}
                disabled={downloading || producing}
                className="p-2 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
              {book.totalPages > 0 && <span>{book.currentPage} / {book.totalPages} 页</span>}
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
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(book.tags ?? []).map(tag => {
                const system = isSystemTag(tag);
                return (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                    style={{
                      background: system ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "var(--secondary)",
                      color: system ? "var(--accent)" : "var(--secondary-foreground)",
                      fontFamily: "Inter, sans-serif",
                    }}
                    data-testid={`book-detail-tag-${tag}`}
                  >
                    {tag}
                    {!system && (
                      <button
                        onClick={() => onUpdate?.(book.id, { tags: (book.tags ?? []).filter(t => t !== tag) })}
                        className="ml-0.5 rounded-full hover:opacity-70 transition-opacity inline-flex items-center justify-center"
                        style={{ width: 14, height: 14, color: "var(--secondary-foreground)" }}
                        data-testid={`book-detail-tag-remove-${tag}`}
                      >
                        <X size={10} />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    const trimmed = tagInput.trim();
                    if (trimmed && !(book.tags ?? []).includes(trimmed)) {
                      onUpdate?.(book.id, { tags: [...(book.tags ?? []), trimmed] });
                    }
                    setTagInput("");
                  }
                }}
                placeholder="添加标签..."
                className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border outline-none"
                style={{
                  color: "var(--foreground)",
                  fontFamily: "Inter, sans-serif",
                  background: "var(--background)",
                  borderColor: "var(--border)",
                }}
                data-testid="book-detail-tag-input"
              />
              <button
                onClick={() => {
                  const trimmed = tagInput.trim();
                  if (trimmed && !(book.tags ?? []).includes(trimmed)) {
                    onUpdate?.(book.id, { tags: [...(book.tags ?? []), trimmed] });
                  }
                  setTagInput("");
                }}
                disabled={!tagInput.trim()}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                style={{ background: "var(--accent)", color: "#fff", fontFamily: "Inter, sans-serif" }}
                data-testid="book-detail-tag-add"
              >
                <Plus size={12} />
                添加
              </button>
            </div>

            {/* Existing tags quick-select */}
            {(() => {
              const suggestions = allTags.filter(tag => !(book.tags ?? []).includes(tag));
              if (suggestions.length === 0) return null;
              const TAG_LIMIT = 20;
              const visible = showAllTags ? suggestions : suggestions.slice(0, TAG_LIMIT);
              const hiddenCount = suggestions.length - visible.length;
              return (
                <div className="mt-3" data-testid="book-detail-tag-suggestions">
                  <span className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                    可选标签
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {visible.map(tag => (
                      <button
                        key={tag}
                        onClick={() => onUpdate?.(book.id, { tags: [...(book.tags ?? []), tag] })}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors hover:opacity-70"
                        style={{ borderColor: "var(--border)", color: "var(--muted-foreground)", background: "transparent", fontFamily: "Inter, sans-serif" }}
                        data-testid={`book-detail-tag-suggest-${tag}`}
                      >
                        <Plus size={10} />
                        {tag}
                      </button>
                    ))}
                    {hiddenCount > 0 && (
                      <button
                        onClick={() => setShowAllTags(true)}
                        className="inline-flex items-center text-xs px-2.5 py-1 rounded-full border transition-colors hover:opacity-70"
                        style={{ borderColor: "var(--border)", color: "var(--accent)", background: "transparent", fontFamily: "Inter, sans-serif" }}
                        data-testid="book-detail-tag-suggest-more"
                      >
                        更多 +{hiddenCount}
                      </button>
                    )}
                    {showAllTags && suggestions.length > TAG_LIMIT && (
                      <button
                        onClick={() => setShowAllTags(false)}
                        className="inline-flex items-center text-xs px-2.5 py-1 rounded-full border transition-colors hover:opacity-70"
                        style={{ borderColor: "var(--border)", color: "var(--muted-foreground)", background: "transparent", fontFamily: "Inter, sans-serif" }}
                        data-testid="book-detail-tag-suggest-less"
                      >
                        收起
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
            </div>

            {/* Delete confirmation */}
            {showDeleteConfirm && (
              <div ref={deleteConfirmRef} className="mt-3 p-3 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
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
});
