/**
 * IDataService — abstraction over data access.
 *
 * Phase 1 (current): RemoteDataService → Python FastAPI backend
 * Phase 2 (future):  LocalDataService  → sql.js + OPFS (on-device PWA)
 */

// ── Types ──────────────────────────────────────────────────────────

export interface RemoteBook {
  repo_id: string;
  book_id: string;
  title: string;
  author: string;
  description: string | null;
  language: string | null;
  html_url: string;
  status: string;
  chapter_count: number;
  source_type: string;
  file_type: string | null;
  progress?: number;
  progress_metadata?: string;
  last_read_at?: string | null;
  cover_html?: string | null;
  cover_url?: string | null;
  category?: string;
  tags?: string[];
}

export interface RemoteCategory {
  id: string;
  key: string;
  label: string;
  icon: string;
  color: string;
  sort_order: number;
  is_system: boolean;
}

export interface CategoryInput {
  label: string;
  icon?: string;
  color?: string;
  sort_order?: number;
}

export interface BookContentResult {
  html_content: string;
}

export type GenStatus =
  | "pending"
  | "fetching"
  | "planning"
  | "cover"
  | "writing"
  | "reviewing"
  | "publishing"
  | "done"
  | "failed"
  | "no_book";

export interface BookGenStatus {
  status: GenStatus;
  current_phase: string | null;
  total_chapters: number;
  completed_chapters: number;
}

export interface AddRepoResult {
  id: string;
  name: string;
  owner: string;
}

export interface ImportResult {
  id: string;
  title: string;
  author: string;
  source_type: string;
  file_type?: string;
  readme_length?: number;
  totalPages?: number;
}

// ── Interface ──────────────────────────────────────────────────────

export interface IDataService {
  // Books
  getBooks(): Promise<RemoteBook[]>;
  deleteBook(bookId: string): Promise<void>;
  updateBook(bookId: string, data: Record<string, unknown>): Promise<void>;
  getBookByRepo(repoId: string): Promise<BookContentResult>;
  getBookContent(bookId: string): Promise<BookContentResult>;

  // Repos
  addRepo(fullName: string): Promise<AddRepoResult>;
  fetchReadme(repoId: string): Promise<void>;

  // Categories
  getCategories(): Promise<RemoteCategory[]>;
  createCategory(data: CategoryInput): Promise<RemoteCategory>;
  updateCategory(id: string, data: Partial<CategoryInput>): Promise<RemoteCategory>;
  deleteCategory(id: string): Promise<void>;

  // Book generation
  generateBook(repoId: string): Promise<void>;
  getBookStatus(repoId: string): Promise<BookGenStatus | null>;

  // YouTube book generation
  generateYoutubeBook(params: { url?: string; repo_id?: string }): Promise<{ repo_id: string; video_id: string; video_title: string; status: string }>;
  getYoutubeBookStatusStreamUrl(repoId: string): string;
  getYoutubeBookStatusUrl(repoId: string): string;
  getYoutubeBookStatus(repoId: string): Promise<BookGenStatus | null>;

  // Imports
  uploadFile(file: File, title: string, author: string): Promise<ImportResult>;
  importUrl(url: string): Promise<ImportResult>;

  // URLs (for iframes, SSE EventSource, polling)
  getImportedFileUrl(importId: string): string;
  getImportedFileBlobUrl(importId: string): Promise<string>;
  getBookStatusStreamUrl(repoId: string): string;
  getBookStatusUrl(repoId: string): string;

  // Reading progress
  updateReadingProgress(
    repoId: string,
    section: string | null,
    position: number,
    completed: boolean,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
}

// ── Factory ────────────────────────────────────────────────────────

import { RemoteDataService } from "./remoteService";

const BASE_URL: string =
  (typeof import.meta !== "undefined"
    ? (import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL
    : undefined)
  ?? "http://localhost:8000/api";

const DATA_SOURCE: string =
  typeof import.meta !== "undefined"
    ? (import.meta as unknown as { env?: { VITE_DATA_SOURCE?: string } }).env?.VITE_DATA_SOURCE ?? "remote"
    : "remote";

const _remoteService: IDataService = new RemoteDataService(BASE_URL);
let _servicePromise: Promise<IDataService> | null = null;

function _initService(): Promise<IDataService> {
  if (DATA_SOURCE === "local") {
    return import("./localService").then((m) => m.LocalDataService.create());
  }
  return Promise.resolve(_remoteService);
}

export function getDataService(): Promise<IDataService> {
  if (!_servicePromise) {
    _servicePromise = _initService();
  }
  return _servicePromise;
}

export function resetDataService(): void {
  _servicePromise = null;
}

export async function switchToLocal(): Promise<void> {
  const { LocalDataService } = await import("./localService");
  const local = await LocalDataService.create();
  _servicePromise = Promise.resolve(local);
}
