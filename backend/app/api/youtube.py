import uuid
import asyncio
import json
import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.database import get_db, async_session
from app.models.repo import Repo, BookGeneration, ContentSection
from app.api.schemas import BookGenerationStatusResponse
from app.agents.crew import generate_book_plan, generate_book_content
from app.events import publish, subscribe, unsubscribe
from app.services.youtube import (
    extract_video_id,
    extract_transcript,
    format_transcript_snapshot,
    determine_chapter_count_from_transcript,
    fetch_video_title,
)
from app.services.file_storage import save_cover_html, save_book_html, save_chapter, save_outline

router = APIRouter()


class YouTubeBookRequest(BaseModel):
    url: str = ""
    repo_id: str = ""


async def _status_updater(repo_id: str):
    async def update(
        status: str,
        total_chapters: int = 0,
        completed_chapters: int = 0,
        phase: str | None = None,
        outline: list[dict] | None = None,
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
                if outline is not None:
                    gen.outline = {"chapters": outline}
                gen.updated_at = datetime.now(timezone.utc)
                await session.commit()

        await publish(repo_id, {
            "status": status,
            "current_phase": phase,
            "total_chapters": gen.total_chapters if gen else total_chapters,
            "completed_chapters": gen.completed_chapters if gen else completed_chapters,
        })
    return update


@router.post("/generate-book")
async def start_youtube_book_generation(
    request: YouTubeBookRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    url = request.url
    if request.repo_id and not url:
        repo_result = await db.execute(select(Repo).where(Repo.id == request.repo_id))
        repo = repo_result.scalar()
        if not repo or repo.source_type != "youtube":
            raise HTTPException(status_code=404, detail="YouTube book not found")
        url = repo.html_url

    if not url:
        raise HTTPException(status_code=400, detail="Either url or repo_id is required")

    video_id = extract_video_id(url)
    video_title = await fetch_video_title(video_id)

    # Check for existing generation
    existing = await db.execute(
        select(BookGeneration)
        .join(Repo, BookGeneration.repo_id == Repo.id)
        .where(Repo.html_url == f"https://www.youtube.com/watch?v={video_id}")
    )
    existing_gen = existing.scalar()
    if existing_gen and existing_gen.status in (
        "pending", "fetching", "planning", "cover", "writing", "reviewing", "publishing"
    ):
        raise HTTPException(status_code=409, detail="Book generation already in progress")

    if existing_gen:
        gen = existing_gen
        repo_result = await db.execute(select(Repo).where(Repo.id == gen.repo_id))
        repo = repo_result.scalar()

        # Fix title for books created before the video_title fix
        if repo.name == video_id and video_title != video_id:
            repo.name = video_title
            repo.full_name = f"youtube:{video_title}"

        # URL import of an already-finished book: skip regeneration. An explicit
        # regenerate-from-shelf request (repo_id set) still falls through and re-runs.
        if existing_gen.status == "done" and not request.repo_id:
            await db.commit()
            return {
                "status": "already_done",
                "repo_id": repo.id,
                "video_id": video_id,
                "video_title": video_title,
            }

        # Allow regeneration — reset and re-run regardless of current status
        gen.status = "pending"
        gen.current_phase = None
        gen.total_chapters = 0
        gen.completed_chapters = 0
        gen.error_log = None
        gen.updated_at = datetime.now(timezone.utc)
    else:
        # Reuse existing repo if caller provided one, otherwise create new
        repo = None
        if request.repo_id:
            existing_repo = await db.execute(select(Repo).where(Repo.id == request.repo_id))
            repo = existing_repo.scalar()
        if not repo:
            repo = Repo(
                id=str(uuid.uuid4()),
                github_id=int.from_bytes(hashlib.sha256(video_id.encode()).digest()[:4], "big"),
                full_name=f"youtube:{video_title}",
                owner="YouTube",
                name=video_title,
                html_url=f"https://www.youtube.com/watch?v={video_id}",
                category="youtube",
                source_type="youtube",
                language="zh",
                tags=["视频"],
            )
            db.add(repo)
        gen = BookGeneration(repo_id=repo.id, status="pending")
        db.add(gen)

    await db.commit()
    await db.refresh(gen)

    background_tasks.add_task(
        _run_youtube_pipeline,
        repo_id=repo.id,
        video_id=video_id,
        video_url=url,
    )

    return {"status": "started", "repo_id": repo.id, "video_id": video_id, "video_title": video_title}


async def _run_youtube_pipeline(repo_id: str, video_id: str, video_url: str):
    update_status = await _status_updater(repo_id)

    try:
        await update_status("fetching", phase="extracting_transcript")

        transcript_data = await extract_transcript(video_id)
        transcript_text = transcript_data["transcript_text"]

        video_title = await fetch_video_title(video_id)
        channel_name = "YouTube"
        content_description = (
            f"A YouTube video ({video_id}) transcript converted into a structured book. "
            f"Original URL: {video_url}"
        )

        snapshot = format_transcript_snapshot(transcript_data, video_title, channel_name)
        chapter_count = determine_chapter_count_from_transcript(
            transcript_text, len(transcript_data["segments"])
        )

        await update_status("planning", total_chapters=chapter_count, phase="planning")
        outline = await generate_book_plan(
            content_title=video_title,
            content_description=content_description,
            chapter_count=chapter_count,
            snapshot=snapshot,
        )

        chapter_count = len(outline)

        async with async_session() as session:
            gen_result = await session.execute(
                select(BookGeneration).where(BookGeneration.repo_id == repo_id)
            )
            gen = gen_result.scalar()
            if gen:
                gen.status = "writing"
                gen.current_phase = "writing"
                gen.total_chapters = chapter_count
                gen.outline = {"chapters": outline}
                gen.updated_at = datetime.now(timezone.utc)
                await session.commit()
                save_outline(gen.id, {"chapters": outline})

        result = await generate_book_content(
            repo_name=video_title,
            outline=outline,
            snapshot=snapshot,
            status_updater=update_status,
        )

        async with async_session() as session:
            gen_result = await session.execute(
                select(BookGeneration).where(BookGeneration.repo_id == repo_id)
            )
            gen = gen_result.scalar()
            if not gen:
                return

            gen.status = "done"
            gen.completed_chapters = len(result["chapters"])
            gen.current_phase = "done"
            gen.updated_at = datetime.now(timezone.utc)

            await session.execute(
                delete(ContentSection).where(
                    ContentSection.repo_id == repo_id,
                    ContentSection.section_type == "book_chapter",
                )
            )

            for ch in result["chapters"]:
                section = ContentSection(
                    repo_id=repo_id,
                    section_type="book_chapter",
                    title=ch["title"],
                    order_index=ch["number"],
                    chapter_number=ch["number"],
                    word_count=ch.get("word_count", 0),
                    status="approved",
                )
                session.add(section)

            await session.commit()

            save_book_html(gen.id, result["html"])
            for ch in result["chapters"]:
                save_chapter(gen.id, ch["number"], ch["content"])

        await publish(repo_id, {
            "status": "done",
            "current_phase": "done",
            "total_chapters": chapter_count,
            "completed_chapters": len(result["chapters"]),
        })

    except Exception as e:
        async with async_session() as session:
            gen_result = await session.execute(
                select(BookGeneration).where(BookGeneration.repo_id == repo_id)
            )
            gen = gen_result.scalar()
            if gen:
                gen.status = "failed"
                gen.error_log = str(e)
                gen.updated_at = datetime.now(timezone.utc)
                await session.commit()

        await publish(repo_id, {"status": "failed", "error": str(e)})


@router.get("/book-status/{repo_id}", response_model=BookGenerationStatusResponse)
async def get_youtube_book_status(
    repo_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BookGeneration).where(BookGeneration.repo_id == repo_id)
    )
    gen = result.scalar()
    if not gen:
        raise HTTPException(status_code=404, detail="Book generation not found")

    return BookGenerationStatusResponse(
        repo_id=gen.repo_id,
        status=gen.status,
        current_phase=gen.current_phase,
        total_chapters=gen.total_chapters,
        completed_chapters=gen.completed_chapters,
        error_log=gen.error_log,
        updated_at=gen.updated_at,
    )


@router.get("/book-status/{repo_id}/stream")
async def stream_youtube_book_status(repo_id: str, request: Request):
    subscription_queue = await subscribe(repo_id)

    async def event_generator():
        try:
            async with async_session() as session:
                result = await session.execute(
                    select(BookGeneration).where(BookGeneration.repo_id == repo_id)
                )
                gen = result.scalar()
                if gen:
                    yield f"data: {json.dumps({
                        'status': gen.status,
                        'current_phase': gen.current_phase,
                        'total_chapters': gen.total_chapters,
                        'completed_chapters': gen.completed_chapters,
                    })}\n\n"

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

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
