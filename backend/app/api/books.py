import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.repo import Repo, BookGeneration, ContentSection, ReadingProgress
from app.models.imported_book import ImportedBook
from app.api.schemas import BookListItem, BookContentResponse, SectionResponse, BookUpdateRequest
from app.services.file_storage import (
    load_book_html, load_cover_html, load_chapter,
    load_import_content, delete_book_content, delete_import_content,
)

_COVERS_DIR = Path(__file__).parent.parent.parent / "data" / "covers"

router = APIRouter()


@router.get("/books", response_model=list[BookListItem])
async def list_books(
    status: str | None = Query(default=None, description="Filter by status (comma-separated, e.g. 'writing,done')"),
    search: str | None = Query(default=None, description="Search in title, author, description"),
    limit: int = Query(default=50, ge=1, le=500, description="Max books to return"),
    offset: int = Query(default=0, ge=0, description="Number of books to skip"),
    db: AsyncSession = Depends(get_db),
):
    statuses = (
        [s.strip() for s in status.split(",") if s.strip()]
        if status
        else ["pending", "fetching", "planning", "cover", "writing", "reviewing", "publishing", "done", "ready"]
    )

    like = f"%{search}%" if search else ""

    query = (
        select(Repo, BookGeneration)
        .outerjoin(BookGeneration, BookGeneration.repo_id == Repo.id)
        .options(selectinload(Repo.reading_progress))
    )

    if search:
        query = query.where(
            (Repo.name.ilike(like)) | (Repo.owner.ilike(like)) | (Repo.description.ilike(like))
        )

    query = query.order_by(Repo.added_at.desc()).limit(limit).offset(offset)

    result = await db.execute(query)
    rows = result.all()
    books = []
    for repo, gen in rows:
        is_book = gen is not None and gen.status in statuses
        latest_progress = None
        if repo.reading_progress:
            latest_progress = max(repo.reading_progress, key=lambda p: p.updated_at)
        cover_url = f"/api/books/{gen.id}/cover" if gen and gen.cover_path else None
        books.append(BookListItem(
            repo_id=repo.id,
            book_id=gen.id if gen else "",
            title=repo.name,
            author=repo.owner,
            description=repo.description,
            language=repo.language,
            html_url=repo.html_url,
            status=gen.status if is_book else "no_book",
            source_type=repo.source_type,
            file_type="html",
            category=repo.category or "uncategorized",
            tags=repo.tags or [],
            chapter_count=gen.total_chapters if gen else 0,
            completed_chapters=gen.completed_chapters if gen else 0,
            current_phase=gen.current_phase if gen else None,
            progress=latest_progress.position if latest_progress else None,
            progress_metadata=None,
            last_read_at=latest_progress.updated_at if latest_progress else None,
            cover_url=cover_url,
            created_at=gen.created_at if gen else repo.added_at,
            updated_at=gen.updated_at if gen else repo.added_at,
        ))

    imported_query = select(ImportedBook)
    if search:
        imported_query = imported_query.where(
            (ImportedBook.title.ilike(like)) | (ImportedBook.author.ilike(like))
        )
    imported_query = imported_query.order_by(ImportedBook.added_at.desc())
    imported_result = await db.execute(imported_query)
    for imported_book in imported_result.scalars():
        cover_url = f"/api/books/{imported_book.id}/cover" if imported_book.cover_path else None
        books.append(BookListItem(
            repo_id=imported_book.id,
            book_id=imported_book.id,
            title=imported_book.title,
            author=imported_book.author,
            description=imported_book.description,
            language=None,
            html_url=imported_book.original_url or "",
            status="ready",
            source_type=imported_book.source_type,
            file_type=imported_book.file_type,
            category=imported_book.category or "uncategorized",
            tags=imported_book.tags or [],
            chapter_count=0,
            completed_chapters=0,
            progress=imported_book.progress_position if imported_book.progress_position else None,
            last_read_at=imported_book.progress_updated_at,
            cover_url=cover_url,
            created_at=imported_book.added_at,
            updated_at=imported_book.progress_updated_at or imported_book.added_at,
        ))

    return books


