import { useState, useMemo, useEffect } from "react";
import { Search, LayoutGrid, List, SlidersHorizontal, X, Clock, TrendingUp, BookOpen } from "lucide-react";
import { books as initialBooks, categories, Book, BookCategory, typeConfig, BookType } from "./components/bookData";

const getTypeInfo = (type: BookType) => typeConfig[type] ?? { label: "FILE", color: "#5a5a5a", bg: "#f0f0f0" };
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

  const toColor = (s: string) => {
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${hash % 360}, 40%, ${30 + (hash % 20)}%)`;
  };

  useEffect(() => {
    const API = "http://localhost:8000/api";

    const syncBooks = () => {
      fetch(`${API}/books`)
        .then(r => r.json())
        .then((books: Array<{
          repo_id: string; title: string; author: string;
          description: string | null; language: string | null;
          html_url: string; status: string; chapter_count: number;
        }>) => {
          const generated: Book[] = books.map(b => ({
            id: b.repo_id,
            title: b.title,
            author: b.author,
            cover: `https://opengraph.githubassets.com/1/${b.author}/${b.title}`,
            coverColor: toColor(b.title),
            type: "html" as BookType,
            category: "generated" as BookCategory,
            progress: b.status === "done" ? 100 : 0,
            totalPages: b.chapter_count,
            currentPage: 0,
            addedDate: new Date().toISOString().split("T")[0],
            size: b.status === "done" ? `${b.chapter_count} 章` : "创作中...",
            description: b.description || "",
            tags: b.language ? [b.language] : [],
            isFavorite: false,
            genStatus: b.status as "writing" | "done" | "failed" | undefined,
          }));
          setBookList(prev => {
            const existing = new Set(prev.map(b => b.id));
            const newBooks = generated.filter(b => !existing.has(b.id));
            const updated = prev.map(pb => {
              const gen = generated.find(g => g.id === pb.id);
              return gen ? { ...pb, ...gen } : pb;
            });
            return [...newBooks, ...updated];
          });
        })
        .catch(() => {});
    };

    syncBooks();
    const interval = setInterval(syncBooks, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleBookImported = (info: { id: string; title: string; author: string }) => {
    const newBook: Book = {
      id: info.id,
      title: info.title,
      author: info.author,
      cover: `https://opengraph.githubassets.com/1/${info.author}/${info.title}`,
      coverColor: toColor(info.title),
      type: "html" as BookType,
      category: "generated" as BookCategory,
      progress: 0,
      totalPages: 0,
      currentPage: 0,
      addedDate: new Date().toISOString().split("T")[0],
      size: "0 章",
      description: "",
      tags: [],
      isFavorite: false,
    };
    setBookList(prev => {
      if (prev.find(b => b.id === info.id)) return prev;
      return [newBook, ...prev];
    });
    setActiveCategory("generated");
  };

  const toggleFavorite = (id: string) => {
    setBookList(prev => prev.map(b => b.id === id ? { ...b, isFavorite: !b.isFavorite } : b));
  };

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

  const sectionTitle = activeSection === "favorites" ? "收藏夹" : activeSection === "recent" ? "最近阅读" : categories.find(c => c.id === activeCategory)?.label || "全部";

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--background)", fontFamily: "Inter, sans-serif" }}>
      {/* PC Sidebar */}
      <div className="hidden lg:flex">
        <Sidebar
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onImport={() => setShowImportDialog(true)}
        />
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header
          className="flex-shrink-0 px-4 lg:px-8 py-4 flex items-center gap-3 border-b"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
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
              style={{
                background: "var(--muted)",
                color: "var(--foreground)",
                border: "1px solid transparent",
                fontFamily: "Inter, sans-serif",
              }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted-foreground)" }}>
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
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className="p-2 rounded-lg transition-colors"
              style={{ background: viewMode === "list" ? "var(--accent)" : "transparent", color: viewMode === "list" ? "white" : "var(--muted-foreground)" }}
            >
              <List size={16} />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowSortMenu(v => !v)}
                className="p-2 rounded-lg transition-colors"
                style={{ background: "transparent", color: "var(--muted-foreground)" }}
              >
                <SlidersHorizontal size={16} />
              </button>
              {showSortMenu && (
                <div
                  className="absolute right-0 top-10 z-20 rounded-xl overflow-hidden shadow-lg"
                  style={{ background: "var(--card)", border: "1px solid var(--border)", width: "140px" }}
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
              <div className="hidden lg:flex items-center gap-6 mb-6">
                {[
                  { icon: BookOpen, label: "全部书籍", value: stats.total, color: "var(--accent)" },
                  { icon: TrendingUp, label: "阅读中", value: stats.reading, color: "#5a8a6a" },
                  { icon: Clock, label: "已读完", value: stats.finished, color: "#6a7a8a" },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className="flex items-center gap-2.5">
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
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 style={{ fontFamily: "Playfair Display, serif", fontWeight: 700, color: "var(--foreground)", fontSize: "1.1rem" }}>
                    继续阅读
                  </h2>
                  <button
                    onClick={() => setActiveSection("recent")}
                    className="text-sm"
                    style={{ color: "var(--accent)", fontFamily: "Inter, sans-serif" }}
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
              <h2 style={{ fontFamily: "Playfair Display, serif", fontWeight: 700, color: "var(--foreground)", fontSize: "1.1rem" }}>
                {searchQuery ? `"${searchQuery}" 的搜索结果` : sectionTitle}
              </h2>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
                {filteredBooks.length} 本
              </span>
            </div>

            {/* Book grid / list */}
            {filteredBooks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20" style={{ color: "var(--muted-foreground)" }}>
                <BookOpen size={48} strokeWidth={1} style={{ opacity: 0.3, marginBottom: "16px" }} />
                <p style={{ fontFamily: "Playfair Display, serif", fontSize: "1.1rem", color: "var(--muted-foreground)" }}>
                  {searchQuery ? "没有找到相关书籍" : "这里还没有书籍"}
                </p>
                <p className="text-sm mt-1" style={{ fontFamily: "Inter, sans-serif", color: "var(--muted-foreground)", opacity: 0.7 }}>
                  {searchQuery ? "换个关键词试试？" : "导入你的第一本电子书"}
                </p>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                {filteredBooks.map(book => (
                  <BookCard key={book.id} book={book} viewMode="grid" onToggleFavorite={toggleFavorite} onOpen={setSelectedBook} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
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
        <MobileNav activeSection={activeSection} onSectionChange={setActiveSection} />
      </div>

      {/* Book detail modal */}
      {selectedBook && (
        <BookDetailModal
          book={selectedBook}
          onClose={() => setSelectedBook(null)}
          onToggleFavorite={id => { toggleFavorite(id); setSelectedBook(prev => prev && prev.id === id ? { ...prev, isFavorite: !prev.isFavorite } : prev); }}
          onRead={book => { setSelectedBook(null); setReadingBook(book); }}
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
