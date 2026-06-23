import { BookOpen, BookMarked, Lightbulb, GraduationCap, FileText, Smile, Heart, Clock, Plus, Download, Folder, Youtube, Rocket, Code, Settings, Film, Music, Newspaper, Briefcase, Globe, Star } from "lucide-react";
import { BookCategory } from "./bookData";
import type { RemoteCategory } from "../../services/api";

const iconMap: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  BookOpen, BookMarked, Lightbulb, GraduationCap, FileText, Smile,
  Download, Folder, Youtube, Rocket, Code, Film, Music, Newspaper, Briefcase, Globe, Star,
};

const resolveIcon = (name: string) => iconMap[name] ?? Folder;

interface SidebarProps {
  activeCategory: BookCategory;
  onCategoryChange: (cat: BookCategory) => void;
  activeSection: string;
  onSectionChange: (section: string) => void;
  onImport?: () => void;
  categoryCounts: Record<string, number>;
  categories: RemoteCategory[];
  onManageCategories?: () => void;
}

export function Sidebar({ activeCategory, onCategoryChange, activeSection, onSectionChange, onImport, categoryCounts, categories, onManageCategories }: SidebarProps) {
  const allCategories = [{ key: "all", label: "全部", icon: "BookOpen" }, ...categories];
  return (
    <aside
      data-testid="sidebar"
      className="flex flex-col h-full"
      style={{ background: "var(--primary)", width: "220px", flexShrink: 0 }}
    >
      {/* Logo */}
      <div data-testid="sidebar-logo" className="px-6 pt-8 pb-6">
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
            data-testid={`sidebar-nav-${id}`}
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

        <div className="mt-4 mb-2 px-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(245,240,232,0.35)", fontFamily: "Inter, sans-serif" }}>
            分类
          </span>
          <button
            data-testid="sidebar-manage-categories"
            onClick={onManageCategories}
            className="flex items-center justify-center w-5 h-5 rounded transition-colors"
            style={{ color: "rgba(245,240,232,0.45)" }}
            title="管理分类"
          >
            <Settings size={13} strokeWidth={2} />
          </button>
        </div>

        {allCategories.map(cat => {
          const Icon = resolveIcon(cat.icon);
          const isActive = activeSection === "shelf" && activeCategory === cat.key;
          const count = categoryCounts[cat.key] ?? 0;
          return (
            <button
              key={cat.key}
              data-testid={`sidebar-category-${cat.key}`}
              onClick={() => { onSectionChange("shelf"); onCategoryChange(cat.key as BookCategory); }}
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
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Add book */}
      <div className="p-4">
        <button
          data-testid="sidebar-import"
          onClick={onImport}
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
      <div data-testid="sidebar-user" className="px-4 pb-6">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: "rgba(245,240,232,0.06)" }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "var(--accent)", color: "white", fontFamily: "Inter, sans-serif" }}>
            李
          </div>
          <div>
            <div className="text-xs font-medium" style={{ color: "var(--primary-foreground)", fontFamily: "Inter, sans-serif" }}>李明</div>
             <div className="text-xs" style={{ color: "rgba(245,240,232,0.4)", fontFamily: "Inter, sans-serif" }}>共 {(categoryCounts["all"] ?? 0)} 本书</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
