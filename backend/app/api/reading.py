from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.api.schemas import ProgressUpdateRequest, ProgressResponse
from app.models.repo import Repo, ReadingProgress

router = APIRouter()


@router.get("/progress/{repo_id}", response_model=list[ProgressResponse])
async def get_progress(repo_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ReadingProgress)
        .where(ReadingProgress.repo_id == repo_id)
        .order_by(ReadingProgress.updated_at.desc())
    )
    items = result.scalars().all()
    return [
        ProgressResponse(
            id=p.id,
            section=p.section,
            position=p.position,
            completed=p.completed,
            updated_at=p.updated_at,
        )
        for p in items
    ]


@router.post("/progress", response_model=ProgressResponse)
async def update_progress(body: ProgressUpdateRequest, db: AsyncSession = Depends(get_db)):
    repo = (await db.execute(select(Repo).where(Repo.id == body.repo_id))).scalar()
    if not repo:
        # Check for ImportedBook (file/url imports)
        from app.models.imported_book import ImportedBook
        imported_result = await db.execute(select(ImportedBook).where(ImportedBook.id == body.repo_id))
        imported = imported_result.scalar()
        if imported:
            imported.progress_position = body.position
            imported.progress_updated_at = datetime.now(timezone.utc)
            await db.commit()
            return ProgressResponse(
                id=imported.id,
                section=body.section,
                position=body.position,
                completed=body.completed,
                updated_at=imported.progress_updated_at,
            )
        raise HTTPException(status_code=404, detail="Book not found")

    stmt = select(ReadingProgress).where(
        ReadingProgress.repo_id == body.repo_id,
        ReadingProgress.section == body.section,
    )
    existing = (await db.execute(stmt)).scalar()

    if existing:
        existing.position = body.position
        existing.completed = body.completed
        progress = existing
    else:
        progress = ReadingProgress(
            repo_id=body.repo_id,
            section=body.section,
            position=body.position,
            completed=body.completed,
        )
        db.add(progress)

    await db.commit()
    await db.refresh(progress)
    return ProgressResponse(
        id=progress.id,
        section=progress.section,
        position=progress.position,
        completed=progress.completed,
        updated_at=progress.updated_at,
    )
