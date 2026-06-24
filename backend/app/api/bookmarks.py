from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.database import get_db
from app.api.schemas import BookmarkCreateRequest, BookmarkResponse
from app.models.bookmark import Bookmark

router = APIRouter()


@router.get("/{book_id}", response_model=list[BookmarkResponse])
async def list_bookmarks(book_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Bookmark)
        .where(Bookmark.book_id == book_id)
        .order_by(Bookmark.created_at.desc())
    )
    items = result.scalars().all()
    return [BookmarkResponse.model_validate(b) for b in items]


@router.post("/", response_model=BookmarkResponse)
async def create_bookmark(body: BookmarkCreateRequest, db: AsyncSession = Depends(get_db)):
    bookmark = Bookmark(
        book_id=body.book_id,
        label=body.label,
        anchor=body.anchor,
    )
    db.add(bookmark)
    await db.commit()
    await db.refresh(bookmark)
    return BookmarkResponse.model_validate(bookmark)


@router.delete("/{bookmark_id}")
async def delete_bookmark(bookmark_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Bookmark).where(Bookmark.id == bookmark_id))
    bookmark = result.scalar()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    await db.delete(bookmark)
    await db.commit()
    return {"ok": True}
