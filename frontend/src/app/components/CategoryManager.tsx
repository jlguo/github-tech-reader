import { useState } from "react";
import {
  X,
  Pencil,
  Trash2,
  Check,
  Plus,
  Folder,
  Download,
  Youtube,
  Rocket,
  Code,
  Film,
  Music,
  Newspaper,
  Briefcase,
  Globe,
  Star,
  BookMarked,
  Lightbulb,
  GraduationCap,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import type { RemoteCategory } from "../../services/api";

const ICON_NAMES = [
  "Folder",
  "Download",
  "Youtube",
  "Rocket",
  "Code",
  "Film",
  "Music",
  "Newspaper",
  "Briefcase",
  "Globe",
  "Star",
  "BookMarked",
  "Lightbulb",
  "GraduationCap",
  "FileText",
] as const;

const iconMap: Record<string, LucideIcon> = {
  Folder,
  Download,
  Youtube,
  Rocket,
  Code,
  Film,
  Music,
  Newspaper,
  Briefcase,
  Globe,
  Star,
  BookMarked,
  Lightbulb,
  GraduationCap,
  FileText,
};

const COLOR_OPTIONS = [
  "#5c3d1e",
  "#c17f3a",
  "#7a9b76",
  "#b5654a",
  "#4a7a8c",
  "#8c6a4a",
];

const DEFAULT_COLOR = COLOR_OPTIONS[0];
const DEFAULT_ICON = "Folder";

function resolveIcon(name: string) {
  return iconMap[name] ?? Folder;
}

interface CategoryManagerProps {
  open: boolean;
  onClose: () => void;
  categories: RemoteCategory[];
  categoryCounts: Record<string, number>;
  onCreate: (data: {
    label: string;
    icon?: string;
    color?: string;
  }) => Promise<void>;
  onUpdate: (
    id: string,
    data: Partial<{
      label: string;
      icon: string;
      color: string;
      sort_order: number;
    }>,
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function ColorPicker({
  value,
  onChange,
  size = 44,
}: {
  value: string;
  onChange: (c: string) => void;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          background: value,
          border: "none",
          cursor: "pointer",
          display: "block",
        }}
      />
      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 9 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 6,
              zIndex: 10,
              background: "var(--card)",
              borderRadius: 10,
              boxShadow: "0 4px 16px rgba(44,26,14,0.15)",
              padding: 8,
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              width: 152,
            }}
          >
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: c,
                  border:
                    value === c
                      ? "2px solid var(--foreground)"
                      : "2px solid transparent",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Icon popover picker ── */
function IconPicker({
  value,
  onChange,
  color,
  size = 44,
}: {
  value: string;
  onChange: (n: string) => void;
  color: string;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const CurrentIcon = resolveIcon(value);
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          background: "var(--input-background)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <CurrentIcon size={Math.round(size * 0.43)} style={{ color }} />
      </button>
      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 9 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 6,
              zIndex: 10,
              background: "var(--card)",
              borderRadius: 10,
              boxShadow: "0 4px 16px rgba(44,26,14,0.15)",
              padding: 8,
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
              width: 192,
            }}
          >
            {ICON_NAMES.map((name) => {
              const I = resolveIcon(name);
              const selected = value === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                  title={name}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: selected
                      ? `1px solid ${color}`
                      : "1px solid transparent",
                    background: selected ? `${color}18` : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <I
                    size={16}
                    style={{
                      color: selected ? color : "var(--muted-foreground)",
                    }}
                  />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main component ── */
export function CategoryManager({
  open,
  onClose,
  categories,
  categoryCounts,
  onCreate,
  onUpdate,
  onDelete,
}: CategoryManagerProps) {
  const [newLabel, setNewLabel] = useState("");
  const [newIcon, setNewIcon] = useState(DEFAULT_ICON);
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editIcon, setEditIcon] = useState(DEFAULT_ICON);
  const [editColor, setEditColor] = useState(DEFAULT_COLOR);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);

  const resetNewForm = () => {
    setNewLabel("");
    setNewIcon(DEFAULT_ICON);
    setNewColor(DEFAULT_COLOR);
  };

  const handleCreate = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ label, icon: newIcon, color: newColor });
      resetNewForm();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (cat: RemoteCategory) => {
    setEditingId(cat.id);
    setEditLabel(cat.label);
    setEditIcon(cat.icon || DEFAULT_ICON);
    setEditColor(cat.color || DEFAULT_COLOR);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError(null);
  };

  const handleUpdate = async (id: string) => {
    const label = editLabel.trim();
    if (!label) return;
    setError(null);
    try {
      await onUpdate(id, { label, icon: editIcon, color: editColor });
      setEditingId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "更新失败");
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await onDelete(id);
      setDeletingId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "删除失败");
      setDeletingId(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-[600px] p-0 gap-0 overflow-hidden"
        data-testid="category-manager"
        style={{ background: "var(--card)", borderRadius: 14 }}
      >
        {/* hide the built-in close button — we use our own in the header */}
        <style>{`
          [data-slot="dialog-content"] > button:last-child { display: none; }
        `}</style>

        {/* hidden DialogTitle for Radix accessibility */}
        <DialogTitle style={{ display: "none" }}>管理分类</DialogTitle>

        {/* ── Header ── */}
        <div
          style={{
            padding: "24px 28px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <h2
              style={{
                fontFamily: '"Playfair Display", serif',
                fontSize: 24,
                fontWeight: 700,
                color: "var(--foreground)",
                margin: 0,
              }}
            >
              管理分类
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--muted-foreground)",
                margin: 0,
              }}
            >
              创建、重命名或删除书架分类
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: "var(--muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <X size={18} style={{ color: "var(--muted-foreground)" }} />
          </button>
        </div>

        {/* ── Divider ── */}
        <div
          style={{ height: 1, background: "var(--border)", width: "100%" }}
        />

        {/* ── Category List ── */}
        <div
          style={{
            padding: "16px 20px",
            background: "var(--background)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxHeight: 360,
            overflowY: "auto",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--muted-foreground)",
              letterSpacing: 0.6,
              textTransform: "uppercase",
              fontFamily: "Inter, sans-serif",
            }}
          >
            所有分类
          </span>

          {sorted.map((cat) => {
            const isEditing = editingId === cat.id;
            const count = categoryCounts[cat.key] ?? 0;
            const IconComp = resolveIcon(cat.icon || "Folder");

            return (
              <div
                key={cat.key}
                data-testid={`category-row-${cat.key}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  background: "var(--card)",
                  borderRadius: 10,
                }}
              >
                {isEditing ? (
                  /* ── EDIT MODE ── */
                  <>
                    <ColorPicker
                      value={editColor}
                      onChange={setEditColor}
                      size={38}
                    />
                    <IconPicker
                      value={editIcon}
                      onChange={setEditIcon}
                      color={editColor}
                      size={38}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        data-testid={`category-edit-input-${cat.key}`}
                        className="h-9"
                        style={{ fontSize: 14 }}
                        placeholder="分类名称"
                      />
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => handleUpdate(cat.id)}
                        data-testid={`category-edit-save-${cat.key}`}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: "var(--primary)",
                          color: "white",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        <Check size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: "var(--muted)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        <X
                          size={15}
                          style={{ color: "var(--muted-foreground)" }}
                        />
                      </button>
                    </div>
                  </>
                ) : (
                  /* ── DISPLAY MODE ── */
                  <>
                    {/* color swatch with icon */}
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 9,
                        background: cat.color || DEFAULT_COLOR,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <IconComp
                        size={19}
                        strokeWidth={2}
                        style={{ color: "var(--card)" }}
                      />
                    </div>

                    {/* label + book count */}
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 500,
                          color: "var(--foreground)",
                          fontFamily: "Inter, sans-serif",
                        }}
                      >
                        {cat.label}
                      </span>
                      <span
                        style={{ fontSize: 12, color: "var(--muted-foreground)" }}
                      >
                        {count} 本书
                      </span>
                    </div>

                    {/* system badge */}
                    {cat.is_system && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: "var(--muted-foreground)",
                          background: "var(--secondary)",
                          borderRadius: 20,
                          padding: "4px 9px",
                          flexShrink: 0,
                        }}
                      >
                        系统
                      </span>
                    )}

                    {/* action buttons */}
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => startEdit(cat)}
                        data-testid={`category-edit-${cat.key}`}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: "var(--muted)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        <Pencil
                          size={15}
                          style={{ color: "var(--muted-foreground)" }}
                        />
                      </button>

                      {!cat.is_system &&
                        (deletingId === cat.id ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                color: "var(--destructive)",
                              }}
                            >
                              确认？
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDelete(cat.id)}
                              style={{
                                padding: "0 6px",
                                height: 28,
                                borderRadius: 6,
                                background: "var(--destructive)",
                                color: "white",
                                border: "none",
                                cursor: "pointer",
                                fontSize: 11,
                              }}
                            >
                              是
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingId(null)}
                              style={{
                                padding: "0 6px",
                                height: 28,
                                borderRadius: 6,
                                background: "var(--muted)",
                                color: "var(--muted-foreground)",
                                border: "none",
                                cursor: "pointer",
                                fontSize: 11,
                              }}
                            >
                              否
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeletingId(cat.id)}
                            data-testid={`category-delete-${cat.key}`}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              background: "var(--destructive) 18",
                              backgroundColor: "rgba(192,57,43,0.10)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: "none",
                              cursor: "pointer",
                            }}
                          >
                            <Trash2
                              size={15}
                              style={{ color: "var(--destructive)" }}
                            />
                          </button>
                        ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Error display ── */}
        {error && (
          <div
            data-testid="category-error"
            style={{
              padding: "8px 20px",
              fontSize: 12,
              color: "var(--destructive)",
              backgroundColor: "#fdf0ef",
            }}
          >
            {error}
          </div>
        )}

        {/* ── Footer Divider ── */}
        <div
          style={{ height: 1, background: "var(--border)", width: "100%" }}
        />

        {/* ── New Category Form ── */}
        <div
          style={{
            padding: "18px 20px",
            background: "var(--card)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--foreground)",
              fontFamily: "Inter, sans-serif",
            }}
          >
            新建分类
          </span>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <ColorPicker value={newColor} onChange={setNewColor} />

            <IconPicker
              value={newIcon}
              onChange={setNewIcon}
              color={newColor}
            />

            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="输入分类名称..."
              data-testid="category-new-name"
              className="flex-1 h-11"
              style={{
                borderRadius: 10,
                fontSize: 14,
                borderColor: "var(--border)",
                background: "var(--input-background)",
              }}
            />

            <Button
              type="button"
              onClick={handleCreate}
              disabled={!newLabel.trim() || submitting}
              data-testid="category-add-btn"
              variant="default"
              className="h-11"
              style={{
                borderRadius: 10,
                padding: "0 20px",
                fontSize: 14,
                fontWeight: 500,
                gap: 7,
                flexShrink: 0,
              }}
            >
              {submitting ? (
                "..."
              ) : (
                <>
                  <Plus size={16} />
                  添加
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
