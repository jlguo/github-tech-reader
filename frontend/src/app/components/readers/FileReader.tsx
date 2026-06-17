import { Book } from "../bookData";
import { API_BASE_URL } from "../../../config/api";

interface FileReaderProps {
  book: Book;
}

export function FileReader({ book }: FileReaderProps) {
  const fileUrl = `${API_BASE_URL}/imports/${book.id}/file`;

  return (
    <iframe
      src={fileUrl}
      title={book.title}
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        flex: 1,
      }}
    />
  );
}
