#!/usr/bin/env python3
"""One-shot migration: move existing DB content columns to disk files.

Run BEFORE applying model column drops. After migration, delete the old DB
file and restart — tables will be recreated without content columns.

Usage: uv run python -m scripts.migrate_to_disk
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.core.database import async_session
from app.services.file_storage import (
    save_readme, save_book_html, save_cover_html,
    save_chapter, save_import_content, save_outline,
)


async def migrate():
    print("Starting migration: DB content -> disk files...")
    async with async_session() as session:
        result = await session.execute(
            text("SELECT id, readme_content FROM repos WHERE readme_content IS NOT NULL")
        )
        for row in result.fetchall():
            if row[1]:
                save_readme(row[0], row[1])
                print(f"  README: repo {row[0]} ({len(row[1])} chars)")

        result = await session.execute(
            text("SELECT id, html_output, cover_html, outline FROM book_generations")
        )
        for row in result.fetchall():
            gen_id = row[0]
            if row[1]:
                save_book_html(gen_id, row[1])
                print(f"  Book HTML: gen {gen_id} ({len(row[1])} chars)")
            if row[2]:
                save_cover_html(gen_id, row[2])
                print(f"  Cover HTML: gen {gen_id} ({len(row[2])} chars)")
            if row[3]:
                save_outline(gen_id, row[3])

        result = await session.execute(
            text("""
                SELECT cs.content, cs.chapter_number, bg.id
                FROM content_sections cs
                JOIN book_generations bg ON bg.repo_id = cs.repo_id
                WHERE cs.content IS NOT NULL
            """)
        )
        for row in result.fetchall():
            if row[0] and row[1]:
                save_chapter(row[2], row[1], row[0])
                print(f"  Chapter: gen {row[2]} ch {row[1]} ({len(row[0])} chars)")

        result = await session.execute(
            text("SELECT id, content_text FROM imported_books WHERE content_text IS NOT NULL")
        )
        for row in result.fetchall():
            if row[1]:
                save_import_content(row[0], row[1])
                print(f"  Import: {row[0]} ({len(row[1])} chars)")

    print("\nMigration complete.")
    print("Next: delete the old DB and restart — tables will be recreated without content columns.")
    print("  rm -f backend/data/reader.db")


if __name__ == "__main__":
    asyncio.run(migrate())
