export type BookmarkAnchor =
  | { kind: "scroll"; percent: number }
  | { kind: "page"; page: number; total: number }
  | { kind: "sheet"; sheet: number; total: number }
  | { kind: "cfi"; cfi: string; percent: number };

export interface BookmarkReaderApi {
  getAnchor: () => BookmarkAnchor | null;
}

export interface BookmarkCapableReaderProps {
  onBookmarkReady?: (api: BookmarkReaderApi | null) => void;
  restoreAnchor?: BookmarkAnchor | null;
}

export function anchorToPercent(anchor: BookmarkAnchor): number {
  switch (anchor.kind) {
    case "scroll":
    case "cfi":
      return Math.max(0, Math.min(100, Math.round(anchor.percent)));
    case "page":
      return anchor.total > 0
        ? Math.max(0, Math.min(100, Math.round((anchor.page / anchor.total) * 100)))
        : 0;
    case "sheet":
      return anchor.total > 0
        ? Math.max(0, Math.min(100, Math.round(((anchor.sheet + 1) / anchor.total) * 100)))
        : 0;
  }
}

export function anchorDefaultLabel(anchor: BookmarkAnchor): string {
  switch (anchor.kind) {
    case "page":
      return `Page ${anchor.page}`;
    case "sheet":
      return `Sheet ${anchor.sheet + 1}`;
    case "cfi":
    case "scroll":
      return `${anchorToPercent(anchor)}%`;
  }
}

export function parseAnchor(raw: string): BookmarkAnchor | null {
  try {
    const obj = JSON.parse(raw) as BookmarkAnchor;
    if (obj && typeof obj === "object" && "kind" in obj) return obj;
    return null;
  } catch {
    return null;
  }
}
