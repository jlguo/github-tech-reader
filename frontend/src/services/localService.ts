import type {
  IDataService,
  RemoteBook,
  BookContentResult,
  BookGenStatus,
  AddRepoResult,
  ImportResult,
} from "./api";
import { BookDatabase, type RepoRow } from "./db";
import { GitHubApi, type RepoInfo } from "./githubApi";
import { LlmClient } from "./llmClient";
import {
  generateBookCover,
  generateBookContent,
  prependCover,
  type ChapterOutline,
} from "./bookGenerator";

const _blobUrls = new Map<string, string>();

const IDB_FILES_NAME = "bookshelf-files";
const IDB_FILES_STORE = "blobs";

function filesIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_FILES_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_FILES_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveFileBytes(id: string, data: ArrayBuffer, mime: string): Promise<void> {
  const db = await filesIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_FILES_STORE, "readwrite");
    tx.objectStore(IDB_FILES_STORE).put({ data: data as unknown as Blob, mime }, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadFileBytes(id: string): Promise<{ data: ArrayBuffer; mime: string } | null> {
  const db = await filesIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_FILES_STORE, "readonly");
    const req = tx.objectStore(IDB_FILES_STORE).get(id);
    req.onsuccess = () => {
      const raw = req.result;
      if (!raw) return resolve(null);
      if (raw instanceof ArrayBuffer) {
        resolve({ data: raw, mime: "application/octet-stream" });
      } else if (raw && typeof raw === "object" && "data" in raw) {
        resolve(raw as { data: ArrayBuffer; mime: string });
      } else {
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

const STORAGE_KEY_LLM_KEY = "bookshelf_llm_key";
const STORAGE_KEY_LLM_URL = "bookshelf_llm_url";
const STORAGE_KEY_LLM_MODEL = "bookshelf_llm_model";
const STORAGE_KEY_GH_TOKEN = "bookshelf_gh_token";

function getSetting(key: string, fallback: string = ""): string {
  try { return localStorage.getItem(key) ?? fallback; }
  catch { return fallback; }
}

function base64ToBytes(base64: string): Uint8Array {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function countPdfPages(buf: ArrayBuffer): number {
  const text = new TextDecoder().decode(buf.slice(0, Math.min(buf.byteLength, 2_000_000)));
  const matches = text.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
}

function makeBlobUrl(contentText: string, mime: string): string {
  let base64 = contentText.replace(/^data:[^;]+;base64,/, "");
  const bytes = base64ToBytes(base64);
  const blob = new Blob([bytes as BlobPart], { type: mime });
  return URL.createObjectURL(blob);
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
    readme_content: null, readme_fetched_at: null,
  };
}

function detectFileType(filename: string): string {
  const map: Record<string, string> = {
    ".epub":"epub", ".pdf":"pdf", ".txt":"txt", ".doc":"doc", ".docx":"doc",
    ".ppt":"ppt", ".pptx":"ppt", ".xls":"xls", ".xlsx":"xlsx",
    ".html":"html", ".htm":"html", ".md":"txt",
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
  #github: GitHubApi;
  #baseUrl: string;

  constructor(db: BookDatabase, baseUrl: string) {
    this.#db = db;
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#github = new GitHubApi(getSetting(STORAGE_KEY_GH_TOKEN) || undefined);
  }

  static async create(): Promise<LocalDataService> {
    const db = await BookDatabase.create();
    return new LocalDataService(db, "http://localhost:8000/api");
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
    await this.#db.persist();
  }

  async updateBook(bookId: string, data: Record<string, unknown>): Promise<void> {
    await this.#db.updateBook(bookId, data);
    await this.#db.persist();
  }

  async getBookByRepo(repoId: string): Promise<BookContentResult> {
    const r = await this.#db.getBookByRepo(repoId);
    return { html_content: r?.html_content ?? "" };
  }

  async getBookContent(bookId: string): Promise<BookContentResult> {
    const r = await this.#db.getImportedBookContent(bookId);
    if (!r?.html_content) return { html_content: "" };
    if (r.html_content.startsWith("data:")) {
      const mime = r.html_content.match(/^data:([^;]+)/)?.[1] || "application/octet-stream";
      const blobUrl = makeBlobUrl(r.html_content, mime);
      _blobUrls.set(bookId, blobUrl);
      return { html_content: blobUrl };
    }
    return { html_content: r.html_content };
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
      await this.#db.updateRepo(repoId, {
        readme_content: readme,
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
    if (!repo?.readme_content) throw new Error("Repo or README not found");

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

    try {
      const cover = await generateBookCover(
        llm, this.#github, repo.full_name, repo.description ?? "",
        repo.readme_content, updateStatus,
      );

      await this.#db.upsertBookGen(repoId, {
        status: "writing", current_phase: "writing",
        total_chapters: cover.outline.length, completed_chapters: 0,
        cover_html: cover.coverHtml,
        outline: JSON.stringify(cover.outline),
        updated_at: new Date().toISOString(),
      });
      await this.#db.persist();

      const content = await generateBookContent(
        llm, repo.full_name, cover.outline, cover.snapshot, updateStatus,
      );

      for (const ch of content.chapters) {
        await this.#db.insertContentSection({
          id: crypto.randomUUID(), repo_id: repoId,
          section_type: "book_chapter", title: ch.title, content: ch.content,
          order_index: ch.number, chapter_number: ch.number,
          word_count: ch.wordCount, status: "approved",
          metadata: null, created_at: new Date().toISOString(),
        });
      }

      const finalHtml = prependCover(content.html, cover.coverHtml);
      await this.#db.upsertBookGen(repoId, {
        status: "done", current_phase: "done",
        completed_chapters: content.chapters.length,
        html_output: finalHtml,
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
    saveFileBytes(id, buf, mime).catch(() => {});

    let totalPages = 0;
    if (fileType === "pdf") {
      totalPages = countPdfPages(buf);
    }

    await this.#db.insertImportedBook({
      id, title: title || file.name.replace(/\.[^.]+$/, ""),
      author: author || "Unknown", source_type: "file", file_type: fileType,
      file_path: null, original_url: null, content_text: null,
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

    await this.#db.insertImportedBook({
      id, title: pageTitle, author: "Unknown", source_type: "url",
      file_type: "html", file_path: null, original_url: url,
      content_text: html, size_bytes: new Blob([html]).size,
      description: null, category: "imported", tags: "[]",
      is_favorite: 0, added_at: new Date().toISOString(),
    });
    await this.#db.persist();

    return { id, title: pageTitle, author: "Unknown", source_type: "url", file_type: "html" };
  }

  // ── URLs ────────────────────────────────────────────────────────

  getImportedFileUrl(importId: string): string {
    if (_blobUrls.has(importId)) return _blobUrls.get(importId)!;

    loadFileBytes(importId).then(entry => {
      if (entry && !_blobUrls.has(importId)) {
        const url = URL.createObjectURL(new Blob([entry.data], { type: entry.mime }));
        _blobUrls.set(importId, url);
      }
    }).catch(() => {});

    return "";
  }

  async getImportedFileBlobUrl(importId: string): Promise<string> {
    if (_blobUrls.has(importId)) return _blobUrls.get(importId)!;
    const entry = await loadFileBytes(importId);
    if (!entry) return "";
    const url = URL.createObjectURL(new Blob([entry.data], { type: entry.mime }));
    _blobUrls.set(importId, url);
    return url;
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
      metadata: metadata ? JSON.stringify(metadata) : '{}',
    });
    await this.#db.persist();
  }
}
