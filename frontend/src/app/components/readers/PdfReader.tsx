import { Book } from "../bookData";
import { getDataService } from "../../../services/api";
import { useState, useEffect } from "react";

interface PdfReaderProps {
  book: Book;
}

export function PdfReader({ book }: PdfReaderProps) {
  const [fileUrl, setFileUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    getDataService().then(async (svc) => {
      const url = await svc.getImportedFileBlobUrl(book.id);
      if (cancelled) return;
      if (url) setFileUrl(url);
    });
    return () => { cancelled = true; };
  }, [book.id]);

  if (!fileUrl) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: "#4a4a4a", color: "#aaa" }}>
        Loading...
      </div>
    );
  }

  return (
    <iframe
      src={fileUrl}
      className="w-full h-full"
      style={{ border: "none", background: "#4a4a4a" }}
      title={book.title}
    />
  );
}
