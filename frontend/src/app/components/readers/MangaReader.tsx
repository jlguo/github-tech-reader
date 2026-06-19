import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, ZoomIn } from "lucide-react";
import { mangaPages } from "./readerData";
import { Book } from "../bookData";
import { getDataService } from "../../../services/api";
import { useReadingProgress } from "../../hooks/useReadingProgress";
import JSZip from "jszip";

interface MangaReaderProps {
  book: Book;
}

export function MangaReader({ book }: MangaReaderProps) {
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState<"rtl" | "ltr">("rtl");
  const [zoom, setZoom] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const urlsRef = useRef<string[]>([]);
  const { save } = useReadingProgress(book.id);
  const isDemo = book.isDemo === true;

  const allImages = useMemo<string[]>(() => {
    if (isDemo) return mangaPages.map(p => p.image);
    return imageUrls;
  }, [isDemo, imageUrls]);

  const totalPages = allImages.length;

  useEffect(() => {
    save({ percent: totalPages > 0 ? Math.round((page + 1) / totalPages * 100) : 0, completed: page >= totalPages - 1, metadata: {} });
  }, [page, totalPages, save]);

  useEffect(() => {
    if (isDemo) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const svc = await getDataService();
        const blobUrl = await svc.getImportedFileBlobUrl(book.id);
        if (cancelled) return;
        if (!blobUrl) {
          setError("Failed to load CBZ file");
          return;
        }
        const resp = await fetch(blobUrl);
        const buf = await resp.arrayBuffer();
        if (cancelled) return;

        const zip = await JSZip.loadAsync(buf);
        const imageExts = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
        const files = Object.keys(zip.files)
          .filter(n => imageExts.some(ext => n.toLowerCase().endsWith(ext)))
          .sort();

        if (files.length === 0) {
          if (!cancelled) setError("No images found in CBZ file");
          return;
        }

        const urls = await Promise.all(
          files.map(async (name) => {
            const blob = await zip.file(name)!.async("blob");
            return URL.createObjectURL(blob);
          })
        );

        if (cancelled) {
          urls.forEach(u => URL.revokeObjectURL(u));
          return;
        }

        urlsRef.current = urls;
        setImageUrls(urls);
        setLoading(false);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load CBZ");
      }
    })();

    return () => {
      cancelled = true;
      urlsRef.current.forEach(u => URL.revokeObjectURL(u));
      urlsRef.current = [];
    };
  }, [book.id, isDemo]);

  const prev = () => setPage(v => Math.max(0, v - 1));
  const next = () => setPage(v => Math.min(totalPages - 1, v + 1));

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center text-red-500 p-4">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: "#0d0d0d" }}>
        <span className="text-sm" style={{ color: "#888", fontFamily: "Inter, sans-serif" }}>
          加载漫画中...
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full select-none"
      style={{ background: "#0d0d0d" }}
    >
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        data-testid="manga-reader-toolbar"
        style={{ background: "#1a1a1a", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs" data-testid="manga-reader-page-info" style={{ color: "#888", fontFamily: "Inter, sans-serif" }}>
            {page + 1} / {totalPages}
          </span>
          <div className="w-px h-3 mx-1" style={{ background: "rgba(255,255,255,0.15)" }} />
          <button
            onClick={() => setDirection(v => v === "rtl" ? "ltr" : "rtl")}
            data-testid="manga-reader-direction"
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors hover:bg-white/10"
            style={{ color: "#888", fontFamily: "Inter, sans-serif" }}
          >
            <RotateCcw size={12} />
            {direction === "rtl" ? "从右到左" : "从左到右"}
          </button>
        </div>

        <p className="text-xs truncate" style={{ color: "#666", fontFamily: "Inter, sans-serif" }}>
          {book.title}
        </p>

        <button
          onClick={() => setZoom(v => !v)}
          data-testid="manga-reader-zoom"
          className="p-1.5 rounded transition-colors hover:bg-white/10"
          style={{ color: zoom ? "#c17f3a" : "#888" }}
        >
          <ZoomIn size={15} />
        </button>
      </div>

      <div
        className="flex-1 flex items-center justify-center relative overflow-hidden"
        data-testid="manga-reader-page"
        onClick={e => {
          const rect = (e.target as HTMLElement).closest(".manga-area")?.getBoundingClientRect();
          if (!rect) return;
          const x = e.clientX - rect.left;
          if (direction === "rtl") {
            x < rect.width / 2 ? next() : prev();
          } else {
            x > rect.width / 2 ? next() : prev();
          }
        }}
      >
        <div
          className="manga-area relative h-full flex items-center justify-center cursor-pointer"
          style={{ width: "100%" }}
        >
          <img
            src={allImages[page]}
            alt={`Page ${page + 1}`}
            className="max-h-full transition-all duration-300"
            style={{
              maxWidth: zoom ? "100%" : "80%",
              objectFit: "contain",
              boxShadow: "0 0 60px rgba(0,0,0,0.8)",
            }}
          />

          <div
            className="absolute left-0 top-0 bottom-0 w-1/2 flex items-center pl-4 opacity-0 hover:opacity-100 transition-opacity"
          >
            <div
              className="p-2 rounded-full"
              style={{ background: "rgba(255,255,255,0.1)" }}
            >
              {direction === "rtl" ? <ChevronRight size={20} style={{ color: "white" }} /> : <ChevronLeft size={20} style={{ color: "white" }} />}
            </div>
          </div>
          <div
            className="absolute right-0 top-0 bottom-0 w-1/2 flex items-center justify-end pr-4 opacity-0 hover:opacity-100 transition-opacity"
          >
            <div
              className="p-2 rounded-full"
              style={{ background: "rgba(255,255,255,0.1)" }}
            >
              {direction === "rtl" ? <ChevronLeft size={20} style={{ color: "white" }} /> : <ChevronRight size={20} style={{ color: "white" }} />}
            </div>
          </div>
        </div>
      </div>

      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        data-testid="manga-reader-progress"
        style={{ background: "#1a1a1a", borderTop: "1px solid rgba(255,255,255,0.08)" }}
      >
        <button
          onClick={prev}
          disabled={page === 0}
          data-testid="manga-reader-prev"
          className="p-1.5 rounded transition-colors hover:bg-white/10 disabled:opacity-30"
          style={{ color: "white" }}
        >
          <ChevronLeft size={16} />
        </button>

        <div className="flex-1 flex gap-1">
          {allImages.map((_, i) => (
            <button
              key={i}
              data-testid={`manga-reader-dot-${i}`}
              onClick={() => setPage(i)}
              className="flex-1 h-1.5 rounded-full transition-all"
              style={{ background: i === page ? "#c17f3a" : "rgba(255,255,255,0.2)" }}
            />
          ))}
        </div>

        <button
          onClick={next}
          disabled={page === totalPages - 1}
          data-testid="manga-reader-next"
          className="p-1.5 rounded transition-colors hover:bg-white/10 disabled:opacity-30"
          style={{ color: "white" }}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
