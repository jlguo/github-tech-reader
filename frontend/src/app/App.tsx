import { useState, useMemo, useEffect } from "react";
import { Search, LayoutGrid, List, SlidersHorizontal, X, Clock, TrendingUp, BookOpen } from "lucide-react";
import { books as initialBooks, categories, Book, BookCategory, typeConfig, BookType } from "./components/bookData";
import { API_BASE_URL, POLL_INTERVAL_MS } from "../config/api";
import { getDataService, type IDataService, type RemoteBook } from "../services/api";

const getTypeInfo = (type: BookType) => typeConfig[type] ?? { label: "FILE", color: "#5a5a5a", bg: "#f0f0f0" };

const FILE_TYPE_TO_BOOK_TYPE: Record<string, BookType> = {
  doc: "word", docx: "word", word: "word",
  xls: "excel", xlsx: "excel", excel: "excel",
  pptx: "ppt", ppt: "ppt",
  htm: "html", html: "html",
  epub: "epub", pdf: "pdf", txt: "txt",
};

const toBookType = (fileType: string | null | undefined): BookType =>
  FILE_TYPE_TO_BOOK_TYPE[(fileType || "html").toLowerCase()] ?? "html";
import { BookCard } from "./components/BookCard";
import { BookCover } from "./components/BookCover";
import { Sidebar } from "./components/Sidebar";
import { MobileNav } from "./components/MobileNav";
import { BookDetailModal } from "./components/BookDetailModal";
import { ReaderModal } from "./components/readers/ReaderModal";
import { ImportDialog } from "./components/ImportDialog";

