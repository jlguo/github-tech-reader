import type {
  IDataService,
  RemoteBook,
  BookContentResult,
  BookGenStatus,
  AddRepoResult,
  ImportResult,
} from "./api";
import { BookDatabase, ContentStore, type RepoRow } from "./db";
import { GitHubApi, type RepoInfo } from "./githubApi";
import { LlmClient } from "./llmClient";
import {
  generateBookCover,
  generateBookContent,
  prependCover,
  type ChapterOutline,
} from "./bookGenerator";

const _blobUrls = new Map<string, string>();

const STORAGE_KEY_LLM_KEY = "bookshelf_llm_key";
const STORAGE_KEY_LLM_URL = "bookshelf_llm_url";
const STORAGE_KEY_LLM_MODEL = "bookshelf_llm_model";
const STORAGE_KEY_GH_TOKEN = "bookshelf_gh_token";

function getSetting(key: string, fallback: string = ""): string {
  try { return localStorage.getItem(key) ?? fallback; }
  catch { return fallback; }
}

function countPdfPages(buf: ArrayBuffer): number {
  const text = new TextDecoder().decode(buf.slice(0, Math.min(buf.byteLength, 2_000_000)));
  const matches = text.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
}

function makeRepoRow(info: RepoInfo, id: string): RepoRow {
  const now = new Date().toISOString();
  return {
    id, github_id: info.github_id, full_name: info.full_name,
    owner: info.owner, name: info.name, description: info.description,
    html_url: info.html_url, stars: info.stars, forks: info.forks,
    language: info.language, topics: JSON.stringify(info.topics),
    license: info.license, default_branch: info.default_branch,
    created_at_github: info.created_at_github,
    updated_at_github: info.updated_at_github,
    category: "uncategorized", tags: "[]", is_favorite: 0, added_at: now,
    readme_fetched_at: null,
  };
}

function detectFileType(filename: string): string {
  const map: Record<string, string> = {
    ".epub":"epub", ".pdf":"pdf", ".txt":"txt", ".doc":"word", ".docx":"word",
    ".ppt":"ppt", ".pptx":"ppt", ".xls":"excel", ".xlsx":"excel",
    ".html":"html", ".htm":"html", ".md":"txt",
    ".cbz":"cbz", ".cbr":"cbz",
  };
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return map[ext] ?? "txt";
}

function extractTitle(text: string, fallback: string): string {
  const m = text.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : fallback;
}

export class LocalDataService implements IDataService {
  #db: BookDatabase;
  #contentStore: ContentStore;
  #github: GitHubApi;
  #baseUrl: string;

  constructor(db: BookDatabase, contentStore: ContentStore, baseUrl: string) {
    this.#db = db;
    this.#contentStore = contentStore;
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#github = new GitHubApi(getSetting(STORAGE_KEY_GH_TOKEN) || undefined);
  }

  static async create(): Promise<LocalDataService> {
    const db = await BookDatabase.create();
    return new LocalDataService(db, db.contentStore, "http://localhost:8000/api");
  }

