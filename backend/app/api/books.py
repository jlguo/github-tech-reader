from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.repo import Repo, BookGeneration, ContentSection
from app.api.schemas import BookListItem, BookContentResponse, SectionResponse

router = APIRouter()


@router.get("/books", response_model=list[BookListItem])
async def list_books(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BookGeneration, Repo)
        .join(Repo, BookGeneration.repo_id == Repo.id)
        .where(BookGeneration.status.in_(["writing", "done"]))
        .order_by(BookGeneration.updated_at.desc())
    )
    rows = result.all()
    books = []
    for gen, repo in rows:
        books.append(BookListItem(
            repo_id=repo.id,
            book_id=gen.id,
            title=repo.name,
            author=repo.owner,
            description=repo.description,
            language=repo.language,
            html_url=repo.html_url,
            status=gen.status,
            chapter_count=gen.total_chapters,
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
        html_content=gen.html_output or "",
        cover_html=gen.cover_html,
        chapters=[
            SectionResponse(
                id=c.id,
                section_type=c.section_type,
                title=c.title,
                content=c.content,
                order_index=c.order_index,
                metadata_=c.metadata_,
                created_at=c.created_at,
            )
            for c in chapters
        ],
    )


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
        html_content=gen.html_output or "",
        cover_html=gen.cover_html,
        chapters=[
            SectionResponse(
                id=c.id,
                section_type=c.section_type,
                title=c.title,
                content=c.content,
                order_index=c.order_index,
                metadata_=c.metadata_,
                created_at=c.created_at,
            )
            for c in chapters
        ],
    )