@router.get("/books/{book_id}", response_model=BookContentResponse)
async def get_book_content(book_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BookGeneration)
        .options(selectinload(BookGeneration.repo))
        .where(BookGeneration.id == book_id)
    )
    gen = result.scalar()
    if gen:
        chapters_result = await db.execute(
            select(ContentSection)
            .where(
                ContentSection.repo_id == gen.repo_id,
                ContentSection.section_type == "book_chapter",
            )
            .order_by(ContentSection.chapter_number)
        )
        chapters = chapters_result.scalars().all()
        return BookContentResponse(
            book_id=gen.id,
            title=gen.repo.name if gen.repo else "Unknown",
            html_content=load_book_html(gen.id) or "",
            cover_html=load_cover_html(gen.id),
            cover_url=f"/api/books/{gen.id}/cover" if gen.cover_path else None,
            chapters=[
                SectionResponse(
                    id=ch.id, section_type=ch.section_type,
                    title=ch.title, content=load_chapter(gen.id, ch.chapter_number or 0) or "",
                    order_index=ch.order_index,
                    metadata_=ch.metadata_, created_at=ch.created_at,
                )
                for ch in chapters
            ],
        )

    imported_result = await db.execute(
        select(ImportedBook).where(ImportedBook.id == book_id)
    )
    imported = imported_result.scalar()
    if imported:
        return BookContentResponse(
            book_id=imported.id,
            title=imported.title,
            html_content=load_import_content(imported.id) or "",
            cover_html=None,
            cover_url=f"/api/books/{imported.id}/cover" if imported.cover_path else None,
            chapters=[],
        )

    raise HTTPException(status_code=404, detail="Book not found")


@router.get("/books/by-repo/{repo_id}", response_model=BookContentResponse)
async def get_book_by_repo(repo_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BookGeneration)
        .options(selectinload(BookGeneration.repo))
        .where(BookGeneration.repo_id == repo_id, BookGeneration.status == "done")
        .order_by(BookGeneration.updated_at.desc())
    )
    gen = result.scalar()
    if not gen:
        raise HTTPException(status_code=404, detail="Book not found")

    chapters_result = await db.execute(
        select(ContentSection)
        .where(
            ContentSection.repo_id == gen.repo_id,
            ContentSection.section_type == "book_chapter",
        )
        .order_by(ContentSection.chapter_number)
    )
    chapters = chapters_result.scalars().all()

    return BookContentResponse(
        book_id=gen.id,
        title=gen.repo.name if gen.repo else "Unknown",
        html_content=load_book_html(gen.id) or "",
        cover_html=load_cover_html(gen.id),
        cover_url=f"/api/books/{gen.id}/cover" if gen.cover_path else None,
        chapters=[
            SectionResponse(
                id=ch.id,
                section_type=ch.section_type,
                title=ch.title,
                content=load_chapter(gen.id, ch.chapter_number or 0) or "",
                order_index=ch.order_index,
                metadata_=ch.metadata_,
                created_at=ch.created_at,
            )
            for ch in chapters
        ],
    )


@router.get("/books/{book_id}/cover")
async def get_book_cover(book_id: str, db: AsyncSession = Depends(get_db)):
    """Serve the cover PNG for any book (generated or imported)."""
    gen_result = await db.execute(
        select(BookGeneration).where(BookGeneration.id == book_id)
    )
    gen = gen_result.scalar()
    if gen and gen.cover_path:
        cover_path = Path(gen.cover_path)
        if cover_path.is_file():
            return FileResponse(
                str(cover_path),
                media_type="image/png",
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "X-Content-Type-Options": "nosniff",
                },
            )

    imp_result = await db.execute(
        select(ImportedBook).where(ImportedBook.id == book_id)
    )
    imp = imp_result.scalar()
    if imp and imp.cover_path:
        cover_path = Path(imp.cover_path)
        if cover_path.is_file():
            return FileResponse(
                str(cover_path),
                media_type="image/png",
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "X-Content-Type-Options": "nosniff",
                },
            )

    raise HTTPException(status_code=404, detail="Cover not found")


