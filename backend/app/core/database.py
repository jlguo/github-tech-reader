from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy import event, text, select, func
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine = create_async_engine(settings.resolved_database_url, echo=settings.debug)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@event.listens_for(engine.sync_engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    import app.models.repo
    import app.models.imported_book
    import app.models.bookmark
    from app.models.category import Category, SYSTEM_CATEGORIES

    parsed = urlparse(settings.resolved_database_url)
    db_path = Path(parsed.path.lstrip("/"))
    db_path.parent.mkdir(parents=True, exist_ok=True)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Lightweight migration: add cover_path column if missing
        for table, col in [
            ("book_generations", "cover_path"),
            ("imported_books", "cover_path"),
        ]:
            result = await conn.execute(
                text(f"SELECT COUNT(*) AS cnt FROM pragma_table_info('{table}') WHERE name='{col}'")
            )
            row = result.one_or_none()
            if row and row[0] == 0:
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} VARCHAR(512)"))

        # Lightweight migration: add categories.labels JSON column if missing
        result = await conn.execute(
            text("SELECT COUNT(*) AS cnt FROM pragma_table_info('categories') WHERE name='labels'")
        )
        row = result.one_or_none()
        if row and row[0] == 0:
            await conn.execute(text("ALTER TABLE categories ADD COLUMN labels JSON DEFAULT '[]'"))

    async with async_session() as session:
        existing = (await session.execute(select(Category.key))).scalars().all()
        existing_keys = set(existing)
        for spec in SYSTEM_CATEGORIES:
            if spec["key"] not in existing_keys:
                session.add(Category(is_system=True, **spec))
                existing_keys.add(spec["key"])
        await session.commit()

        await _backfill_system_labels(session)
        await _reconcile_orphan_categories(session, existing_keys)


async def _backfill_system_labels(session):
    from app.models.category import Category, SYSTEM_CATEGORIES

    changed = False
    for spec in SYSTEM_CATEGORIES:
        cat = (
            await session.execute(select(Category).where(Category.key == spec["key"]))
        ).scalar_one_or_none()
        if cat is not None and not cat.labels and spec["labels"]:
            cat.labels = spec["labels"]
            changed = True
    if changed:
        await session.commit()



async def _reconcile_orphan_categories(session, known_keys: set[str]):
    from app.models.category import Category

    used = set()
    for table in ("repos", "imported_books"):
        rows = await session.execute(
            text(f"SELECT DISTINCT category FROM {table} WHERE category IS NOT NULL")
        )
        used.update(r[0] for r in rows if r[0])

    next_order = (await session.execute(select(func.max(Category.sort_order)))).scalar() or 0
    created = False
    for key in used - known_keys:
        next_order += 1
        session.add(Category(key=key, label=key, is_system=False, sort_order=next_order))
        created = True
    if created:
        await session.commit()
