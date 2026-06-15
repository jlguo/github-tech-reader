import { BookOpen, Clock, Heart, Plus } from "lucide-react";

interface MobileNavProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  onImport?: () => void;
}

const navItems = [
  { id: "shelf", label: "书架", icon: BookOpen },
  { id: "recent", label: "最近", icon: Clock },
  { id: "favorites", label: "收藏", icon: Heart },
  { id: "add", label: "导入", icon: Plus },
];

export function MobileNav({ activeSection, onSectionChange, onImport }: MobileNavProps) {
  return (
    <nav
      data-testid="mobile-nav"
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around px-2 pb-safe"
      style={{
        background: "var(--primary)",
        borderTop: "1px solid rgba(245,240,232,0.1)",
        paddingTop: "8px",
        paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {navItems.map(({ id, label, icon: Icon }) => {
        const isActive = activeSection === id;
        return (
          <button
            key={id}
            data-testid={`mobile-nav-${id}`}
            onClick={() => id === "add" ? onImport?.() : onSectionChange(id)}
            className="flex flex-col items-center gap-1 min-w-0 px-3 py-1 rounded-xl transition-all"
            style={{
              color: isActive ? "var(--accent)" : "rgba(245,240,232,0.5)",
              fontFamily: "Inter, sans-serif",
            }}
          >
            <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
            <span style={{ fontSize: "0.65rem", fontWeight: isActive ? 600 : 400 }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
