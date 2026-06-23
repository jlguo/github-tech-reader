/**
 * RemoteDataService — talks to the Python FastAPI backend over HTTP.
 *
 * Every method is a 1:1 mapping of the existing fetch() calls found in
 * App.tsx, ImportDialog.tsx, useBookStatus.ts, HtmlReader.tsx, and
 * FileReader.tsx.  No behaviour changes — just rehoused.
 */

import type {
  IDataService,
  RemoteBook,
  BookContentResult,
  BookGenStatus,
  AddRepoResult,
  ImportResult,
} from "./api";

export class RemoteDataService implements IDataService {
  #base: string;

  constructor(baseUrl: string) {
    this.#base = baseUrl.replace(/\/$/, "");
  }

  // ── Books ──────────────────────────────────────────────────────

  async getBooks(): Promise<RemoteBook[]> {
    const r = await fetch(`${this.#base}/books`);
    if (!r.ok) throw new Error(`GET /books failed: ${r.status}`);
    return r.json();
  }

  async deleteBook(bookId: string): Promise<void> {
    const r = await fetch(`${this.#base}/books/${bookId}`, {
      method: "DELETE",
    });
    if (!r.ok) throw new Error(`DELETE /books/${bookId} failed: ${r.status}`);
  }

  async updateBook(
    bookId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const r = await fetch(`${this.#base}/books/${bookId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!r.ok)
      throw new Error(`PATCH /books/${bookId} failed: ${r.status}`);
  }

  async getBookByRepo(repoId: string): Promise<BookContentResult> {
    const r = await fetch(`${this.#base}/books/by-repo/${repoId}`);
    if (!r.ok) throw new Error(`GET /books/by-repo/${repoId} failed: ${r.status}`);
    return r.json();
  }

  async getBookContent(bookId: string): Promise<BookContentResult> {
    const r = await fetch(`${this.#base}/books/${bookId}`);
    if (!r.ok) throw new Error(`GET /books/${bookId} failed: ${r.status}`);
    return r.json();
  }

  // ── Repos ──────────────────────────────────────────────────────

  async addRepo(fullName: string): Promise<AddRepoResult> {
    const r = await fetch(`${this.#base}/repos/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: fullName }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(
        (err as { detail?: string }).detail ??
          `Failed to add repo (${r.status})`,
      );
    }
    return r.json();
  }

  async fetchReadme(repoId: string): Promise<void> {
    const r = await fetch(`${this.#base}/repos/${repoId}/fetch-readme`, {
      method: "POST",
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(
        (err as { detail?: string }).detail ?? "README not available",
      );
    }
  }

  // ── Book generation ────────────────────────────────────────────

  async generateBook(repoId: string): Promise<void> {
    const r = await fetch(`${this.#base}/agents/generate-book/${repoId}`, {
      method: "POST",
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(
        (err as { detail?: string }).detail ??
          "Failed to start book generation",
      );
    }
  }

  async getBookStatus(repoId: string): Promise<BookGenStatus | null> {
    const r = await fetch(`${this.#base}/agents/book-status/${repoId}`);
    if (!r.ok) return null;
    return r.json();
  }

  // ── YouTube book generation ─────────────────────────────────────

  async generateYoutubeBook(url: string): Promise<{ repo_id: string; video_id: string }> {
    const r = await fetch(`${this.#base}/youtube/generate-book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(
        (err as { detail?: string }).detail ??
          "Failed to start YouTube book generation",
      );
    }
    return r.json();
  }

  getYoutubeBookStatusStreamUrl(repoId: string): string {
    return `${this.#base}/youtube/book-status/${repoId}/stream`;
  }

  getYoutubeBookStatusUrl(repoId: string): string {
    return `${this.#base}/youtube/book-status/${repoId}`;
  }

  // ── Imports ────────────────────────────────────────────────────

  async uploadFile(
    file: File,
    title: string,
    author: string,
  ): Promise<ImportResult> {
    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("author", author);

    const r = await fetch(`${this.#base}/imports/upload`, {
      method: "POST",
      body: form,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(
        (err as { detail?: string }).detail ?? "Upload failed",
      );
    }
    return r.json();
  }

  async importUrl(url: string): Promise<ImportResult> {
    const form = new FormData();
    form.append("url", url);

    const r = await fetch(`${this.#base}/imports/import-url`, {
      method: "POST",
      body: form,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(
        (err as { detail?: string }).detail ?? "Import failed",
      );
    }
    return r.json();
  }

  // ── URLs ───────────────────────────────────────────────────────

  getImportedFileUrl(importId: string): string {
    return `${this.#base}/imports/${importId}/file`;
  }

  async getImportedFileBlobUrl(importId: string): Promise<string> {
    return this.getImportedFileUrl(importId);
  }

  getBookStatusStreamUrl(repoId: string): string {
    return `${this.#base}/agents/book-status/${repoId}/stream`;
  }

  getBookStatusUrl(repoId: string): string {
    return `${this.#base}/agents/book-status/${repoId}`;
  }

  // ── Reading progress ───────────────────────────────────────────

  async updateReadingProgress(
    repoId: string,
    section: string | null,
    position: number,
    completed: boolean,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await fetch(`${this.#base}/reading/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo_id: repoId,
        section,
        position,
        completed,
        metadata: metadata ? JSON.stringify(metadata) : undefined,
      }),
    });
  }
}
