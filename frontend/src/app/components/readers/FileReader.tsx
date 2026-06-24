import { Book } from "../bookData";
import { getDataService } from "../../../services/api";
import { useState, useEffect, useRef, useCallback } from "react";
import { useReadingProgress } from "../../hooks/useReadingProgress";
import { sanitizeHtml } from "../../../utils/sanitize";
import type { BookmarkReaderApi, BookmarkAnchor, BookmarkCapableReaderProps } from "./bookmarkTypes";

interface FileReaderProps extends BookmarkCapableReaderProps {
  book: Book;
}

const TAP_DETECT_SCRIPT = `(function(){var s=null;document.addEventListener('pointerdown',function(e){s={x:e.clientX,y:e.clientY,t:Date.now()}});document.addEventListener('pointerup',function(e){if(!s)return;var dx=e.clientX-s.x,dy=e.clientY-s.y,d=Math.sqrt(dx*dx+dy*dy),dt=Date.now()-s.t;s=null;if(dt>=300||d>=10)return;var w=window.innerWidth,h=window.innerHeight;if(e.clientX/w<0.3||e.clientX/w>0.7||e.clientY/h<0.3||e.clientY/h>0.7)return;parent.postMessage({type:'reader-center-tap'},'*')});})();`;

export function FileReader({ book, onBookmarkReady, restoreAnchor }: FileReaderProps) {
  const [fileUrl, setFileUrl] = useState("");
  const [srcDoc, setSrcDoc] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>();
  const cleanupScroll = useRef<(() => void) | null>(null);
  const { save } = useReadingProgress(book.id);
  const pendingScrollRef = useRef<number | null>(null);
  const htmlPathRef = useRef(false);

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

      if (book.type === "html") {
        try {
          const res = await fetch(url);
          const raw = await res.text();
          if (cancelled) return;
          const safe = sanitizeHtml(raw);
          setSrcDoc(`<!DOCTYPE html><html><head><meta charset="UTF-8"><script>${TAP_DETECT_SCRIPT}</script></head><body>${safe}</body></html>`);
          return;
        } catch {
          if (cancelled) return;
        }
      }

      setFileUrl(url);
    });

    return () => {
      cancelled = true;
      clearTimeout(scrollTimer.current);
      if (cleanupScroll.current) cleanupScroll.current();
    };
  }, [book.id, book.type]);

  const handleIframeLoad = () => {
    try {
      const win = iframeRef.current?.contentWindow;
      if (win && win.document.readyState === "complete") {
        setupScrollTracking(win);
        if (pendingScrollRef.current !== null) {
          const de = win.document.documentElement;
          const maxScroll = de.scrollHeight - de.clientHeight;
          if (maxScroll > 0) de.scrollTop = (pendingScrollRef.current / 100) * maxScroll;
          pendingScrollRef.current = null;
        }
        return;
      }
    } catch { /* cross-origin sandboxed file */ }
    save({ percent: 1, completed: false, metadata: {} });
  };

  const getAnchor = useCallback((): BookmarkAnchor | null => {
    try {
      const win = iframeRef.current?.contentWindow;
      const doc = win?.document;
      if (!doc) return null;
      const de = doc.documentElement;
      const maxScroll = de.scrollHeight - de.clientHeight;
      return { kind: "scroll", percent: maxScroll > 0 ? Math.round((de.scrollTop / maxScroll) * 100) : 0 };
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    htmlPathRef.current = srcDoc.length > 0;
  }, [srcDoc]);

  useEffect(() => {
    if (htmlPathRef.current) {
      onBookmarkReady?.({ getAnchor });
    } else if (fileUrl) {
      onBookmarkReady?.(null);
    }
    return () => onBookmarkReady?.(null);
  }, [onBookmarkReady, getAnchor, fileUrl, srcDoc]);

  useEffect(() => {
    if (!restoreAnchor || restoreAnchor.kind !== "scroll" || !htmlPathRef.current) return;
    try {
      const win = iframeRef.current?.contentWindow;
      const doc = win?.document;
      if (doc) {
        const de = doc.documentElement;
        const maxScroll = de.scrollHeight - de.clientHeight;
        if (maxScroll > 0) de.scrollTop = (restoreAnchor.percent / 100) * maxScroll;
      } else {
        pendingScrollRef.current = restoreAnchor.percent;
      }
    } catch {
      pendingScrollRef.current = restoreAnchor.percent;
    }
  }, [restoreAnchor]);

  if (srcDoc) {
    return (
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        title={book.title}
        onLoad={handleIframeLoad}
        className="w-full h-full"
        style={{ border: "none" }}
      />
    );
  }

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
