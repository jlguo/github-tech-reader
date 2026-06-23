import initSqlJs, { Database as SqlJsDatabase, SqlValue } from 'sql.js';

// ---------------------------------------------------------------------------
// ContentStore — OPFS-backed content file storage
// ---------------------------------------------------------------------------

export class ContentStore {
  private root: FileSystemDirectoryHandle | null = null;

  async getRoot(): Promise<FileSystemDirectoryHandle> {
    if (!this.root) {
      this.root = await navigator.storage.getDirectory();
    }
    return this.root;
  }

  private async ensureDir(path: string): Promise<FileSystemDirectoryHandle> {
    const root = await this.getRoot();
    const parts = path.split('/').filter(Boolean);
    let current = root;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true });
    }
    return current;
  }

  async writeFile(path: string, content: string | ArrayBuffer): Promise<void> {
    const dir = await this.ensureDir(path.split('/').slice(0, -1).join('/'));
    const filename = path.split('/').pop()!;
    const handle = await dir.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    try {
      if (typeof content === 'string') {
        await writable.write(content);
      } else {
        await writable.write(content);
      }
      await writable.close();
    } catch (e) {
      await writable.abort();
      throw e;
    }
  }

  async readFile(path: string): Promise<string | null> {
    try {
      const root = await this.getRoot();
      const parts = path.split('/').filter(Boolean);
      let current: FileSystemDirectoryHandle | FileSystemFileHandle = root;
      for (let i = 0; i < parts.length - 1; i++) {
        current = await (current as FileSystemDirectoryHandle).getDirectoryHandle(parts[i]);
      }
      const filename = parts[parts.length - 1];
      const fileHandle = await (current as FileSystemDirectoryHandle).getFileHandle(filename);
      const file = await fileHandle.getFile();
      return await file.text();
    } catch {
      return null;
    }
  }

  async hasFile(path: string): Promise<boolean> {
    try {
      const root = await this.getRoot();
      const parts = path.split('/').filter(Boolean);
      let current: FileSystemDirectoryHandle | FileSystemFileHandle = root;
      for (let i = 0; i < parts.length - 1; i++) {
        current = await (current as FileSystemDirectoryHandle).getDirectoryHandle(parts[i]);
      }
      await (current as FileSystemDirectoryHandle).getFileHandle(parts[parts.length - 1]);
      return true;
    } catch {
      return false;
    }
  }

  async removeDir(path: string): Promise<void> {
    try {
      const root = await this.getRoot();
      await root.removeEntry(path, { recursive: true });
    } catch {
      // Directory doesn't exist, that's fine
    }
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepoRow {
  id: string;
  github_id: number;
  full_name: string;
  owner: string;
  name: string;
  description: string | null;
  html_url: string;
  stars: number;
  forks: number;
  language: string | null;
  topics: string;
  license: string | null;
  default_branch: string;
  created_at_github: string | null;
  updated_at_github: string | null;
  category: string;
  tags: string;
  is_favorite: number;
  added_at: string;
  readme_fetched_at: string | null;
}

export interface BookGenRow {
  id: string;
  repo_id: string;
  status: string;
  total_chapters: number;
  completed_chapters: number;
  current_phase: string | null;
  outline: string | null;
  error_log: string | null;
  cover_html: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportedBookRow {
  id: string;
  title: string;
  author: string;
  source_type: string;
  file_type: string;
  file_path: string | null;
  original_url: string | null;
  size_bytes: number;
  description: string | null;
  category: string;
  tags: string;
  is_favorite: number;
  added_at: string;
}

export interface ContentSectionRow {
  id: string;
  repo_id: string;
  section_type: string;
  title: string;
  order_index: number;
  chapter_number: number | null;
  word_count: number | null;
  status: string;
  metadata: string | null;
  created_at: string;
}

export interface ReadingProgressRow {
  id: string;
  repo_id: string;
  section: string | null;
  position: number;
  completed: number;
  updated_at: string;
  metadata: string;
}

export interface BookListItem {
  repo_id: string;
  book_id: string;
  title: string;
  author: string;
  description: string | null;
  language: string | null;
  html_url: string;
  status: string;
  source_type: string;
  file_type: string;
  chapter_count: number;
  completed_chapters?: number;
  current_phase?: string | null;
  created_at?: string;
  updated_at?: string;
  last_read_at?: string | null;
  progress: number;
  progress_metadata?: string;
  cover_html?: string | null;
  category?: string;
  tags?: string;
}

export interface CategoryRow {
  id: string;
  key: string;
  label: string;
  icon: string;
  color: string;
  sort_order: number;
  is_system: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO_UPDATE_COLS = new Set([
  "description", "language", "category", "tags", "is_favorite", "readme_fetched_at",
]);
const BOOK_GEN_UPDATE_COLS = new Set([
  "status", "total_chapters", "completed_chapters", "current_phase", "outline", "error_log", "cover_html", "updated_at",
]);
const IMPORTED_BOOK_UPDATE_COLS = new Set([
  "title", "author", "description", "category", "tags", "is_favorite",
]);
const CATEGORY_UPDATE_COLS = new Set([
  "label", "icon", "color", "sort_order",
]);

function uuid(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

function slugify(text: string): string {
  let slug = text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) {
    slug = "cat-" + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  }
  return slug;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS repos (
    id TEXT PRIMARY KEY,
    github_id INTEGER UNIQUE,
    full_name TEXT NOT NULL,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    html_url TEXT NOT NULL,
    stars INTEGER DEFAULT 0,
    forks INTEGER DEFAULT 0,
    language TEXT,
    topics TEXT DEFAULT '[]',
    license TEXT,
    default_branch TEXT DEFAULT 'main',
    created_at_github TEXT,
    updated_at_github TEXT,
    category TEXT DEFAULT 'uncategorized',
    tags TEXT DEFAULT '[]',
    is_favorite INTEGER DEFAULT 0,
    added_at TEXT,
    readme_fetched_at TEXT
);

CREATE TABLE IF NOT EXISTS reading_progress (
    id TEXT PRIMARY KEY,
    repo_id TEXT NOT NULL,
    section TEXT,
    position REAL DEFAULT 0.0,
    completed INTEGER DEFAULT 0,
    updated_at TEXT,
    metadata TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS content_sections (
    id TEXT PRIMARY KEY,
    repo_id TEXT NOT NULL,
    section_type TEXT NOT NULL,
    title TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    chapter_number INTEGER,
    word_count INTEGER,
    status TEXT DEFAULT 'drafting',
    metadata TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS book_generations (
    id TEXT PRIMARY KEY,
    repo_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    total_chapters INTEGER DEFAULT 0,
    completed_chapters INTEGER DEFAULT 0,
    current_phase TEXT,
    outline TEXT,
    error_log TEXT,
    cover_html TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    icon TEXT DEFAULT 'BookOpen',
    color TEXT DEFAULT '#c17f3a',
    sort_order INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS imported_books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT DEFAULT 'Unknown',
    source_type TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_path TEXT,
    original_url TEXT,
    size_bytes INTEGER DEFAULT 0,
    description TEXT,
    category TEXT DEFAULT 'imported',
    tags TEXT DEFAULT '[]',
    is_favorite INTEGER DEFAULT 0,
    added_at TEXT
);
`;

// ---------------------------------------------------------------------------
// BookDatabase
// ---------------------------------------------------------------------------

export class BookDatabase {
  readonly contentStore: ContentStore;
  private db: SqlJsDatabase;
  private persistFn: () => Promise<void>;

  private constructor(db: SqlJsDatabase, persistFn: () => Promise<void>, contentStore?: ContentStore) {
    this.db = db;
    this.persistFn = persistFn;
    this.contentStore = contentStore ?? new ContentStore();
  }

  /** Create (or restore) the database, running schema init. */
  static async create(): Promise<BookDatabase> {
    const SQL = await initSqlJs({ locateFile: (_f: string) => `/sql-wasm.wasm` });

    let db: SqlJsDatabase;

    const restore = await loadDb();
    if (restore) {
      db = new SQL.Database(restore);
    } else {
      db = new SQL.Database();
    }

    db.run('PRAGMA journal_mode=WAL;');
    db.exec(SCHEMA_SQL);

    // Migration: add metadata column to reading_progress if missing
    try { db.run('ALTER TABLE reading_progress ADD COLUMN metadata TEXT DEFAULT \'{}\''); } catch { /* already exists */ }
    // Migration: add cover_html column to book_generations if missing
    try { db.run('ALTER TABLE book_generations ADD COLUMN cover_html TEXT'); } catch { /* already exists */ }

    // Seed system categories
    const SYSTEM_CATEGORIES = [
      { key: "generated", label: "AI 生成", icon: "BookOpen", color: "#c17f3a", sort_order: 10, is_system: 1 },
      { key: "documents", label: "文档资料", icon: "FileText", color: "#5c3d1e", sort_order: 20, is_system: 1 },
      { key: "imported", label: "导入内容", icon: "Download", color: "#3d6b8a", sort_order: 30, is_system: 1 },
      { key: "youtube", label: "视频", icon: "Youtube", color: "#7a2e1e", sort_order: 40, is_system: 1 },
      { key: "uncategorized", label: "未分类", icon: "Folder", color: "#8a8a8a", sort_order: 90, is_system: 1 },
    ];
    const existingCatKeys = new Set(
      (db.exec("SELECT key FROM categories")[0]?.values ?? []).map((r) => String(r[0])),
    );
    for (const cat of SYSTEM_CATEGORIES) {
      if (!existingCatKeys.has(cat.key)) {
        db.run(
          "INSERT INTO categories (id, key, label, icon, color, sort_order, is_system) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [uuid(), cat.key, cat.label, cat.icon, cat.color, cat.sort_order, cat.is_system],
        );
        existingCatKeys.add(cat.key);
      }
    }

    // Reconcile orphan categories: any category value used by repos or imported_books
    // that doesn't exist in the categories table gets created as a non-system row.
    for (const table of ["repos", "imported_books"]) {
      const orphans = db.exec(`SELECT DISTINCT category FROM ${table} WHERE category IS NOT NULL AND category != ''`);
      for (const row of orphans[0]?.values ?? []) {
        const key = String(row[0]);
        if (!existingCatKeys.has(key)) {
          db.run(
            "INSERT INTO categories (id, key, label, icon, color, sort_order, is_system) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [uuid(), key, key, "Folder", "#8a8a8a", 0, 0],
          );
          existingCatKeys.add(key);
        }
      }
    }

    const persistFn = makePersistFn(() => db);
    return new BookDatabase(db, persistFn);
  }

  /** Persist the in-memory database. Non-fatal — errors are logged. */
  async persist(): Promise<void> {
    try {
      await this.persistFn();
    } catch (e) {
      console.warn("DB persist failed:", e);
    }
  }

  // -----------------------------------------------------------------------
  // Repos
  // -----------------------------------------------------------------------

  async insertRepo(repo: RepoRow): Promise<void> {
    const sql = `
      INSERT INTO repos
        (id, github_id, full_name, owner, name, description, html_url,
         stars, forks, language, topics, license, default_branch,
         created_at_github, updated_at_github, category, tags,
         is_favorite, added_at, readme_fetched_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?)
    `;
    this.db.run(sql, [
      repo.id, repo.github_id, repo.full_name, repo.owner, repo.name,
      repo.description, repo.html_url, repo.stars, repo.forks, repo.language,
      repo.topics, repo.license, repo.default_branch,
      repo.created_at_github, repo.updated_at_github, repo.category, repo.tags,
      repo.is_favorite, repo.added_at, repo.readme_fetched_at,
    ]);
    await this.persist();
  }

  async getRepo(id: string): Promise<RepoRow | null> {
    const stmt = this.db.prepare('SELECT * FROM repos WHERE id = ?');
    stmt.bind([id]);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row as unknown as RepoRow | null;
  }

  repoExistsByGithubId(githubId: number): boolean {
    const stmt = this.db.prepare('SELECT 1 FROM repos WHERE github_id = ?');
    stmt.bind([githubId]);
    const exists = !!stmt.step();
    stmt.free();
    return exists;
  }

  async updateRepo(id: string, data: Partial<RepoRow>): Promise<void> {
    const setClauses: string[] = [];
    const values: SqlValue[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (!REPO_UPDATE_COLS.has(key)) continue;
      setClauses.push(`${key} = ?`);
      values.push(value ?? null);
    }
    if (setClauses.length === 0) return;
    values.push(id);
    this.db.run(`UPDATE repos SET ${setClauses.join(', ')} WHERE id = ?`, values);
    await this.persist();
  }

  async deleteRepo(id: string): Promise<void> {
    this.db.run('DELETE FROM repos WHERE id = ?', [id]);
    await this.contentStore.removeDir(`repos/${id}`);
    await this.contentStore.removeDir(`books/by-repo/${id}`);
    await this.persist();
  }

  // -----------------------------------------------------------------------
  // Book generations
  // -----------------------------------------------------------------------

  async upsertBookGen(repoId: string, data: Partial<BookGenRow>): Promise<void> {
    const existing = this.db.prepare('SELECT id FROM book_generations WHERE repo_id = ?');
    existing.bind([repoId]);
    const exists = existing.step();
    existing.free();

    if (exists) {
      const setClauses: string[] = [];
      const values: SqlValue[] = [];
      for (const [key, value] of Object.entries(data)) {
        if (key === 'id' || key === 'repo_id') continue;
        if (!BOOK_GEN_UPDATE_COLS.has(key)) continue;
        setClauses.push(`${key} = ?`);
        values.push(value ?? null);
      }
      values.push(repoId);
      if (setClauses.length > 0) {
        this.db.run(
          `UPDATE book_generations SET ${setClauses.join(', ')} WHERE repo_id = ?`,
          values,
        );
      }
    } else {
      const id = data.id ?? uuid();
      const now = nowISO();
      this.db.run(
        `INSERT INTO book_generations
           (id, repo_id, status, total_chapters, completed_chapters,
            current_phase, outline, error_log, cover_html,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          repoId,
          data.status ?? 'pending',
          data.total_chapters ?? 0,
          data.completed_chapters ?? 0,
          data.current_phase ?? null,
          data.outline ?? null,
          data.error_log ?? null,
          data.cover_html ?? null,
          data.created_at ?? now,
          data.updated_at ?? now,
        ],
      );
    }

    await this.persist();
  }

  async getBookGen(repoId: string): Promise<BookGenRow | null> {
    const stmt = this.db.prepare('SELECT * FROM book_generations WHERE repo_id = ?');
    stmt.bind([repoId]);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row as unknown as BookGenRow | null;
  }

  // -----------------------------------------------------------------------
  // Books list (union of repos + book_generations + imported_books)
  // -----------------------------------------------------------------------

  async getBooks(
    search?: string,
    statuses?: string[],
  ): Promise<BookListItem[]> {
    const conditions: string[] = [];
    const params: SqlValue[] = [];

    if (search) {
      conditions.push('(r.full_name LIKE ? OR r.description LIKE ?)');
      const pattern = `%${search}%`;
      params.push(pattern, pattern);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        r.id                                    AS repo_id,
        COALESCE(bg.id, r.id)                   AS book_id,
        r.full_name                             AS title,
        r.owner                                 AS author,
        r.description,
        r.language,
        r.html_url,
        COALESCE(bg.status, 'no_book')          AS status,
        'github'                                AS source_type,
        ''                                      AS file_type,
        COALESCE(bg.total_chapters, 0)          AS chapter_count,
        bg.completed_chapters,
        bg.current_phase,
        bg.cover_html                           AS cover_html,
        r.added_at                              AS created_at,
        COALESCE(bg.updated_at, r.added_at)     AS updated_at,
        COALESCE(rp.position, 0)                AS progress,
        rp.metadata                             AS progress_metadata,
        rp.updated_at                           AS last_read_at,
        r.category,
        r.tags
      FROM repos r
      LEFT JOIN book_generations bg ON bg.repo_id = r.id
      LEFT JOIN reading_progress rp ON rp.id = (
        SELECT id FROM reading_progress WHERE repo_id = r.id ORDER BY updated_at DESC LIMIT 1
      )
      ${where}
      UNION ALL
      SELECT
        ib.id                                   AS repo_id,
        ib.id                                   AS book_id,
        ib.title,
        ib.author,
        ib.description,
        NULL                                    AS language,
        COALESCE(ib.original_url, '')           AS html_url,
        'imported'                              AS status,
        ib.source_type                          AS source_type,
        ib.file_type,
        0                                       AS chapter_count,
        NULL                                    AS completed_chapters,
        NULL                                    AS current_phase,
        NULL                                    AS cover_html,
        ib.added_at                             AS created_at,
        ib.added_at                             AS updated_at,
        COALESCE(rp2.position, 0)               AS progress,
        rp2.metadata                            AS progress_metadata,
        rp2.updated_at                          AS last_read_at,
        ib.category,
        ib.tags
      FROM imported_books ib
      LEFT JOIN reading_progress rp2 ON rp2.id = (
        SELECT id FROM reading_progress WHERE repo_id = ib.id ORDER BY updated_at DESC LIMIT 1
      )
      ORDER BY created_at DESC
    `;

    const stmt = this.db.prepare(sql);
    if (params.length > 0) stmt.bind(params);

    const rows: BookListItem[] = [];
    while (stmt.step()) {
      const obj = stmt.getAsObject() as Record<string, unknown>;
      rows.push({
        repo_id: obj.repo_id as string,
        book_id: obj.book_id as string,
        title: obj.title as string,
        author: obj.author as string,
        description: (obj.description as string) ?? null,
        language: (obj.language as string) ?? null,
        html_url: obj.html_url as string,
        status: obj.status as string,
        source_type: obj.source_type as string,
        file_type: obj.file_type as string,
        chapter_count: (obj.chapter_count as number) ?? 0,
        completed_chapters: obj.completed_chapters as number | undefined,
        current_phase: obj.current_phase as string | null | undefined,
        created_at: obj.created_at as string | undefined,
        updated_at: obj.updated_at as string | undefined,
        progress: (obj.progress as number) ?? 0,
        progress_metadata: obj.progress_metadata as string | undefined,
        last_read_at: (obj.last_read_at as string) ?? null,
        cover_html: (obj.cover_html as string) ?? null,
        category: obj.category as string | undefined,
        tags: obj.tags as string | undefined,
      });
    }
    stmt.free();

    // If statuses filter provided, apply in-memory
    if (statuses && statuses.length > 0) {
      return rows.filter((r) => statuses.includes(r.status));
    }

    return rows;
  }

  // -----------------------------------------------------------------------
  // Imported books
  // -----------------------------------------------------------------------

  async insertImportedBook(book: ImportedBookRow): Promise<void> {
    this.db.run(
      `INSERT INTO imported_books
         (id, title, author, source_type, file_type, file_path, original_url,
          size_bytes, description, category, tags,
          is_favorite, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        book.id, book.title, book.author, book.source_type, book.file_type,
        book.file_path, book.original_url, book.size_bytes,
        book.description, book.category, book.tags, book.is_favorite, book.added_at,
      ],
    );
    await this.persist();
  }

  async getImportedBook(id: string): Promise<ImportedBookRow | null> {
    const stmt = this.db.prepare('SELECT * FROM imported_books WHERE id = ?');
    stmt.bind([id]);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row as unknown as ImportedBookRow | null;
  }

  async updateImportedBook(id: string, data: Partial<ImportedBookRow>): Promise<void> {
    const setClauses: string[] = [];
    const values: SqlValue[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (key === 'id') continue;
      if (!IMPORTED_BOOK_UPDATE_COLS.has(key)) continue;
      setClauses.push(`${key} = ?`);
      values.push(value ?? null);
    }
    if (setClauses.length === 0) return;
    values.push(id);
    this.db.run(
      `UPDATE imported_books SET ${setClauses.join(', ')} WHERE id = ?`,
      values,
    );
    await this.persist();
  }

  async deleteImportedBook(id: string): Promise<void> {
    this.db.run('DELETE FROM imported_books WHERE id = ?', [id]);
    await this.contentStore.removeDir(`imports/${id}`);
    await this.persist();
  }

  async getImportedBookContent(
    id: string,
  ): Promise<{ html_content: string } | null> {
    const content = await this.contentStore.readFile(`imports/${id}/content.html`);
    if (content) {
      return { html_content: content };
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Book content (by repo — from content_sections)
  // -----------------------------------------------------------------------

  async getBookByRepo(
    repoId: string,
  ): Promise<{ html_content: string } | null> {
    const content = await this.contentStore.readFile(`books/by-repo/${repoId}/content.html`);
    if (content) {
      return { html_content: content };
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Content sections
  // -----------------------------------------------------------------------

  async insertContentSection(section: ContentSectionRow): Promise<void> {
    this.db.run(
      `INSERT INTO content_sections
         (id, repo_id, section_type, title, order_index,
          chapter_number, word_count, status, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        section.id, section.repo_id, section.section_type, section.title,
        section.order_index, section.chapter_number,
        section.word_count, section.status, section.metadata, section.created_at,
      ],
    );
    await this.persist();
  }

  async deleteContentSections(repoId: string, sectionType: string): Promise<void> {
    this.db.run(
      'DELETE FROM content_sections WHERE repo_id = ? AND section_type = ?',
      [repoId, sectionType],
    );
    await this.persist();
  }

  // -----------------------------------------------------------------------
  // Reading progress
  // -----------------------------------------------------------------------

  async upsertReadingProgress(progress: ReadingProgressRow): Promise<void> {
    const stmt = this.db.prepare(
      'SELECT id FROM reading_progress WHERE repo_id = ?',
    );
    stmt.bind([progress.repo_id]);
    const exists = stmt.step();
    stmt.free();

    if (exists) {
      this.db.run(
        `UPDATE reading_progress
         SET section = ?, position = ?, completed = ?, updated_at = ?, metadata = ?
         WHERE repo_id = ?`,
        [
          progress.section ?? null,
          progress.position,
          progress.completed,
          progress.updated_at,
          progress.metadata,
          progress.repo_id,
        ],
      );
    } else {
      this.db.run(
        `INSERT INTO reading_progress
           (id, repo_id, section, position, completed, updated_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          progress.id,
          progress.repo_id,
          progress.section ?? null,
          progress.position,
          progress.completed,
          progress.updated_at,
          progress.metadata,
        ],
      );
    }

    await this.persist();
  }

  async getReadingProgress(
    repoId: string,
  ): Promise<ReadingProgressRow | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM reading_progress WHERE repo_id = ?',
    );
    stmt.bind([repoId]);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row as unknown as ReadingProgressRow | null;
  }

  // -----------------------------------------------------------------------
  // Categories
  // -----------------------------------------------------------------------

  listCategories(): CategoryRow[] {
    const stmt = this.db.prepare("SELECT * FROM categories ORDER BY sort_order, label");
    const rows: CategoryRow[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as CategoryRow);
    }
    stmt.free();
    return rows;
  }

  getCategoryByKey(key: string): CategoryRow | null {
    const stmt = this.db.prepare("SELECT * FROM categories WHERE key = ?");
    stmt.bind([key]);
    const row = stmt.step() ? (stmt.getAsObject() as unknown as CategoryRow) : null;
    stmt.free();
    return row;
  }

  async createCategory(data: {
    label: string;
    icon?: string;
    color?: string;
    sort_order?: number;
  }): Promise<CategoryRow> {
    const label = data.label.trim();
    if (!label) throw new Error("Label must not be empty");

    const key = slugify(label);

    const dupLabel = this.db.prepare("SELECT id FROM categories WHERE LOWER(label) = LOWER(?)");
    dupLabel.bind([label]);
    if (dupLabel.step()) { dupLabel.free(); throw new Error("A category with this name already exists"); }
    dupLabel.free();

    const dupKey = this.db.prepare("SELECT id FROM categories WHERE key = ?");
    dupKey.bind([key]);
    if (dupKey.step()) { dupKey.free(); throw new Error("A category with this name already exists"); }
    dupKey.free();

    const id = uuid();
    const stmtMax = this.db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories");
    stmtMax.step();
    const maxOrder = (stmtMax.getAsObject() as { m: number }).m;
    stmtMax.free();
    const sortOrder = data.sort_order ?? maxOrder + 1;

    const row: CategoryRow = {
      id,
      key,
      label,
      icon: data.icon ?? "BookOpen",
      color: data.color ?? "#c17f3a",
      sort_order: sortOrder,
      is_system: 0,
    };

    this.db.run(
      "INSERT INTO categories (id, key, label, icon, color, sort_order, is_system) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [row.id, row.key, row.label, row.icon, row.color, row.sort_order, row.is_system],
    );
    await this.persist();
    return row;
  }

  async updateCategory(id: string, data: Partial<{
    label: string;
    icon: string;
    color: string;
    sort_order: number;
  }>): Promise<CategoryRow | null> {
    const existing = this.db.prepare("SELECT * FROM categories WHERE id = ?");
    existing.bind([id]);
    if (!existing.step()) { existing.free(); return null; }
    existing.free();

    if (data.label !== undefined) {
      const label = data.label.trim();
      if (!label) throw new Error("Label must not be empty");
      const dupLabel = this.db.prepare(
        "SELECT id FROM categories WHERE LOWER(label) = LOWER(?) AND id != ?",
      );
      dupLabel.bind([label, id]);
      if (dupLabel.step()) { dupLabel.free(); throw new Error("A category with this name already exists"); }
      dupLabel.free();
    }

    const setClauses: string[] = [];
    const values: SqlValue[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (!CATEGORY_UPDATE_COLS.has(key)) continue;
      setClauses.push(`${key} = ?`);
      values.push((value ?? null) as SqlValue);
    }
    if (setClauses.length > 0) {
      values.push(id);
      this.db.run(`UPDATE categories SET ${setClauses.join(", ")} WHERE id = ?`, values);
      await this.persist();
    }

    const updated = this.db.prepare("SELECT * FROM categories WHERE id = ?");
    updated.bind([id]);
    const result = updated.step() ? (updated.getAsObject() as unknown as CategoryRow) : null;
    updated.free();
    return result;
  }

  async deleteCategory(id: string): Promise<void> {
    const existing = this.db.prepare("SELECT * FROM categories WHERE id = ?");
    existing.bind([id]);
    if (!existing.step()) { existing.free(); return; }
    const row = existing.getAsObject() as unknown as CategoryRow;
    existing.free();

    if (row.is_system) throw new Error("System categories cannot be deleted");

    this.db.run("UPDATE repos SET category = 'uncategorized' WHERE category = ?", [row.key]);
    this.db.run("UPDATE imported_books SET category = 'uncategorized' WHERE category = ?", [row.key]);
    this.db.run("DELETE FROM categories WHERE id = ?", [id]);
    await this.persist();
  }

  async deleteBook(repoId: string): Promise<void> {
    this.db.run('DELETE FROM repos WHERE id = ?', [repoId]);
    this.db.run('DELETE FROM book_generations WHERE repo_id = ?', [repoId]);
    this.db.run('DELETE FROM content_sections WHERE repo_id = ?', [repoId]);
    this.db.run('DELETE FROM reading_progress WHERE repo_id = ?', [repoId]);
    this.db.run('DELETE FROM imported_books WHERE id = ?', [repoId]);
    await this.contentStore.removeDir(`repos/${repoId}`);
    await this.contentStore.removeDir(`books/by-repo/${repoId}`);
    await this.contentStore.removeDir(`imports/${repoId}`);
    await this.persist();
  }

  async updateBook(repoId: string, data: Record<string, unknown>): Promise<void> {
    const repoSetClauses: string[] = [];
    const importedSetClauses: string[] = [];
    const repoValues: SqlValue[] = [];
    const importedValues: SqlValue[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (REPO_UPDATE_COLS.has(key)) {
        repoSetClauses.push(`${key} = ?`);
        repoValues.push((value ?? null) as SqlValue);
      }
      if (IMPORTED_BOOK_UPDATE_COLS.has(key)) {
        importedSetClauses.push(`${key} = ?`);
        importedValues.push((value ?? null) as SqlValue);
      }
    }
    if (repoSetClauses.length > 0) {
      repoValues.push(repoId);
      this.db.run(`UPDATE repos SET ${repoSetClauses.join(', ')} WHERE id = ?`, repoValues);
    }
    if (importedSetClauses.length > 0) {
      importedValues.push(repoId);
      this.db.run(`UPDATE imported_books SET ${importedSetClauses.join(', ')} WHERE id = ?`, importedValues);
    }
    await this.persist();
  }
}

const IDB_NAME = "bookshelf";
const IDB_STORE = "files";
const IDB_KEY = "reader.db";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToIdb(data: Uint8Array): Promise<void> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(data as unknown as Blob, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadFromIdb(): Promise<Uint8Array | null> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function saveToOpfs(data: Uint8Array): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const fh = await root.getFileHandle('reader.db', { create: true });
  const w = await fh.createWritable();
  await w.write(new Blob([data as BlobPart]));
  await w.close();
}

async function loadFromOpfs(): Promise<Uint8Array | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle('reader.db');
    const file = await fh.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

function makePersistFn(getDb: () => SqlJsDatabase): () => Promise<void> {
  return async () => {
    const data = new Uint8Array(getDb().export());
    try {
      await saveToOpfs(data);
      return;
    } catch { /* OPFS unavailable, try IndexedDB */ }
    try {
      await saveToIdb(data);
    } catch (e) {
      console.warn("DB persist to IndexedDB also failed:", e);
    }
  };
}

async function loadDb(): Promise<Uint8Array | null> {
  const opfs = await loadFromOpfs();
  if (opfs) return opfs;
  try { return await loadFromIdb(); } catch { return null; }
}
