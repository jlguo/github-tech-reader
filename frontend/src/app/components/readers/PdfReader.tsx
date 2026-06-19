import { useEffect, useMemo, useState } from "react";
import { Book } from "../bookData";
import { getDataService } from "../../../services/api";
import { PDFViewer } from "@embedpdf/react-pdf-viewer";
import pdfiumWasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";

interface PdfReaderProps {
  book: Book;
}

export function PdfReader({ book }: PdfReaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);

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
    />
  );
}
