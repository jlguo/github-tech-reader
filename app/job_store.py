"""
SQLite-backed async job store for analysis job lifecycle management.

Provides CRUD operations for tracking analysis jobs through their
``pending → running → done/error`` lifecycle.  Uses **aiosqlite** for
non-blocking database access (safe to call from async FastAPI routes).

Database
--------
Path: ``app/jobs.db`` (gitignored, created automatically on first use).

Table ``jobs`` columns
----------------------
- ``id`` (TEXT PK)      – UUID v4 job identifier
- ``status`` (TEXT)     – One of pending / running / done / error
- ``progress`` (INT)    – 0..100
- ``repo_url`` (TEXT)   – GitHub URL under analysis
- ``provider`` (TEXT)   – LLM provider (openai / ollama / deepseek)
- ``no_llm`` (INT)      – 0/1 flag
- ``no_cache`` (INT)    – 0/1 flag
- ``limit_amount`` (INT) – Iteration limit (NULL if none)
- ``report_path`` (TEXT) – Absolute path to generated report
- ``error`` (TEXT)       – Error message (NULL if no error)
- ``created_at`` (TEXT)  – ISO-8601 timestamp
- ``updated_at`` (TEXT)  – ISO-8601 timestamp
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import UTC, datetime

import aiosqlite

logger = logging.getLogger(__name__)

# Absolute path to the SQLite database file.
DB_PATH: str = os.path.join(os.path.dirname(os.path.abspath(__file__)), "jobs.db")

_init_lock = asyncio.Lock()
_init_done: bool = False

_CREATE_TABLE_SQL: str = """
CREATE TABLE IF NOT EXISTS jobs (
    id           TEXT PRIMARY KEY,
    status       TEXT    NOT NULL DEFAULT 'pending',
    progress     INTEGER NOT NULL DEFAULT 0,
    repo_url     TEXT    NOT NULL,
    provider     TEXT    NOT NULL DEFAULT 'deepseek',
    no_llm       INTEGER NOT NULL DEFAULT 0,
    no_cache     INTEGER NOT NULL DEFAULT 0,
    limit_amount INTEGER,
    report_path  TEXT,
    error        TEXT,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
)
"""


async def init_db() -> None:
    """Create the jobs table if it does not exist.

    Safe to call multiple times – uses ``CREATE TABLE IF NOT EXISTS``.
    Should be called once during application startup.
    """
    global _init_done
    async with _init_lock:
        if _init_done:
            return
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(_CREATE_TABLE_SQL)
            await db.commit()
        _init_done = True
    logger.info("Job store initialised at %s", DB_PATH)


async def _ensure_init() -> None:
    """Ensure the database table exists, initialising lazily if needed."""
    if not _init_done:
        await init_db()


async def create_job(
    repo_url: str,
    provider: str = "deepseek",
    no_llm: bool = False,
    no_cache: bool = False,
    limit: int | None = None,
) -> str:
    """Persist a new analysis job and return its UUID.

    Args:
        repo_url: GitHub repository URL.
        provider: LLM provider key (``openai`` / ``ollama`` / ``deepseek``).
        no_llm: If ``True``, generate mock analysis data instead of calling LLM.
        no_cache: If ``True``, skip LLM result cache.
        limit: Optional iteration count limit.

    Returns:
        The UUID v4 string assigned to the new job.
    """
    await _ensure_init()
    job_id: str = str(uuid.uuid4())
    now: str = datetime.now(UTC).isoformat()

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO jobs (id, status, progress, repo_url, provider,
                                 no_llm, no_cache, limit_amount, created_at, updated_at)
               VALUES (?, 'pending', 0, ?, ?, ?, ?, ?, ?, ?)""",
            (
                job_id,
                repo_url,
                provider,
                int(no_llm),
                int(no_cache),
                limit,
                now,
                now,
            ),
        )
        await db.commit()

    logger.info("Created job %s for %s", job_id, repo_url)
    return job_id


async def update_job(
    job_id: str,
    *,
    status: str | None = None,
    progress: int | None = None,
    report_path: str | None = None,
    error: str | None = None,
) -> None:
    """Update one or more fields on an existing job.

    Only non-``None`` parameters are written; others are left unchanged.
    The ``updated_at`` timestamp is always bumped to now.

    Args:
        job_id: The job to update.
        status: New status (``pending`` / ``running`` / ``done`` / ``error``).
        progress: Completion percentage (0–100).
        report_path: Absolute path to the generated report.
        error: Error message when status is ``error``.
    """
    await _ensure_init()
    now: str = datetime.now(UTC).isoformat()
    fields: list[str] = []
    values: list[str | int | None] = []

    if status is not None:
        fields.append("status = ?")
        values.append(status)
    if progress is not None:
        fields.append("progress = ?")
        values.append(progress)
    if report_path is not None:
        fields.append("report_path = ?")
        values.append(report_path)
    if error is not None:
        fields.append("error = ?")
        values.append(error)

    fields.append("updated_at = ?")
    values.append(now)
    values.append(job_id)

    sql: str = f"UPDATE jobs SET {', '.join(fields)} WHERE id = ?"
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(sql, values)
        await db.commit()

    logger.debug("Updated job %s: %s", job_id, {f.split(" =")[0]: v for f, v in zip(fields, values[:-1], strict=False)})


async def get_job(job_id: str) -> dict | None:
    """Retrieve a single job by its UUID.

    Args:
        job_id: The job UUID.

    Returns:
        A dictionary of column names → values, or ``None`` if not found.
    """
    await _ensure_init()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        row = await cursor.fetchone()

    if row is None:
        return None
    return dict(row)


async def list_jobs(limit: int = 50) -> list[dict]:
    """Return the most recent jobs, newest first.

    Args:
        limit: Maximum number of jobs to return (default 50).

    Returns:
        A list of job dictionaries ordered by ``created_at DESC``.
    """
    await _ensure_init()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?",
            (limit,),
        )
        rows = await cursor.fetchall()

    return [dict(row) for row in rows]
