from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from datetime import datetime, timezone

from app.core.database import get_db, async_session
from app.models.repo import Repo, ContentSection, BookGeneration
from app.api.schemas import BookGenerationStatusResponse
from app.agents.crew import generate_book_cover, generate_book_content
from app.core.events import publish
from app.services.file_storage import (
    load_readme, save_cover_html, save_book_html, save_chapter, save_outline,
    delete_book_content,
)
from app.services.book_generation import status_updater, book_status_stream

router = APIRouter()


@router.post("/generate-book/{repo_id}")
async def start_book_generation(
    repo_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Repo).where(Repo.id == repo_id))
    repo = result.scalar()
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")

    readme_content = load_readme(repo.id)
    if not readme_content:
        raise HTTPException(status_code=400, detail="Fetch README first")

    existing = await db.execute(
        select(BookGeneration).where(BookGeneration.repo_id == repo_id)
    )
    existing_gen = existing.scalar()
    if existing_gen and existing_gen.status in ("pending", "fetching", "planning", "cover", "writing", "reviewing", "publishing"):
        raise HTTPException(status_code=409, detail="Book generation already in progress")

    if existing_gen:
        gen = existing_gen
        gen.status = "pending"
        gen.current_phase = None
        gen.total_chapters = 0
        gen.completed_chapters = 0
        gen.error_log = None
        gen.updated_at = datetime.now(timezone.utc)
    else:
        gen = BookGeneration(repo_id=repo_id, status="pending")
        db.add(gen)
    await db.commit()

    background_tasks.add_task(
        _run_book_pipeline,
        repo_id=repo_id,
        repo_name=repo.full_name,
        repo_description=repo.description or "",
        readme_content=readme_content,
    )

    return {"status": "started", "repo_id": repo_id}


async def _run_book_pipeline(
    repo_id: str,
    repo_name: str,
    repo_description: str,
    readme_content: str,
):
    update_status = await status_updater(repo_id)

    try:
        cover_result = await generate_book_cover(
            repo_id, repo_name, repo_description, readme_content, update_status
        )

        outline = cover_result["outline"]
        snapshot = cover_result["snapshot"]
        cover_html = cover_result["cover_html"]
        cover_image_path = cover_result.get("cover_image_path")

        async with async_session() as session:
            gen_result = await session.execute(
                select(BookGeneration).where(BookGeneration.repo_id == repo_id)
            )
            gen = gen_result.scalar()
            if gen:
                gen.status = "writing"
                gen.current_phase = "writing"
                gen.total_chapters = len(outline)
                gen.outline = {"chapters": outline}
                if cover_image_path:
                    gen.cover_path = cover_image_path
                gen.updated_at = datetime.now(timezone.utc)
                await session.commit()

            save_cover_html(gen.id, cover_html)
            save_outline(gen.id, {"chapters": outline})

        await publish(repo_id, {
            "status": "writing",
            "current_phase": "writing",
            "total_chapters": len(outline),
            "completed_chapters": 0,
        })

        content_result = await generate_book_content(
            repo_name, outline, snapshot, update_status
        )

        chapters = content_result["chapters"]
        html = content_result["html"]

        async with async_session() as session:
            gen_result = await session.execute(
                select(BookGeneration).where(BookGeneration.repo_id == repo_id)
            )
            gen = gen_result.scalar()
            if gen:
                gen.status = "done"
                gen.completed_chapters = len(chapters)
                gen.current_phase = "done"
                gen.updated_at = datetime.now(timezone.utc)

            await session.execute(
                delete(ContentSection).where(
                    ContentSection.repo_id == repo_id,
                    ContentSection.section_type == "book_chapter",
                )
            )

            for ch in chapters:
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

            for ch in chapters:
                save_chapter(gen.id, ch["number"], ch["content"])
            save_book_html(gen.id, html)

        await publish(repo_id, {
            "status": "done",
            "current_phase": "done",
            "total_chapters": len(outline),
            "completed_chapters": len(chapters),
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

        await publish(repo_id, {
            "status": "failed",
            "current_phase": None,
            "total_chapters": 0,
            "completed_chapters": 0,
        })


@router.get("/book-status/{repo_id}", response_model=BookGenerationStatusResponse)
async def get_book_status(repo_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BookGeneration).where(BookGeneration.repo_id == repo_id)
    )
    gen = result.scalar()
    if not gen:
        return BookGenerationStatusResponse(
            repo_id=repo_id,
            status="not_started",
            current_phase=None,
            total_chapters=0,
            completed_chapters=0,
            error_log=None,
            updated_at=datetime.now(timezone.utc),
        )
    return gen


@router.get("/book-status/{repo_id}/stream")
async def stream_book_status(repo_id: str, request: Request):
    return StreamingResponse(
        book_status_stream(repo_id, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
