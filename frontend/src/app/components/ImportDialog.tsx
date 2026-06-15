import { useState, useEffect } from "react";
import { X, Github, Loader2, CheckCircle, AlertCircle, BookOpen, Sparkles } from "lucide-react";
import { API_BASE_URL } from "../../config/api";

type ImportStep = "input" | "loading" | "success" | "error";
interface ImportResult { repo_id: string; repo_name: string; readme_length: number; }

function parseRepo(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/github\.com\/([^/]+\/[^/\s#?]+)/);
  if (urlMatch) return urlMatch[1].replace(/\.git$/, "");
  const nameMatch = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (nameMatch) return `${nameMatch[1]}/${nameMatch[2]}`;
  return null;
}

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: (book: { id: string; title: string; author: string }) => void;
}

export function ImportDialog({ open, onClose, onImported }: ImportDialogProps) {
  const [input, setInput] = useState("");
  const [step, setStep] = useState<ImportStep>("input");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { reset(); onClose(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!open) return null;

  const fullName = parseRepo(input);

  const handleImport = async () => {
    if (!fullName) return;
    setStep("loading");
    setError("");

    try {
      const addResp = await fetch(`${API_BASE_URL}/repos/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName }),
      });

      if (!addResp.ok) {
        const err = await addResp.json();
        throw new Error(err.detail || `Failed to add repo (${addResp.status})`);
      }

      const repo = await addResp.json();

      let readmeLen = 0;
      try {
        const rResp = await fetch(`${API_BASE_URL}/repos/${repo.id}/fetch-readme`, { method: "POST" });
        if (rResp.ok) {
          const rData = await rResp.json();
          readmeLen = rData.length;
        }
      } catch {
        readmeLen = 0;
      }

      if (readmeLen > 0) {
        fetch(`${API_BASE_URL}/agents/generate-book/${repo.id}`, { method: "POST" }).catch(() => {});
      }

      setResult({ repo_id: repo.id, repo_name: repo.full_name, readme_length: readmeLen });
      setStep("success");
      onImported({ id: repo.id, title: repo.name, author: repo.owner });
    } catch (e: any) {
      setError(e.message || "未知错误");
      setStep("error");
    }
  };

  const reset = () => {
    setInput("");
    setStep("input");
    setError("");
    setResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      data-testid="import-dialog-overlay"
      onClick={handleClose}
    >
      <div className="absolute inset-0" style={{ background: "rgba(44,26,14,0.6)", backdropFilter: "blur(4px)" }} />

      <div
        className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden"
        style={{ background: "var(--card)" }}
        data-testid="import-dialog-content"
        onClick={e => e.stopPropagation()}
      >
        {step === "input" && (
          <>
            <div className="p-6 pb-0 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--accent)" }}>
                  <Github size={16} color="white" />
                </div>
                <h2
                  className="text-lg font-bold"
                  style={{ fontFamily: "Playfair Display, serif", color: "var(--foreground)" }}
                  data-testid="import-dialog-title"
                >
                  导入 GitHub 仓库
                </h2>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-full transition-colors"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                data-testid="import-dialog-close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                输入 GitHub 仓库地址或 <code style={{ background: "var(--muted)", padding: "2px 6px", borderRadius: "4px", fontSize: "0.85em" }}>owner/repo</code> 格式
              </p>

              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleImport()}
                placeholder="例如: facebook/react"
                className="w-full px-4 py-3 rounded-xl text-sm border outline-none transition-all focus:ring-2"
                data-testid="import-dialog-input"
                style={{
                  background: "var(--background)",
                  color: "var(--foreground)",
                  borderColor: "var(--border)",
                  fontFamily: "Inter, sans-serif",
                  "--tw-ring-color": "var(--accent)",
                } as React.CSSProperties}
                autoFocus
              />

              {input && !fullName && (
                <div className="flex items-center gap-1.5 text-xs" style={{ color: "#c0392b", fontFamily: "Inter, sans-serif" }} data-testid="import-dialog-error-format">
                  <AlertCircle size={13} />
                  格式不正确，请使用 owner/repo 格式
                </div>
              )}

              <button
                onClick={handleImport}
                disabled={!fullName}
                className="w-full py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                style={{
                  background: fullName ? "var(--accent)" : "var(--muted)",
                  color: fullName ? "white" : "var(--muted-foreground)",
                  fontFamily: "Inter, sans-serif",
                  cursor: fullName ? "pointer" : "not-allowed",
                }}
                data-testid="import-dialog-submit"
              >
                <Github size={15} />
                导入仓库
              </button>
            </div>
          </>
        )}

        {step === "loading" && (
          <div className="p-8 flex flex-col items-center gap-4" data-testid="import-dialog-loading">
            <Loader2 size={36} className="animate-spin" style={{ color: "var(--accent)" }} />
            <p className="text-sm" style={{ color: "var(--foreground)", fontFamily: "Inter, sans-serif" }} data-testid="import-dialog-loading-text">
              正在从 GitHub 获取仓库信息...
            </p>
            <p className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
              {fullName}
            </p>
          </div>
        )}

        {step === "success" && result && (
          <div className="p-6 space-y-4" data-testid="import-dialog-success">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#e2f5ec" }}>
                <CheckCircle size={28} style={{ color: "#2d7a4a" }} />
              </div>
              <h3
                className="text-base font-bold text-center"
                style={{ fontFamily: "Playfair Display, serif", color: "var(--foreground)" }}
              >
                导入成功
              </h3>
              <p className="text-sm text-center" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }} data-testid="import-dialog-success-repo">
                {result.repo_name}
              </p>
              <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                <BookOpen size={13} />
                README {result.readme_length > 0 ? `已获取 (${result.readme_length} 字符)` : "未找到"}
              </div>
            </div>

            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl text-sm font-medium transition-all"
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
                fontFamily: "Inter, sans-serif",
              }}
              data-testid="import-dialog-done"
            >
              完成
            </button>
          </div>
        )}

        {step === "error" && (
          <div className="p-6 space-y-4" data-testid="import-dialog-error">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#f7e8e8" }}>
                <AlertCircle size={28} style={{ color: "#c0392b" }} />
              </div>
              <h3
                className="text-base font-bold text-center"
                style={{ fontFamily: "Playfair Display, serif", color: "var(--foreground)" }}
              >
                导入失败
              </h3>
              <p className="text-sm text-center" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }} data-testid="import-dialog-error-message">
                {error}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { setStep("input"); setError(""); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  fontFamily: "Inter, sans-serif",
                }}
                data-testid="import-dialog-retry"
              >
                重试
              </button>
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: "var(--accent)",
                  color: "white",
                  fontFamily: "Inter, sans-serif",
                }}
                data-testid="import-dialog-error-close"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