@router.delete("/books/{repo_id}")
async def delete_book(repo_id: str, db: AsyncSession = Depends(get_db)):
    from app.models.bookmark import Bookmark
    await db.execute(delete(Bookmark).where(Bookmark.book_id == repo_id))

    gen_result = await db.execute(
        select(BookGeneration).where(BookGeneration.repo_id == repo_id)
    )
    gen = gen_result.scalar()
    if not gen:
        gen_result = await db.execute(
            select(BookGeneration).where(BookGeneration.id == repo_id)
        )
        gen = gen_result.scalar()

    if gen:
        delete_book_content(gen.id)
        await db.execute(
            delete(ContentSection).where(ContentSection.repo_id == gen.repo_id)
        )
        await db.delete(gen)
        await db.commit()

    actual_repo_id = gen.repo_id if gen else repo_id
    repo_result = await db.execute(select(Repo).where(Repo.id == actual_repo_id))
    repo = repo_result.scalar()
    if not repo and gen:
        repo_result = await db.execute(select(Repo).where(Repo.id == repo_id))
        repo = repo_result.scalar()
    if repo:
        from app.services.file_storage import delete_repo_content
        delete_repo_content(repo.id)
        await db.delete(repo)
        await db.commit()
        return {"ok": True}

    import_result = await db.execute(
        select(ImportedBook).where(ImportedBook.id == repo_id)
    )
    imported = import_result.scalar()
    if imported:
        if imported.file_path and os.path.isfile(imported.file_path):
            os.remove(imported.file_path)
        delete_import_content(imported.id)
        await db.delete(imported)
        await db.commit()
        return {"ok": True}


@router.patch("/books/{repo_id}")
async def update_book(
    repo_id: str,
    body: BookUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BookGeneration)
        .options(selectinload(BookGeneration.repo))
        .where(BookGeneration.repo_id == repo_id)
    )
    gen = result.scalar()

    if gen:
        if body.status is not None:
            if body.status == "pending":
                raise HTTPException(status_code=400, detail="Cannot set status to 'pending'")
            gen.status = body.status
            gen.updated_at = datetime.now(timezone.utc)

        if gen.repo:
            if body.description is not None:
                gen.repo.description = body.description
            if body.category is not None:
                gen.repo.category = body.category
            if body.tags is not None:
                gen.repo.tags = body.tags
            if body.is_favorite is not None:
                gen.repo.is_favorite = body.is_favorite

        await db.commit()
        return {
            "ok": True,
            "book_id": gen.id,
            "status": gen.status,
            "description": gen.repo.description if gen.repo else None,
        }

    repo_result = await db.execute(select(Repo).where(Repo.id == repo_id))
    repo = repo_result.scalar()
    if repo:
        if body.description is not None:
            repo.description = body.description
        if body.category is not None:
            repo.category = body.category
        if body.tags is not None:
            repo.tags = body.tags
        if body.is_favorite is not None:
            repo.is_favorite = body.is_favorite

        await db.commit()
        return {
            "ok": True,
            "book_id": repo_id,
            "status": "no_book",
            "description": repo.description,
        }

    # Check ImportedBook for file/url imports
    imported_result = await db.execute(select(ImportedBook).where(ImportedBook.id == repo_id))
    imported = imported_result.scalar()
    if imported:
        if body.description is not None:
            imported.description = body.description
        if body.category is not None:
            imported.category = body.category
        if body.tags is not None:
            imported.tags = body.tags
        if body.is_favorite is not None:
            imported.is_favorite = body.is_favorite

        await db.commit()
        return {
            "ok": True,
            "book_id": imported.id,
            "status": "ready",
            "description": imported.description,
        }

    raise HTTPException(status_code=404, detail="Book not found")