export default function App() {
  const [bookList, setBookList] = useState(initialBooks);
  const [activeCategory, setActiveCategory] = useState<BookCategory>("all");
  const [activeSection, setActiveSection] = useState("shelf");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [readingBook, setReadingBook] = useState<Book | null>(null);
  const [sortBy, setSortBy] = useState<"recent" | "title" | "progress">("recent");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [service, setService] = useState<IDataService | null>(null);

  useEffect(() => {
    getDataService().then(setService);
  }, []);

  const toColor = (s: string) => {
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${hash % 360}, 40%, ${30 + (hash % 20)}%)`;
  };

  const coverImageUrl = (cu: string | null | undefined): string => {
    if (!cu) return "";
    try {
      const origin = new URL(API_BASE_URL).origin;
      return `${origin}${cu}`;
    } catch {
      return cu;
    }
  };

  useEffect(() => {
    let cancelled = false;

        const syncBooks = () => {
      getDataService().then(svc => {
        if (cancelled) return;
        svc.getBooks()
          .then((books: RemoteBook[]) => {
            if (cancelled) return;
          const generated: Book[] = books.map(b => {
            const isRepoBook = b.source_type === "github" || b.source_type === "youtube";
            const bookId = b.repo_id || b.book_id;
            const bookType = toBookType(b.file_type);
            const category = isRepoBook ? "generated" as BookCategory : "documents" as BookCategory;
            const coverUrl = coverImageUrl(b.cover_url);
            const cover = coverUrl || (b.cover_html
              ? ""
              : b.source_type === "github"
              ? `https://opengraph.githubassets.com/1/${b.author}/${b.title}`
              : b.source_type === "youtube"
              ? ""
              : `https://placehold.co/200x280/${toColor(b.title).replace(/[^a-f0-9]/gi, "").slice(0, 6)}/fff?text=${encodeURIComponent(b.title.slice(0, 4))}`);
            const size = isRepoBook
              ? (b.status === "done" ? `${b.chapter_count} 章` : b.status === "failed" ? "生成失败" : b.status === "no_book" ? "未生成" : "创作中...")
              : (b.file_type || "html").toUpperCase();

            let meta: Record<string, unknown> = {};
            try { meta = b.progress_metadata ? JSON.parse(b.progress_metadata) : {}; } catch {}
            const metaTotal = (meta.totalPages as number) || 0;
            const metaPage = (meta.page as number) || 0;

            return {
              id: bookId,
              title: b.title,
              author: b.author,
              cover,
              coverColor: toColor(b.title),
              type: bookType,
              category,
              progress: b.progress ?? 0,
              totalPages: metaTotal || b.chapter_count,
              currentPage: metaPage,
              addedDate: new Date().toISOString().split("T")[0],
              lastRead: b.last_read_at ? b.last_read_at.split("T")[0] : undefined,
              size,
              description: b.description || "",
              tags: b.language ? [b.language] : [],
              isFavorite: false,
              genStatus: b.status as "pending" | "fetching" | "planning" | "cover" | "writing" | "reviewing" | "publishing" | "done" | "failed" | "no_book" | undefined,
              sourceType: b.source_type as "github" | "file" | "url" | "youtube",
              coverHtml: b.cover_html ?? undefined,
            };
          });
          setBookList(prev => {
            const existing = new Set(prev.map(b => b.id));
            const newBooks = generated.filter(b => !existing.has(b.id));
            const updated = prev.map(pb => {
              const gen = generated.find(g => g.id === pb.id);
              if (!gen) return pb;
              return {
                ...gen,
                progress: gen.progress,
                totalPages: gen.totalPages || pb.totalPages,
                currentPage: gen.currentPage || pb.currentPage,
                isFavorite: pb.isFavorite,
              };
            });
            return [...newBooks, ...updated];
          });
        })
        .catch(() => {});
      });
    };

    syncBooks();
    const interval = setInterval(syncBooks, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleBookImported = (info: { id: string; title: string; author: string; sourceType: string; fileType: string; totalPages?: number }) => {
    const isRepoBook = info.sourceType === "github" || info.sourceType === "youtube";
    const bookType = toBookType(info.fileType);
    const category = isRepoBook ? "generated" as BookCategory : "documents" as BookCategory;
    const cover = isRepoBook
      ? `https://opengraph.githubassets.com/1/${info.author}/${info.title}`
      : `https://placehold.co/200x280/${toColor(info.title).replace(/[^a-f0-9]/gi, "").slice(0, 6)}/fff?text=${encodeURIComponent(info.title.slice(0, 4))}`;

    const newBook: Book = {
      id: info.id,
      title: info.title,
      author: info.author,
      cover,
      coverColor: toColor(info.title),
      type: bookType,
      category,
      progress: 0,
      totalPages: info.totalPages ?? 0,
      currentPage: 0,
      addedDate: new Date().toISOString().split("T")[0],
      size: isRepoBook ? "0 章" : (info.fileType || "html").toUpperCase(),
      description: "",
      tags: [],
      isFavorite: false,
      genStatus: isRepoBook ? "pending" : "no_book",
      sourceType: info.sourceType as "github" | "file" | "url" | "youtube",
    };
    setBookList(prev => {
      if (prev.find(b => b.id === info.id)) return prev;
      return [newBook, ...prev];
    });
    if (isRepoBook) setActiveCategory("generated");
  };

  const toggleFavorite = (id: string) => {
    setBookList(prev => prev.map(b => b.id === id ? { ...b, isFavorite: !b.isFavorite } : b));
  };

  const handleDeleteBook = async (bookId: string) => {
    if (!service) return;
    try {
      await service.deleteBook(bookId);
    } catch {}
    setBookList(prev => prev.filter(b => b.id !== bookId));
    setSelectedBook(null);
  };

  const handleUpdateBook = async (bookId: string, data: Record<string, any>) => {
    if (!service) return;
    try {
      await service.updateBook(bookId, data);
    } catch {}
  };

  const handleGenerateBook = async (bookId: string) => {
    if (!service) return;
    const book = bookList.find(b => b.id === bookId);
    setBookList(prev => prev.map(b => b.id === bookId ? { ...b, genStatus: "writing", size: "创作中...", progress: 0 } : b));
    setSelectedBook(prev => prev && prev.id === bookId ? { ...prev, genStatus: "writing", size: "创作中...", progress: 0 } : prev);

    try {
      if (book?.sourceType === "youtube") {
        await service.generateYoutubeBook({ repo_id: bookId });
      } else {
        await service.fetchReadme(bookId);
        await service.generateBook(bookId);
      }
    } catch (e: any) {
      const errorMsg = e.message || "生成失败";
      setBookList(prev => prev.map(b => b.id === bookId ? {
        ...b,
        genStatus: "failed",
        size: errorMsg,
        progress: 0,
      } : b));
      setSelectedBook(prev => prev && prev.id === bookId ? {
        ...prev,
        genStatus: "failed",
        size: errorMsg,
        progress: 0,
      } : prev);
    }
  };

  useEffect(() => {
    if (!selectedBook) return;
    const latest = bookList.find(b => b.id === selectedBook.id);
    if (latest && (latest.genStatus !== selectedBook.genStatus || latest.size !== selectedBook.size || latest.progress !== selectedBook.progress)) {
      setSelectedBook({ ...latest });
    }
  }, [bookList, selectedBook?.id]);

  const filteredBooks = useMemo(() => {
    let result = bookList;

    if (activeSection === "favorites") result = result.filter(b => b.isFavorite);
    else if (activeSection === "recent") result = result.filter(b => b.lastRead).sort((a, b) => (b.lastRead || "") > (a.lastRead || "") ? 1 : -1);
    else if (activeSection === "shelf") {
      if (activeCategory !== "all") result = result.filter(b => b.category === activeCategory);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.tags.some(t => t.toLowerCase().includes(q)));
    }

    if (sortBy === "title") result = [...result].sort((a, b) => a.title.localeCompare(b.title, "zh"));
    else if (sortBy === "progress") result = [...result].sort((a, b) => b.progress - a.progress);

    return result;
  }, [bookList, activeCategory, activeSection, searchQuery, sortBy]);

  const recentBooks = useMemo(() => bookList.filter(b => b.lastRead).sort((a, b) => (b.lastRead || "") > (a.lastRead || "") ? 1 : -1).slice(0, 4), [bookList]);

  const stats = useMemo(() => ({
    total: bookList.length,
    finished: bookList.filter(b => b.progress === 100).length,
    reading: bookList.filter(b => b.progress > 0 && b.progress < 100).length,
  }), [bookList]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of categories) {
      if (cat.id === "all") {
        counts[cat.id] = bookList.length;
      } else {
        counts[cat.id] = bookList.filter(b => b.category === cat.id).length;
      }
    }
    return counts;
  }, [bookList]);

  const sectionTitle = activeSection === "favorites" ? "收藏夹" : activeSection === "recent" ? "最近阅读" : categories.find(c => c.id === activeCategory)?.label || "全部";

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--background)", fontFamily: "Inter, sans-serif" }}>
      {/* PC Sidebar */}
      <div className="hidden lg:flex" data-testid="pc-sidebar">
        <Sidebar
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onImport={() => setShowImportDialog(true)}
          categoryCounts={categoryCounts}
        />
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden" data-testid="main-content">
        {/* Top bar */}
        <header
          className="flex-shrink-0 px-4 lg:px-8 py-4 flex items-center gap-3 border-b"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
          data-testid="header-bar"
        >
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mr-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--primary)" }}>
              <BookOpen size={14} color="var(--accent)" />
            </div>
            <span style={{ fontFamily: "Playfair Display, serif", fontWeight: 700, color: "var(--foreground)", fontSize: "1rem" }}>云书架</span>
          </div>

          {/* Search */}
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted-foreground)" }} />
            <input
              type="text"
              placeholder="搜索书名、作者、标签..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg text-sm outline-none transition-all"
              data-testid="search-input"
              style={{
                background: "var(--muted)",
                color: "var(--foreground)",
                border: "1px solid transparent",
                fontFamily: "Inter, sans-serif",
              }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted-foreground)" }} data-testid="search-clear">
                <X size={14} />
              </button>
            )}
          </div>

          {/* View controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setViewMode("grid")}
              className="p-2 rounded-lg transition-colors"
              style={{ background: viewMode === "grid" ? "var(--accent)" : "transparent", color: viewMode === "grid" ? "white" : "var(--muted-foreground)" }}
              data-testid="view-mode-grid"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className="p-2 rounded-lg transition-colors"
              style={{ background: viewMode === "list" ? "var(--accent)" : "transparent", color: viewMode === "list" ? "white" : "var(--muted-foreground)" }}
              data-testid="view-mode-list"
            >
              <List size={16} />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowSortMenu(v => !v)}
                className="p-2 rounded-lg transition-colors"
                style={{ background: "transparent", color: "var(--muted-foreground)" }}
                data-testid="sort-toggle"
              >
                <SlidersHorizontal size={16} />
              </button>
              {showSortMenu && (
                <div
                  className="absolute right-0 top-10 z-20 rounded-xl overflow-hidden shadow-lg"
                  style={{ background: "var(--card)", border: "1px solid var(--border)", width: "140px" }}
                  data-testid="sort-menu"
                >
                  {[{ id: "recent", label: "最近阅读" }, { id: "title", label: "书名排序" }, { id: "progress", label: "阅读进度" }].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => { setSortBy(opt.id as any); setShowSortMenu(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                      style={{
                        background: sortBy === opt.id ? "var(--accent)" : "transparent",
                        color: sortBy === opt.id ? "white" : "var(--foreground)",
                        fontFamily: "Inter, sans-serif",
                      }}
                      data-testid={`sort-option-${opt.id}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }} onClick={() => setShowSortMenu(false)}>
          <div className="px-4 lg:px-8 py-6 pb-24 lg:pb-8">

            {/* Stats bar — PC only, shelf section */}
            {activeSection === "shelf" && (
              <div className="hidden lg:flex items-center gap-6 mb-6" data-testid="stats-bar">
                {[
                  { icon: BookOpen, label: "全部书籍", value: stats.total, color: "var(--accent)", testId: "stat-total" },
                  { icon: TrendingUp, label: "阅读中", value: stats.reading, color: "#5a8a6a", testId: "stat-reading" },
                  { icon: Clock, label: "已读完", value: stats.finished, color: "#6a7a8a", testId: "stat-finished" },
                ].map(({ icon: Icon, label, value, color, testId }) => (
                  <div key={label} className="flex items-center gap-2.5" data-testid={testId}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: color + "20" }}>
                      <Icon size={14} style={{ color }} />
                    </div>
                    <div>
                      <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", color: "var(--muted-foreground)" }}>{label}</div>
                      <div style={{ fontFamily: "Playfair Display, serif", fontWeight: 700, color: "var(--foreground)", fontSize: "1.1rem", lineHeight: 1 }}>{value}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recently reading strip — shown when on shelf/all, not searching */}
            {activeSection === "shelf" && activeCategory === "all" && !searchQuery && recentBooks.length > 0 && (
              <div className="mb-8" data-testid="recent-reading-section">
                <div className="flex items-center justify-between mb-4">
                  <h2 style={{ fontFamily: "Playfair Display, serif", fontWeight: 700, color: "var(--foreground)", fontSize: "1.1rem" }}>
                    继续阅读
                  </h2>
                  <button
                    onClick={() => setActiveSection("recent")}
                    className="text-sm"
                    style={{ color: "var(--accent)", fontFamily: "Inter, sans-serif" }}
                    data-testid="recent-view-all"
                  >
                    查看全部
                  </button>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
                  {recentBooks.map(book => (
                    <div
                      key={book.id}
                      className="flex-shrink-0 flex gap-3 p-3 rounded-xl cursor-pointer transition-all hover:-translate-y-0.5"
                      style={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        width: "260px",
                        boxShadow: "0 2px 8px rgba(92,61,30,0.07)",
                      }}
                      onClick={() => setSelectedBook(book)}
                      data-testid={`recent-book-${book.id}`}
                    >
                      <BookCover book={book} size="sm" />
                      <div className="flex-1 min-w-0 py-0.5">
                        <h3
                          className="truncate leading-tight mb-0.5"
                          style={{ fontFamily: "Playfair Display, serif", color: "var(--foreground)", fontWeight: 600, fontSize: "0.875rem" }}
                        >
                          {book.title}
                        </h3>
                        <p className="text-xs truncate mb-2" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                          {book.author}
                        </p>
                        <div className="h-1 rounded-full overflow-hidden mb-1" style={{ background: "var(--muted)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${book.progress}%`, background: "var(--accent)" }}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                            {book.progress}%
                          </span>
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                              background: getTypeInfo(book.type).bg,
                              color: getTypeInfo(book.type).color,
                              fontFamily: "Inter, sans-serif",
                            }}
                          >
                            {getTypeInfo(book.type).label}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section title + count */}
            <div className="flex items-baseline gap-3 mb-4">
              <h2 style={{ fontFamily: "Playfair Display, serif", fontWeight: 700, color: "var(--foreground)", fontSize: "1.1rem" }} data-testid="section-title">
                {searchQuery ? `"${searchQuery}" 的搜索结果` : sectionTitle}
              </h2>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.8rem", color: "var(--muted-foreground)" }} data-testid="book-count">
                {filteredBooks.length} 本
              </span>
            </div>

            {/* Book grid / list */}
            {filteredBooks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20" style={{ color: "var(--muted-foreground)" }} data-testid="empty-state">
                <BookOpen size={48} strokeWidth={1} style={{ opacity: 0.3, marginBottom: "16px" }} />
                <p style={{ fontFamily: "Playfair Display, serif", fontSize: "1.1rem", color: "var(--muted-foreground)" }}>
                  {searchQuery ? "没有找到相关书籍" : "这里还没有书籍"}
                </p>
                <p className="text-sm mt-1" style={{ fontFamily: "Inter, sans-serif", color: "var(--muted-foreground)", opacity: 0.7 }}>
                  {searchQuery ? "换个关键词试试？" : "导入你的第一本电子书"}
                </p>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }} data-testid="book-grid">
                {filteredBooks.map(book => (
                  <BookCard key={book.id} book={book} viewMode="grid" onToggleFavorite={toggleFavorite} onOpen={setSelectedBook} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2" data-testid="book-list">
                {filteredBooks.map(book => (
                  <BookCard key={book.id} book={book} viewMode="list" onToggleFavorite={toggleFavorite} onOpen={setSelectedBook} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile bottom nav */}
      <div className="lg:hidden">
        <MobileNav activeSection={activeSection} onSectionChange={setActiveSection} onImport={() => setShowImportDialog(true)} />
      </div>

      {/* Book detail modal */}
      {selectedBook && (
        <BookDetailModal
          book={selectedBook}
          onClose={() => setSelectedBook(null)}
          onToggleFavorite={id => { toggleFavorite(id); setSelectedBook(prev => prev && prev.id === id ? { ...prev, isFavorite: !prev.isFavorite } : prev); }}
          onRead={book => { setSelectedBook(null); setReadingBook(book); }}
          onDelete={handleDeleteBook}
          onUpdate={handleUpdateBook}
          onGenerate={handleGenerateBook}
        />
      )}

      {/* Reader */}
      {readingBook && (
        <ReaderModal
          book={readingBook}
          onClose={() => setReadingBook(null)}
        />
      )}

      {/* Import dialog */}
      <ImportDialog
        open={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImported={handleBookImported}
      />
    </div>
  );
}
