import { useState, useEffect, useRef, DragEvent } from "react";
import { X, Github, Loader2, CheckCircle, AlertCircle, BookOpen, Sparkles, Upload, Link, FileText } from "lucide-react";
import { getDataService, type IDataService } from "../../services/api";

type ImportTab = "github" | "file" | "url";
type ImportStep = "input" | "loading" | "success" | "error";

interface ImportResult {
  id: string;
  title: string;
  author: string;
  source_type: string;
  file_type?: string;
  readme_length?: number;
}

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
  onImported: (book: { id: string; title: string; author: string; sourceType: string; fileType: string; totalPages?: number }) => void;
}

const TABS: { key: ImportTab; label: string; icon: typeof Github }[] = [
  { key: "github", label: "GitHub", icon: Github },
  { key: "file", label: "上传文件", icon: Upload },
  { key: "url", label: "网页链接", icon: Link },
];

export function ImportDialog({ open, onClose, onImported }: ImportDialogProps) {
  const [tab, setTab] = useState<ImportTab>("github");
  const [input, setInput] = useState("");
  const [step, setStep] = useState<ImportStep>("input");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [service, setService] = useState<IDataService | null>(null);

  useEffect(() => {
    getDataService().then(setService);
  }, []);

  const reset = () => {
    setInput("");
    setStep("input");
    setError("");
    setResult(null);
    setSelectedFile(null);
    setDragOver(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { reset(); onClose(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!open) return null;

  const fullName = parseRepo(input);

  const handleGithubImport = async () => {
    if (!fullName || !service) return;
    setStep("loading");
    setError("");

    try {
      const repo = await service.addRepo(fullName);

      let readmeLen = 0;
      try {
        await service.fetchReadme(repo.id);
        readmeLen = 1;
      } catch { readmeLen = 0; }

      if (readmeLen > 0) {
        service.generateBook(repo.id).catch(() => {});
      }

      setResult({ id: repo.id, title: repo.name, author: repo.owner, source_type: "github", readme_length: readmeLen });
      setStep("success");
      onImported({ id: repo.id, title: repo.name, author: repo.owner, sourceType: "github", fileType: "html" });
    } catch (e: any) {
      setError(e.message || "Import failed");
      setStep("error");
    }
  };

  const handleFileDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleFileUpload = async () => {
    if (!selectedFile || !service) return;
    setStep("loading");
    setError("");

    try {
      const title = selectedFile.name.replace(/\.[^.]+$/, "");
      const data = await service.uploadFile(selectedFile, title, "Unknown");
      setResult({ ...data, source_type: "file" });
      setStep("success");
      onImported({ id: data.id, title: data.title, author: data.author, sourceType: "file", fileType: data.file_type, totalPages: data.totalPages });
    } catch (e: any) {
      setError(e.message || "Upload failed");
      setStep("error");
    }
  };

  const handleUrlImport = async () => {
    const url = input.trim();
    if (!url || !service) return;
    setStep("loading");
    setError("");

    try {
      const data = await service.importUrl(url);
      setResult({ ...data, source_type: "url" });
      setStep("success");
      onImported({ id: data.id, title: data.title, author: data.author, sourceType: "url", fileType: data.file_type });
    } catch (e: any) {
      setError(e.message || "Import failed");
      setStep("error");
    }
  };

  const handleImport = () => {
    if (tab === "github") handleGithubImport();
    else if (tab === "file") handleFileUpload();
    else handleUrlImport();
  };

  const canImport = tab === "github" ? !!fullName : tab === "file" ? !!selectedFile : input.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(44,26,14,0.6)", backdropFilter: "blur(4px)" }} />
      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "var(--card)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <BookOpen size={20} style={{ color: "var(--accent)" }} />
            <h2 className="text-lg font-semibold" style={{ fontFamily: "Playfair Display, serif", color: "var(--foreground)" }}>
              导入书籍
            </h2>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="p-1.5 rounded-full hover:bg-[var(--muted)] transition-colors">
            <X size={18} style={{ color: "var(--muted-foreground)" }} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); reset(); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors"
              style={{
                color: tab === t.key ? "var(--accent)" : "var(--muted-foreground)",
                borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
                fontFamily: "Inter, sans-serif",
              }}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5">
          {step === "loading" ? (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent)" }} />
              <p className="text-sm" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                {tab === "github" ? "正在获取仓库信息..." : tab === "file" ? "正在上传文件..." : "正在获取网页内容..."}
              </p>
            </div>
          ) : step === "success" && result ? (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="p-3 rounded-full" style={{ background: "rgba(107,158,107,0.15)" }}>
                <CheckCircle size={32} style={{ color: "#6b9e6b" }} />
              </div>
              <p className="text-sm font-medium" style={{ fontFamily: "Inter, sans-serif", color: "var(--foreground)" }}>
                {result.title}
              </p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                {result.source_type === "github"
                  ? `README ${result.readme_length ? result.readme_length + " 字符" : "未获取"} • AI 生成已启动`
                  : result.source_type === "file"
                  ? `${result.file_type?.toUpperCase()} • ${result.author}`
                  : `网页 • ${result.file_type?.toUpperCase()}`}
              </p>
              <button
                onClick={() => { reset(); onClose(); }}
                className="mt-2 px-6 py-2 rounded-full text-sm font-medium transition-colors"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "Inter, sans-serif" }}
              >
                完成
              </button>
            </div>
          ) : step === "error" ? (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="p-3 rounded-full" style={{ background: "rgba(220,80,80,0.15)" }}>
                <AlertCircle size={32} style={{ color: "#dc5050" }} />
              </div>
              <p className="text-sm text-center" style={{ color: "#dc5050", fontFamily: "Inter, sans-serif" }}>{error}</p>
              <button
                onClick={() => setStep("input")}
                className="mt-2 px-6 py-2 rounded-full text-sm font-medium transition-colors"
                style={{ background: "var(--muted)", color: "var(--foreground)", fontFamily: "Inter, sans-serif" }}
              >
                重试
              </button>
            </div>
          ) : (
            <>
              {tab === "github" && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium" style={{ fontFamily: "Inter, sans-serif", color: "var(--foreground)" }}>
                    输入 GitHub 仓库地址或 <code style={{ background: "var(--muted)", padding: "2px 6px", borderRadius: "4px", fontSize: "0.85em" }}>owner/repo</code> 格式
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && canImport) handleImport(); }}
                      placeholder="https://github.com/owner/repo"
                      className="flex-1 px-3 py-2.5 rounded-xl text-sm border outline-none transition-colors focus:border-[var(--accent)]"
                      style={{
                        background: "var(--background)",
                        borderColor: "var(--border)",
                        color: "var(--foreground)",
                        fontFamily: "Inter, sans-serif",
                      }}
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {tab === "file" && (
                <div className="space-y-3">
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
                    style={{
                      borderColor: dragOver ? "var(--accent)" : "var(--border)",
                      background: dragOver ? "rgba(193,127,58,0.05)" : "var(--background)",
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".epub,.pdf,.txt,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.html,.md"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    {selectedFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <FileText size={32} style={{ color: "var(--accent)" }} />
                        <p className="text-sm font-medium" style={{ fontFamily: "Inter, sans-serif", color: "var(--foreground)" }}>
                          {selectedFile.name}
                        </p>
                        <p className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                          {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload size={32} style={{ color: "var(--muted-foreground)" }} />
                        <p className="text-sm" style={{ fontFamily: "Inter, sans-serif", color: "var(--foreground)" }}>
                          拖拽文件到此处或点击选择
                        </p>
                        <p className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                          支持 EPUB, PDF, TXT, DOC, PPT, XLSX, HTML
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === "url" && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium" style={{ fontFamily: "Inter, sans-serif", color: "var(--foreground)" }}>
                    输入网页链接
                  </label>
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && canImport) handleImport(); }}
                    placeholder="https://example.com/article"
                    className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none transition-colors focus:border-[var(--accent)]"
                    style={{
                      background: "var(--background)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                      fontFamily: "Inter, sans-serif",
                    }}
                    autoFocus
                  />
                  <p className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                    支持任意网页、ArXiv 论文、技术文档等
                  </p>
                </div>
              )}

              <button
                onClick={handleImport}
                disabled={!canImport}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "Inter, sans-serif" }}
              >
                <Sparkles size={16} />
                开始导入
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
