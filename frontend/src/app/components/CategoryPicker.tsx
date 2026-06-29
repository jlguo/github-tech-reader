import { BookOpen, BookMarked, Lightbulb, GraduationCap, FileText, Smile, Folder, Youtube, Rocket, Code, Film, Music, Newspaper, Briefcase, Globe, Star, Download, Check, Settings2, type LucideIcon } from "lucide-react";
import type { BookCategory } from "./bookData";
import type { RemoteCategory } from "../../services/api";
import { useEffect } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "./ui/drawer";

const iconMap = {
  BookOpen, BookMarked, Lightbulb, GraduationCap, FileText, Smile,
  Download, Folder, Youtube, Rocket, Code, Film, Music, Newspaper, Briefcase, Globe, Star,
} satisfies Record<string, LucideIcon>;

const resolveIcon = (name: string): LucideIcon => (iconMap as Record<string, LucideIcon>)[name] ?? Folder;

interface CategoryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCategory: BookCategory;
  onCategoryChange: (cat: BookCategory) => void;
  categories: RemoteCategory[];
  categoryCounts: Record<string, number>;
  onManageCategories: () => void;
}

export function CategoryPicker({
  open,
  onOpenChange,
  activeCategory,
  onCategoryChange,
  categories,
  categoryCounts,
  onManageCategories,
}: CategoryPickerProps) {
  useEffect(() => {
    if (open) {
      (document.activeElement as HTMLElement | null)?.blur();
    }
  }, [open]);

  const allCategories = [{ key: "all", label: "全部", icon: "BookOpen" }, ...categories];

  const handleSelect = (key: string) => {
    onCategoryChange(key as BookCategory);
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
        data-testid="category-picker"
      >
        <DrawerHeader className="px-5 pt-1 pb-2">
          <DrawerTitle
            style={{
              fontFamily: "Playfair Display, serif",
              fontWeight: 700,
              color: "var(--foreground)",
              fontSize: "1.05rem",
              textAlign: "left",
            }}
          >
            选择分类
          </DrawerTitle>
          <DrawerDescription style={{ display: "none" }}>选择要查看的书架分类</DrawerDescription>
        </DrawerHeader>

        {/* Category rows */}
        <div
          className="flex flex-col gap-1 px-3 overflow-y-auto"
          style={{ maxHeight: "50vh", paddingBottom: 4, scrollbarWidth: "none" }}
        >
          {allCategories.map((cat) => {
            const Icon = resolveIcon(cat.icon);
            const isActive = activeCategory === cat.key;
            const count = categoryCounts[cat.key] ?? 0;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => handleSelect(cat.key)}
                data-testid={`category-picker-row-${cat.key}`}
                className="flex items-center gap-3 w-full rounded-xl transition-colors"
                style={{
                  minHeight: 48,
                  padding: "10px 14px",
                  background: isActive ? "var(--accent)" : "transparent",
                  color: isActive ? "white" : "var(--foreground)",
                  fontFamily: "Inter, sans-serif",
                }}
              >
                <Icon size={18} strokeWidth={2} />
                <span className="flex-1 text-left text-sm font-medium">{cat.label}</span>
                <span
                  className="text-xs"
                  style={{ color: isActive ? "rgba(255,255,255,0.8)" : "var(--muted-foreground)" }}
                >
                  {count}
                </span>
                {isActive && <Check size={16} data-testid={`category-picker-check-${cat.key}`} />}
              </button>
            );
          })}
        </div>

        {/* Manage categories bridge */}
        <div className="px-3 pt-2 pb-3" style={{ borderTop: "1px solid var(--border)", marginTop: 8 }}>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onManageCategories();
            }}
            data-testid="category-picker-manage"
            className="flex items-center justify-center gap-2 w-full rounded-xl transition-colors"
            style={{
              minHeight: 48,
              background: "var(--muted)",
              color: "var(--foreground)",
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
              fontSize: "0.875rem",
            }}
          >
            <Settings2 size={16} />
            管理分类
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
