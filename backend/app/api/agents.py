from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from datetime import datetime

from app.core.database import get_db, async_session
from app.models.repo import Repo, ContentSection, BookGeneration
from app.api.schemas import BookGenerationStatusResponse
from app.agents.crew import generate_book_cover, generate_book_content

router = APIRouter()


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
                gen.updated_at = datetime.utcnow()
                await session.commit()
    return update


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

    if not repo.readme_content:
        raise HTTPException(status_code=400, detail="Fetch README first")

    existing = await db.execute(
        select(BookGeneration).where(BookGeneration.repo_id == repo_id)
    )
    gen = existing.scalar()
    if gen and gen.status in ("pending", "fetching", "planning", "cover", "writing", "reviewing", "publishing"):
        raise HTTPException(status_code=409, detail="Book generation already in progress")

    if gen:
        gen.status = "pending"
        gen.current_phase = None
        gen.total_chapters = 0
        gen.completed_chapters = 0
        gen.error_log = None
        gen.html_output = None
        gen.cover_html = None
        gen.updated_at = datetime.utcnow()
    else:
        gen = BookGeneration(repo_id=repo_id, status="pending")
        db.add(gen)
    await db.commit()

    background_tasks.add_task(
        _run_book_pipeline,
        repo_id=repo_id,
        repo_name=repo.full_name,
        repo_description=repo.description or "",
        readme_content=repo.readme_content,
    )

    return {"status": "started", "repo_id": repo_id}


async def _run_book_pipeline(
    repo_id: str,
    repo_name: str,
    repo_description: str,
    readme_content: str,
):
    update_status = await _status_updater(repo_id)

    try:
        cover_result = await generate_book_cover(
            repo_id, repo_name, repo_description, readme_content, update_status
        )

        outline = cover_result["outline"]
        snapshot = cover_result["snapshot"]
        cover_html = cover_result["cover_html"]

        async with async_session() as session:
            gen_result = await session.execute(
                select(BookGeneration).where(BookGeneration.repo_id == repo_id)
            )
            gen = gen_result.scalar()
            if gen:
                gen.status = "writing"
                gen.current_phase = "writing"
                gen.total_chapters = len(outline)
                gen.cover_html = cover_html
                gen.outline = {"chapters": outline}
                gen.updated_at = datetime.utcnow()
                await session.commit()

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
                gen.html_output = html
                gen.current_phase = "done"
                gen.updated_at = datetime.utcnow()

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
                    content=ch["content"],
                    order_index=ch["number"],
                    chapter_number=ch["number"],
                    word_count=ch.get("word_count", 0),
                    status="approved",
                )
                session.add(section)

            await session.commit()

    except Exception as e:
        async with async_session() as session:
            gen_result = await session.execute(
                select(BookGeneration).where(BookGeneration.repo_id == repo_id)
            )
            gen = gen_result.scalar()
            if gen:
                gen.status = "failed"
                gen.error_log = str(e)
                gen.updated_at = datetime.utcnow()
                await session.commit()


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
            updated_at=datetime.utcnow(),
        )
    return gen
