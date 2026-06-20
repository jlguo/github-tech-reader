import { Book } from "../bookData";
import { getDataService } from "../../../services/api";
import { useState, useEffect, useRef } from "react";
import { useReadingProgress } from "../../hooks/useReadingProgress";

interface FileReaderProps {
  book: Book;
}

export function FileReader({ book }: FileReaderProps) {
  const [fileUrl, setFileUrl] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>();
  const cleanupScroll = useRef<(() => void) | null>(null);
  const { save } = useReadingProgress(book.id);

  const setupScrollTracking = (win: Window) => {
    if (cleanupScroll.current) cleanupScroll.current();

    const doc = win.document;
    const onScroll = () => {
      const de = doc.documentElement;
      const maxScroll = de.scrollHeight - de.clientHeight;
      if (maxScroll <= 0) return;
      const pct = Math.round((de.scrollTop / maxScroll) * 100);
      clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => {
        save({ percent: Math.max(pct, 1), completed: pct >= 95, metadata: {} });
      }, 1000);
    };

    win.addEventListener("scroll", onScroll, { passive: true });
    doc.addEventListener("scroll", onScroll, { passive: true });
    cleanupScroll.current = () => {
      win.removeEventListener("scroll", onScroll);
      doc.removeEventListener("scroll", onScroll);
    };

    save({ percent: 1, completed: false, metadata: {} });
  };

  useEffect(() => {
    let cancelled = false;

    getDataService().then(async (svc) => {
      const url = await svc.getImportedFileBlobUrl(book.id);
      if (cancelled || !url) return;
      setFileUrl(url);
    });

    return () => {
      cancelled = true;
      clearTimeout(scrollTimer.current);
      if (cleanupScroll.current) cleanupScroll.current();
    };
  }, [book.id]);

  const handleIframeLoad = () => {
    try {
      const win = iframeRef.current?.contentWindow;
      if (win && win.document.readyState === "complete") {
        setupScrollTracking(win);
        injectTapDetector(win.document);
        return;
      }
    } catch { /* cross-origin */ }
    save({ percent: 1, completed: false, metadata: {} });
  };

  if (!fileUrl) return null;

  return (
    <iframe
      ref={iframeRef}
      src={fileUrl}
      title={book.title}
      onLoad={handleIframeLoad}
      className="w-full h-full"
      style={{ border: "none" }}
    />
  );
}
