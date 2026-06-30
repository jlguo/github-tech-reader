"""Shared helpers for book generation across agents.py and youtube.py.

Eliminates duplicated SSE streaming + status updater code.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.database import async_session
from app.models.repo import BookGeneration
from app.core.events import publish, subscribe, unsubscribe


async def status_updater(repo_id: str):
    """Factory that returns an async `update(status, ...)` callable.

    Each call persists the new status to the DB and publishes an SSE event
    so the frontend can live-track generation progress.
    """
    async def update(
        status: str,
        total_chapters: int = 0,
        completed_chapters: int = 0,
        phase: str | None = None,
        outline: list[dict] | None = None,
        phase_items_total: int = 0,
        phase_items_completed: int = 0,
    ):
        async with async_session() as session:
            result = await session.execute(
                select(BookGeneration).where(BookGeneration.repo_id == repo_id)
            )
            gen = result.scalar()
            if gen:
                gen.status = status
                gen.current_phase = phase
                if total_chapters:
                    gen.total_chapters = total_chapters
                if completed_chapters:
                    gen.completed_chapters = completed_chapters
                if phase_items_total is not None:
                    gen.phase_items_total = phase_items_total
                if phase_items_completed is not None:
                    gen.phase_items_completed = phase_items_completed
                if outline is not None:
                    gen.outline = {"chapters": outline}
                gen.updated_at = datetime.now(timezone.utc)
                await session.commit()

        gen_total = gen.total_chapters if gen else total_chapters
        gen_completed = gen.completed_chapters if gen else completed_chapters
        gen_phase_total = gen.phase_items_total if gen else phase_items_total
        gen_phase_completed = gen.phase_items_completed if gen else phase_items_completed

        await publish(repo_id, {
            "status": status,
            "current_phase": phase,
            "total_chapters": gen_total,
            "completed_chapters": gen_completed,
            "phase_items_total": gen_phase_total,
            "phase_items_completed": gen_phase_completed,
        })

    return update


async def book_status_stream(repo_id: str, request):
    """Yield SSE text/event-stream lines for the given repo_id.

    Yields the current DB state first, then subscribes to the in-process
    event broker and forwards status updates until the client disconnects
    or the generation reaches a terminal state.
    """
    subscription_queue = await subscribe(repo_id)
    try:
        async with async_session() as session:
            result = await session.execute(
                select(BookGeneration).where(BookGeneration.repo_id == repo_id)
            )
            gen = result.scalar()
            if gen:
                payload = json.dumps({
                    "status": gen.status,
                    "current_phase": gen.current_phase,
                    "total_chapters": gen.total_chapters,
                    "completed_chapters": gen.completed_chapters,
                })
                yield f"data: {payload}\n\n"

        while True:
            if await request.is_disconnected():
                break
            try:
                message = await asyncio.wait_for(subscription_queue.get(), timeout=25)
                yield f"data: {message}\n\n"
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
    finally:
        unsubscribe(repo_id, subscription_queue)
