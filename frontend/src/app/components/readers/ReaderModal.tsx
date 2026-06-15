import { X, ArrowLeft, MoreVertical, Bookmark } from "lucide-react";
import { Book, typeConfig } from "../bookData";
import { EpubReader } from "./EpubReader";
import { PdfReader } from "./PdfReader";
import { DocReader } from "./DocReader";
import { PptReader } from "./PptReader";
import { ExcelReader } from "./ExcelReader";
import { MangaReader } from "./MangaReader";
import { HtmlReader } from "./HtmlReader";

interface ReaderModalProps {
  book: Book | null;
  onClose: () => void;
}

function ReaderContent({ book }: { book: Book }) {
  if (book.category === "manga") return <MangaReader book={book} />;
  switch (book.type) {
    case "epub":
    case "txt":
      return <EpubReader book={book} />;
    case "pdf":
      return <PdfReader book={book} />;
    case "word":
      return <DocReader book={book} />;
    case "ppt":
      return <PptReader book={book} />;
    case "excel":
      return <ExcelReader book={book} />;
    case "html":
      return <HtmlReader book={book} />;
    default:
      return <EpubReader book={book} />;
  }
}

function getReaderBg(book: Book) {
  switch (book.type) {
    case "pdf": return "#4a4a4a";
    case "ppt": return "#1a1a1a";
    case "excel": return "#f5f5f5";
    case "word": return "#e8e8e8";
    case "html": return "#f5f0e8";
    default: return book.category === "manga" ? "#0d0d0d" : "#faf6ed";
  }
}

export function ReaderModal({ book, onClose }: ReaderModalProps) {
  if (!book) return null;
  const typeInfo = typeConfig[book.type];

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: getReaderBg(book) }}>
      {/* Reader top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0 border-b"
        style={{
          background: book.type === "pdf" || book.type === "ppt" || book.category === "manga"
            ? "rgba(0,0,0,0.7)"
            : "rgba(245,240,232,0.95)",
          backdropFilter: "blur(8px)",
          borderColor: book.type === "pdf" || book.type === "ppt" || book.category === "manga"
            ? "rgba(255,255,255,0.08)"
            : "rgba(92,61,30,0.1)",
        }}
      >
        <button
          onClick={onClose}
          className="flex items-center gap-2 transition-opacity hover:opacity-70"
          style={{
            color: book.type === "pdf" || book.type === "ppt" || book.category === "manga"
              ? "#d0d0d0"
              : "var(--foreground)",
          }}
        >
          <ArrowLeft size={18} />
          <span className="text-sm hidden sm:block" style={{ fontFamily: "Inter, sans-serif" }}>返回书架</span>
        </button>

        <div className="flex flex-col items-center">
          <p
            className="text-sm font-medium truncate max-w-[200px] sm:max-w-[320px]"
            style={{
              fontFamily: "Playfair Display, serif",
              color: book.type === "pdf" || book.type === "ppt" || book.category === "manga" ? "#d0d0d0" : "var(--foreground)",
            }}
          >
            {book.title}
          </p>
          <span
            className="text-xs px-1.5 py-0.5 rounded mt-0.5"
            style={{ background: typeInfo.bg, color: typeInfo.color, fontFamily: "Inter, sans-serif", fontSize: "0.6rem", fontWeight: 600 }}
          >
            {typeInfo.label}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            className="p-2 rounded-full transition-colors hover:bg-black/10"
            style={{ color: book.type === "pdf" || book.type === "ppt" || book.category === "manga" ? "#aaa" : "var(--muted-foreground)" }}
          >
            <Bookmark size={17} />
          </button>
          <button
            className="p-2 rounded-full transition-colors hover:bg-black/10"
            style={{ color: book.type === "pdf" || book.type === "ppt" || book.category === "manga" ? "#aaa" : "var(--muted-foreground)" }}
          >
            <MoreVertical size={17} />
          </button>
        </div>
      </div>

      {/* Reader content */}
      <div className="flex-1 min-h-0">
        <ReaderContent book={book} />
      </div>

      {/* Progress bar */}
      {book.progress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: "rgba(0,0,0,0.1)" }}>
          <div
            className="h-full"
            style={{ width: `${book.progress}%`, background: "#c17f3a", transition: "width 0.5s" }}
          />
        </div>
      )}
    </div>
  );
}
