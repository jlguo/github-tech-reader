import { BookOpen, BookMarked, Lightbulb, GraduationCap, FileText, Smile, Heart, Clock, Plus, Search } from "lucide-react";
import { BookCategory, categories } from "./bookData";

const iconMap: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  BookOpen, BookMarked, Lightbulb, GraduationCap, FileText, Smile,
};

interface SidebarProps {
  activeCategory: BookCategory;
  onCategoryChange: (cat: BookCategory) => void;
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export function Sidebar({ activeCategory, onCategoryChange, activeSection, onSectionChange }: SidebarProps) {
  return (
    <aside
      className="flex flex-col h-full"
      style={{ background: "var(--primary)", width: "220px", flexShrink: 0 }}
    >
      {/* Logo */}
      <div className="px-6 pt-8 pb-6">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "var(--accent)" }}
          >
            <BookOpen size={16} color="white" strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontFamily: "Playfair Display, serif", color: "var(--primary-foreground)", fontWeight: 700, fontSize: "1rem", lineHeight: 1.2 }}>
              云书架
            </div>
            <div style={{ fontFamily: "Inter, sans-serif", color: "rgba(245,240,232,0.5)", fontSize: "0.65rem", letterSpacing: "0.05em" }}>
              CLOUD SHELF
            </div>
          </div>
        </div>
      </div>

      {/* Search shortcut */}
      <div className="px-4 mb-4">
        <button
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
          style={{
            background: "rgba(245,240,232,0.08)",
            color: "rgba(245,240,232,0.6)",
            fontFamily: "Inter, sans-serif",
            border: "1px solid rgba(245,240,232,0.1)",
          }}
        >
          <Search size={13} />
          <span>搜索书籍...</span>
          <kbd
            className="ml-auto text-xs px-1 rounded"
            style={{ background: "rgba(245,240,232,0.1)", color: "rgba(245,240,232,0.4)", fontFamily: "Inter, sans-serif", fontSize: "0.65rem" }}
          >
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Sections */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(245,240,232,0.35)", fontFamily: "Inter, sans-serif" }}>
          我的书架
        </div>

        {[
          { id: "shelf", label: "书架", icon: BookOpen },
          { id: "recent", label: "最近阅读", icon: Clock },
          { id: "favorites", label: "收藏夹", icon: Heart },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onSectionChange(id)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left"
            style={{
              background: activeSection === id ? "rgba(193,127,58,0.25)" : "transparent",
              color: activeSection === id ? "var(--accent)" : "rgba(245,240,232,0.65)",
              fontFamily: "Inter, sans-serif",
              fontWeight: activeSection === id ? 500 : 400,
            }}
          >
            <Icon size={15} strokeWidth={activeSection === id ? 2.5 : 1.8} />
            {label}
            {activeSection === id && (
              <div className="ml-auto w-1 h-4 rounded-full" style={{ background: "var(--accent)" }} />
            )}
          </button>
        ))}

        <div className="mt-4 mb-2 px-3 text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(245,240,232,0.35)", fontFamily: "Inter, sans-serif" }}>
          分类
        </div>

        {categories.map(cat => {
          const Icon = iconMap[cat.icon];
          const isActive = activeSection === "shelf" && activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => { onSectionChange("shelf"); onCategoryChange(cat.id as BookCategory); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left"
              style={{
                background: isActive ? "rgba(193,127,58,0.25)" : "transparent",
                color: isActive ? "var(--accent)" : "rgba(245,240,232,0.65)",
                fontFamily: "Inter, sans-serif",
                fontWeight: isActive ? 500 : 400,
              }}
            >
              <Icon size={15} strokeWidth={isActive ? 2.5 : 1.8} />
              <span className="flex-1 truncate">{cat.label}</span>
              <span
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  background: isActive ? "rgba(193,127,58,0.3)" : "rgba(245,240,232,0.1)",
                  color: isActive ? "var(--accent)" : "rgba(245,240,232,0.4)",
                  fontFamily: "Inter, sans-serif",
                  fontSize: "0.65rem",
                }}
              >
                {cat.count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Add book */}
      <div className="p-4">
        <button
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{
            background: "var(--accent)",
            color: "white",
            fontFamily: "Inter, sans-serif",
          }}
        >
          <Plus size={15} />
          导入书籍
        </button>
      </div>

      {/* User */}
      <div className="px-4 pb-6">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: "rgba(245,240,232,0.06)" }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "var(--accent)", color: "white", fontFamily: "Inter, sans-serif" }}>
            李
          </div>
          <div>
            <div className="text-xs font-medium" style={{ color: "var(--primary-foreground)", fontFamily: "Inter, sans-serif" }}>李明</div>
            <div className="text-xs" style={{ color: "rgba(245,240,232,0.4)", fontFamily: "Inter, sans-serif" }}>共 {categories[0].count} 本书</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
