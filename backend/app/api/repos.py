from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.schemas import (
    RepoAddRequest,
    RepoUpdateRequest,
    RepoResponse,
    RepoDetailResponse,
    RepoListResponse,
    ProgressResponse,
    SectionResponse,
)
from app.models.repo import Repo, ReadingProgress, ContentSection, BookGeneration
from app.services.github import fetch_repo_info, fetch_readme
from app.services.file_storage import save_readme, load_readme, has_readme, delete_repo_content, delete_book_content

router = APIRouter()


def _to_response(repo: Repo) -> RepoResponse:
    return RepoResponse(
        id=repo.id,
        github_id=repo.github_id,
        full_name=repo.full_name,
        owner=repo.owner,
        name=repo.name,
        description=repo.description,
        html_url=repo.html_url,
        stars=repo.stars,
        forks=repo.forks,
        language=repo.language,
        topics=repo.topics or [],
        license_=repo.license_,
        category=repo.category,
        tags=repo.tags or [],
        is_favorite=repo.is_favorite,
        added_at=repo.added_at,
        has_readme=has_readme(repo.id),
    )


def _progress_to_response(p: ReadingProgress) -> ProgressResponse:
    return ProgressResponse(
        id=p.id,
        section=p.section,
        position=p.position,
        completed=p.completed,
        updated_at=p.updated_at,
    )


def _section_to_response(s: ContentSection) -> SectionResponse:
    return SectionResponse(
        id=s.id,
        section_type=s.section_type,
        title=s.title,
        content="",
        order_index=s.order_index,
        metadata_=s.metadata_,
        created_at=s.created_at,
    )


@router.get("", response_model=RepoListResponse)
async def list_repos(
    category: str | None = None,
    favorite: bool | None = None,
    search: str | None = None,
    limit: int = Query(default=50, le=100),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Repo)

    if category:
        stmt = stmt.where(Repo.category == category)
    if favorite:
        stmt = stmt.where(Repo.is_favorite == True)
    if search:
        stmt = stmt.where(
            (Repo.full_name.ilike(f"%{search}%")) |
            (Repo.description.ilike(f"%{search}%"))
        )

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    result = await db.execute(
        stmt.order_by(Repo.added_at.desc()).offset(offset).limit(limit)
    )
    repos = result.scalars().all()

    return RepoListResponse(
        items=[_to_response(r) for r in repos],
        total=total,
    )


@router.post("/add", response_model=RepoResponse)
async def add_repo(body: RepoAddRequest, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(Repo).where(Repo.full_name == body.full_name))).scalar()
    if existing:
        raise HTTPException(status_code=409, detail="Repo already in shelf")

    try:
        info = await fetch_repo_info(body.full_name)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    if not info:
        raise HTTPException(status_code=404, detail="Repo not found on GitHub")

    repo = Repo(**info)
    db.add(repo)
    await db.commit()
    await db.refresh(repo)
    return _to_response(repo)


@router.get("/{repo_id}", response_model=RepoDetailResponse)
async def get_repo(repo_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Repo)
        .options(selectinload(Repo.reading_progress), selectinload(Repo.content_sections))
        .where(Repo.id == repo_id)
    )
    repo = result.scalar()
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")

    return RepoDetailResponse(
        id=repo.id,
        github_id=repo.github_id,
        full_name=repo.full_name,
        owner=repo.owner,
        name=repo.name,
        description=repo.description,
        html_url=repo.html_url,
        stars=repo.stars,
        forks=repo.forks,
        language=repo.language,
        topics=repo.topics or [],
        license_=repo.license_,
        category=repo.category,
        tags=repo.tags or [],
        is_favorite=repo.is_favorite,
        added_at=repo.added_at,
        has_readme=has_readme(repo.id),
        readme_content=load_readme(repo.id),
        reading_progress=[_progress_to_response(p) for p in repo.reading_progress],
        content_sections=[_section_to_response(s) for s in repo.content_sections],
    )


@router.patch("/{repo_id}", response_model=RepoResponse)
async def update_repo(repo_id: str, body: RepoUpdateRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Repo).where(Repo.id == repo_id))
    repo = result.scalar()
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")

    if body.category is not None:
        repo.category = body.category
    if body.tags is not None:
        repo.tags = body.tags
    if body.is_favorite is not None:
        repo.is_favorite = body.is_favorite

    await db.commit()
    await db.refresh(repo)
    return _to_response(repo)


@router.delete("/{repo_id}")
async def remove_repo(repo_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Repo).where(Repo.id == repo_id))
    repo = result.scalar()
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")

    gen_result = await db.execute(
        select(BookGeneration).where(BookGeneration.repo_id == repo_id)
    )
    for gen in gen_result.scalars():
        delete_book_content(gen.id)

    delete_repo_content(repo.id)
    await db.delete(repo)
    await db.commit()
    return {"ok": True}


@router.post("/{repo_id}/fetch-readme")
async def fetch_repo_readme(repo_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Repo).where(Repo.id == repo_id))
    repo = result.scalar()
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")

    content = await fetch_readme(repo.full_name)
    if content is None:
        raise HTTPException(status_code=404, detail="README not found on GitHub")

    from datetime import datetime
    save_readme(repo.id, content)
    repo.readme_fetched_at = datetime.utcnow()
    await db.commit()

    return {"ok": True, "length": len(content)}