  #llm(): LlmClient | null {
    const key = getSetting(STORAGE_KEY_LLM_KEY);
    if (!key) return null;
    return new LlmClient(
      key,
      getSetting(STORAGE_KEY_LLM_URL) || undefined,
      getSetting(STORAGE_KEY_LLM_MODEL) || undefined,
    );
  }

  async #readFileBuffer(path: string): Promise<ArrayBuffer | null> {
    try {
      const root = await this.#contentStore.getRoot();
      const parts = path.split("/").filter(Boolean);
      let current: FileSystemDirectoryHandle = root;
      for (let i = 0; i < parts.length - 1; i++) {
        current = await current.getDirectoryHandle(parts[i]);
      }
      const fileHandle = await current.getFileHandle(parts[parts.length - 1]);
      const file = await fileHandle.getFile();
      return await file.arrayBuffer();
    } catch {
      return null;
    }
  }

  // ── Books ────────────────────────────────────────────────────────

  async getBooks(): Promise<RemoteBook[]> {
    const items = await this.#db.getBooks();
    return items.map((item) => ({
      repo_id: item.repo_id,
      book_id: item.book_id,
      title: item.title,
      author: item.author,
      description: item.description,
      language: item.language,
      html_url: item.html_url,
      status: item.status,
      chapter_count: item.chapter_count,
      source_type: item.source_type,
      file_type: item.file_type || "html",
      progress: Math.round(item.progress),
      progress_metadata: item.progress_metadata,
    }));
  }

  async deleteBook(bookId: string): Promise<void> {
    const url = _blobUrls.get(bookId);
    if (url) { URL.revokeObjectURL(url); _blobUrls.delete(bookId); }
    await this.#db.deleteBook(bookId);
    // Clean up OPFS content for generated or imported books
    await this.#contentStore.removeDir(`books/${bookId}`).catch(() => {});
    await this.#contentStore.removeDir(`imports/${bookId}`).catch(() => {});
    await this.#db.persist();
  }

  async updateBook(bookId: string, data: Record<string, unknown>): Promise<void> {
    await this.#db.updateBook(bookId, data);
    await this.#db.persist();
  }

  async getBookByRepo(repoId: string): Promise<BookContentResult> {
    const gen = await this.#db.getBookGen(repoId);
    if (!gen) return { html_content: "" };
    try {
      const html = await this.#contentStore.readFile(`books/${gen.id}/book.html`);
      return { html_content: html ?? "" };
    } catch {
      return { html_content: "" };
    }
  }

  async getBookContent(bookId: string): Promise<BookContentResult> {
    // Try imported content (URL imports stored in OPFS)
    try {
      const html = await this.#contentStore.readFile(`imports/${bookId}/content.html`);
      if (html) return { html_content: html };
    } catch { /* not an imported content book */ }

    // Try generated book content stored in OPFS
    try {
      const html = await this.#contentStore.readFile(`books/${bookId}/book.html`);
      if (html) return { html_content: html };
    } catch { /* not a generated book */ }

    return { html_content: "" };
  }

  // ── Repos ────────────────────────────────────────────────────────

  async addRepo(fullName: string): Promise<AddRepoResult> {
    const info = await this.#github.fetchRepoInfo(fullName);
    const id = crypto.randomUUID();
    await this.#db.insertRepo(makeRepoRow(info, id));
    await this.#db.persist();
    return { id, name: info.name, owner: info.owner };
  }

  async fetchReadme(repoId: string): Promise<void> {
    const repo = await this.#db.getRepo(repoId);
    if (!repo) throw new Error("Repo not found");
    const readme = await this.#github.fetchReadme(repo.full_name);
    if (readme) {
      await this.#contentStore.writeFile(`repos/${repoId}/readme.md`, readme);
      await this.#db.updateRepo(repoId, {
        readme_fetched_at: new Date().toISOString(),
      });
      await this.#db.persist();
    }
  }

  // ── Book generation ─────────────────────────────────────────────

  async generateBook(repoId: string): Promise<void> {
    const llm = this.#llm();
    if (!llm) throw new Error("No LLM API key. Add one in Settings.");

    const repo = await this.#db.getRepo(repoId);
    if (!repo) throw new Error("Repo not found");

    // Read README from OPFS
    const readmeContent = await this.#contentStore.readFile(`repos/${repoId}/readme.md`);
    if (!readmeContent) throw new Error("README not found. Fetch it first.");

    const updateStatus = async (
      status: string,
      meta?: { phase?: string; totalChapters?: number; completedChapters?: number; outline?: ChapterOutline[] },
    ) => {
      await this.#db.upsertBookGen(repoId, {
        status,
        current_phase: meta?.phase ?? null,
        total_chapters: meta?.totalChapters ?? 0,
        completed_chapters: meta?.completedChapters ?? 0,
        outline: meta?.outline ? JSON.stringify(meta.outline) : undefined,
        updated_at: new Date().toISOString(),
      });
      await this.#db.persist();
    };

    // Determine the gen ID (reuse existing or create new one)
    let genId: string;
    const existingGen = await this.#db.getBookGen(repoId);
    if (existingGen) {
      genId = existingGen.id;
      // Clean up old OPFS content for regeneration
      await this.#contentStore.removeDir(`books/${genId}`).catch(() => {});
    } else {
      genId = crypto.randomUUID();
    }

    try {
      const cover = await generateBookCover(
        llm, this.#github, repo.full_name, repo.description ?? "",
        readmeContent, updateStatus,
      );

      // Save cover to OPFS
      await this.#contentStore.writeFile(`books/${genId}/cover.html`, cover.coverHtml);

      // Create/update book gen record
      await this.#db.upsertBookGen(repoId, {
        id: genId,
        status: "writing", current_phase: "writing",
        total_chapters: cover.outline.length, completed_chapters: 0,
        outline: JSON.stringify(cover.outline),
        updated_at: new Date().toISOString(),
      });
      await this.#db.persist();

      const content = await generateBookContent(
        llm, repo.full_name, cover.outline, cover.snapshot, updateStatus,
      );

      for (const ch of content.chapters) {
        // Save each chapter to OPFS
        const chapNum = String(ch.number).padStart(2, "0");
        await this.#contentStore.writeFile(
          `books/${genId}/chapters/${chapNum}.html`,
          ch.content,
        );

        // Keep DB insertion for metadata
        await this.#db.insertContentSection({
          id: crypto.randomUUID(), repo_id: repoId,
          section_type: "book_chapter", title: ch.title,
          order_index: ch.number, chapter_number: ch.number,
          word_count: ch.wordCount, status: "approved",
          metadata: null, created_at: new Date().toISOString(),
        });
      }

      const finalHtml = prependCover(content.html, cover.coverHtml);
      await this.#contentStore.writeFile(`books/${genId}/book.html`, finalHtml);

      await this.#db.upsertBookGen(repoId, {
        status: "done", current_phase: "done",
        completed_chapters: content.chapters.length,
        updated_at: new Date().toISOString(),
      });
      await this.#db.persist();
    } catch (e) {
      await this.#db.upsertBookGen(repoId, {
        status: "failed",
        error_log: String(e),
        updated_at: new Date().toISOString(),
      });
      await this.#db.persist();
      throw e;
    }
  }

  async getBookStatus(repoId: string): Promise<BookGenStatus | null> {
    const gen = await this.#db.getBookGen(repoId);
    if (!gen) return null;
    return {
      status: gen.status as BookGenStatus["status"],
      current_phase: gen.current_phase,
      total_chapters: gen.total_chapters,
      completed_chapters: gen.completed_chapters,
    };
  }

  // ── Imports ──────────────────────────────────────────────────────

  async uploadFile(file: File, title: string, author: string): Promise<ImportResult> {
    const id = crypto.randomUUID();
    const fileType = detectFileType(file.name);
    const mime = file.type || "application/octet-stream";

    const blobUrl = URL.createObjectURL(file);
    _blobUrls.set(id, blobUrl);

    const buf = await file.arrayBuffer();
    // Store raw binary in OPFS
    await this.#contentStore.writeFile(`uploads/${id}`, buf);

    let totalPages = 0;
    if (fileType === "pdf") {
      totalPages = countPdfPages(buf);
    }

    await this.#db.insertImportedBook({
      id, title: title || file.name.replace(/\.[^.]+$/, ""),
      author: author || "Unknown", source_type: "file", file_type: fileType,
      file_path: null, original_url: null,
      size_bytes: file.size, description: null,
      category: "imported", tags: "[]", is_favorite: 0,
      added_at: new Date().toISOString(),
    });
    await this.#db.persist();

    return { id, title, author, source_type: "file", file_type: fileType, totalPages };
  }

  async importUrl(url: string): Promise<ImportResult> {
    const id = crypto.randomUUID();
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch URL: ${resp.status}`);
    const html = await resp.text();
    const pageTitle = extractTitle(html, url);

    // Save content to OPFS instead of DB content_text column
    await this.#contentStore.writeFile(`imports/${id}/content.html`, html);

    await this.#db.insertImportedBook({
      id, title: pageTitle, author: "Unknown", source_type: "url",
      file_type: "html", file_path: null, original_url: url,
      size_bytes: new Blob([html]).size,
      description: null, category: "imported", tags: "[]",
      is_favorite: 0, added_at: new Date().toISOString(),
    });
    await this.#db.persist();

    return { id, title: pageTitle, author: "Unknown", source_type: "url", file_type: "html" };
  }

  // ── URLs ────────────────────────────────────────────────────────

  getImportedFileUrl(importId: string): string {
    if (_blobUrls.has(importId)) return _blobUrls.get(importId)!;

    // Trigger async load — when done, the blob URL will be cached
    this.#loadImportedFileBlobUrl(importId).catch(() => {});

    return "";
  }

  async getImportedFileBlobUrl(importId: string): Promise<string> {
    if (_blobUrls.has(importId)) return _blobUrls.get(importId)!;

    await this.#loadImportedFileBlobUrl(importId);
    return _blobUrls.get(importId) ?? "";
  }

  /** Shared helper: read uploaded file from OPFS and cache blob URL. */
  async #loadImportedFileBlobUrl(importId: string): Promise<void> {
    if (_blobUrls.has(importId)) return;

    const imp = await this.#db.getImportedBook(importId);
    const mimeMap: Record<string, string> = {
      pdf: "application/pdf",
      html: "text/html",
      txt: "text/plain",
      epub: "application/epub+zip",
      word: "application/msword",
      ppt: "application/vnd.ms-powerpoint",
      excel: "application/vnd.ms-excel",
      cbz: "application/vnd.comicbook+zip",
      cbr: "application/vnd.comicbook-rar",
    };
    const mime = (imp && mimeMap[imp.file_type]) || "application/octet-stream";

    const buf = await this.#readFileBuffer(`uploads/${importId}`);
    if (!buf) return;

    const url = URL.createObjectURL(new Blob([buf], { type: mime }));
    _blobUrls.set(importId, url);
  }

  getBookStatusStreamUrl(repoId: string): string {
    return `${this.#baseUrl}/agents/book-status/${repoId}/stream`;
  }

  getBookStatusUrl(repoId: string): string {
    return `${this.#baseUrl}/agents/book-status/${repoId}`;
  }

  // ── Reading progress ────────────────────────────────────────────

  async updateReadingProgress(
    repoId: string, section: string | null, position: number, completed: boolean,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.#db.getReadingProgress(repoId);
    await this.#db.upsertReadingProgress({
      id: existing?.id ?? crypto.randomUUID(),
      repo_id: repoId,
      section: section || null,
      position,
      completed: completed ? 1 : 0,
      updated_at: new Date().toISOString(),
      metadata: metadata ? JSON.stringify(metadata) : "{}",
    });
    await this.#db.persist();
  }
}
