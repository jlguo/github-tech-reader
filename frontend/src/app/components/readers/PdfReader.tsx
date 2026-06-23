import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Book } from "../bookData";
import { getDataService } from "../../../services/api";
import {
  PDFViewer,
  type PluginRegistry,
  type ScrollPlugin,
  type PageChangeEvent,
} from "@embedpdf/react-pdf-viewer";
import pdfiumWasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import { useReadingProgress } from "../../hooks/useReadingProgress";

interface PdfReaderProps {
  book: Book;
}

export function PdfReader({ book }: PdfReaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const { save } = useReadingProgress(book.id);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const absWasmUrl = useMemo(
    () => new URL(pdfiumWasmUrl, window.location.href).toString(),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const svc = await getDataService();
        const blobUrl = await svc.getImportedFileBlobUrl(book.id);
        if (cancelled) return;
        if (!blobUrl) {
          setError("Failed to load PDF");
          return;
        }
        const resp = await fetch(blobUrl);
        const buf = await resp.arrayBuffer();
        if (cancelled) return;
        setBuffer(buf);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load PDF");
      }
    })();
    return () => { cancelled = true; };
  }, [book.id]);

  useEffect(() => () => { unsubscribeRef.current?.(); }, []);

  const handleReady = useCallback(
    async (registry: PluginRegistry) => {
      try {
        await registry.pluginsReady();
        const scroll = registry.getPlugin<ScrollPlugin>("scroll");
        if (!scroll) return;
        const capability = scroll.provides();
        if (!capability) return;
        unsubscribeRef.current?.();
        unsubscribeRef.current = capability.onPageChange((evt: PageChangeEvent) => {
          const total = evt.totalPages;
          if (!total || total <= 0) return;
          const page = evt.pageNumber;
          const pct = Math.round((page / total) * 100);
          save({
            percent: Math.max(Math.min(pct, 100), 1),
            completed: page >= total,
            metadata: { page, totalPages: total },
          });
        });
      } catch {
        // Scroll plugin unavailable — progress tracking is best-effort.
      }
    },
    [save],
  );

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center text-red-500 p-4">
        {error}
      </div>
    );
  }

  if (!buffer) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white">
        加载 PDF 中...
      </div>
    );
  }

  return (
    <PDFViewer
      config={{
        worker: true,
        wasmUrl: absWasmUrl,
        fontFallback: null,
        documentManager: {
          initialDocuments: [{ buffer, name: `${book.title}.pdf` }],
        },
        stamp: { manifests: [], defaultLibrary: false },
      }}
      style={{ width: "100%", height: "100%" }}
      onReady={handleReady}
    />
  );
}
