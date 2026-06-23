from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine = create_async_engine(settings.database_url, echo=settings.debug)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@event.listens_for(engine.sync_engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
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

    parsed = urlparse(settings.database_url)
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
