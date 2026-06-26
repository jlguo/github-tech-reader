import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update

from app.core.database import get_db
from app.models.category import Category
from app.models.repo import Repo
from app.models.imported_book import ImportedBook
from app.api.schemas import (
    CategoryResponse,
    CategoryCreateRequest,
    CategoryUpdateRequest,
)
from app.utils.slugify import slugify

router = APIRouter()

_cache: list | None = None
_cache_time: float = 0.0
_CACHE_TTL = 60.0  # seconds


def _invalidate_cache() -> None:
    global _cache, _cache_time
    _cache = None
    _cache_time = 0.0


@router.get("", response_model=list[CategoryResponse])
async def list_categories(db: AsyncSession = Depends(get_db)):
    global _cache, _cache_time
    now = time.monotonic()
    if _cache is not None and (now - _cache_time) < _CACHE_TTL:
        return _cache
    result = await db.execute(
        select(Category).order_by(Category.sort_order, Category.label)
    )
    categories = list(result.scalars())
    _cache = categories
    _cache_time = now
    return categories


@router.post("", response_model=CategoryResponse, status_code=201)
async def create_category(body: CategoryCreateRequest, db: AsyncSession = Depends(get_db)):
    label = body.label.strip()
    if not label:
        raise HTTPException(status_code=422, detail="Label must not be empty")

    key = slugify(label)
    if not key:
        raise HTTPException(status_code=422, detail="Label must contain usable characters")

    dup_label = (
        await db.execute(select(Category).where(func.lower(Category.label) == label.lower()))
    ).scalar_one_or_none()
    if dup_label:
        raise HTTPException(status_code=409, detail="A category with this name already exists")

    existing = (await db.execute(select(Category).where(Category.key == key))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="A category with this name already exists")

    sort_order = body.sort_order
    if sort_order is None:
        max_order = (await db.execute(select(func.max(Category.sort_order)))).scalar() or 0
        sort_order = max_order + 1

    category = Category(
        key=key,
        label=label,
        icon=body.icon,
        color=body.color,
        labels=body.labels,
        sort_order=sort_order,
        is_system=False,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    _invalidate_cache()
    return category


@router.patch("/{category_id}", response_model=CategoryResponse)
async def update_category(category_id: str, body: CategoryUpdateRequest, db: AsyncSession = Depends(get_db)):
    category = (await db.execute(select(Category).where(Category.id == category_id))).scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    if body.label is not None:
        label = body.label.strip()
        if not label:
            raise HTTPException(status_code=422, detail="Label must not be empty")
        dup_label = (
            await db.execute(
                select(Category).where(
                    func.lower(Category.label) == label.lower(),
                    Category.id != category_id,
                )
            )
        ).scalar_one_or_none()
        if dup_label:
            raise HTTPException(status_code=409, detail="A category with this name already exists")
        category.label = label
    if body.icon is not None:
        category.icon = body.icon
    if body.color is not None:
        category.color = body.color
    if body.labels is not None:
        category.labels = body.labels
    if body.sort_order is not None:
        category.sort_order = body.sort_order

    await db.commit()
    await db.refresh(category)
    _invalidate_cache()
    return category


@router.delete("/{category_id}")
async def delete_category(category_id: str, db: AsyncSession = Depends(get_db)):
    category = (await db.execute(select(Category).where(Category.id == category_id))).scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if category.is_system:
        raise HTTPException(status_code=403, detail="System categories cannot be deleted")

    await db.execute(
        update(Repo).where(Repo.category == category.key).values(category="uncategorized")
    )
    await db.execute(
        update(ImportedBook).where(ImportedBook.category == category.key).values(category="uncategorized")
    )
    await db.delete(category)
    await db.commit()
    _invalidate_cache()
    return {"status": "deleted", "reassigned_to": "uncategorized"}
