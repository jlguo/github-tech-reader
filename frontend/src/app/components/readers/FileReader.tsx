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
        const doc = win.document;
        const tapScript = doc.createElement("script");
        tapScript.textContent = `(function(){var s=null;document.addEventListener('pointerdown',function(e){s={x:e.clientX,y:e.clientY,t:Date.now()}});document.addEventListener('pointerup',function(e){if(!s)return;var dx=e.clientX-s.x,dy=e.clientY-s.y,d=Math.sqrt(dx*dx+dy*dy),dt=Date.now()-s.t;s=null;if(dt>=300||d>=10)return;var w=window.innerWidth,h=window.innerHeight;if(e.clientX/w<0.3||e.clientX/w>0.7||e.clientY/h<0.3||e.clientY/h>0.7)return;parent.postMessage({type:'reader-center-tap'},'*')});})();`;
        doc.head.appendChild(tapScript);
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
