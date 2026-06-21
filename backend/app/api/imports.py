import uuid
import os
from datetime import datetime
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db, async_session
from app.models.imported_book import ImportedBook
from app.services.file_storage import save_import_content, load_import_content, delete_import_content

router = APIRouter()

_upload_dir = Path(__file__).parent.parent.parent / "data" / "uploads"

FILE_TYPE_MAP = {
    ".epub": "epub", ".pdf": "pdf", ".txt": "txt",
    ".doc": "doc", ".docx": "doc",
    ".ppt": "ppt", ".pptx": "ppt",
    ".xls": "xls", ".xlsx": "xlsx",
    ".html": "html", ".htm": "html",
    ".md": "txt",
}


def _detect_file_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return FILE_TYPE_MAP.get(ext, "txt")


def _title_from_filename(filename: str) -> str:
    stem = Path(filename).stem
    return stem.replace("_", " ").replace("-", " ").strip() or "Untitled"


@router.post("/upload")
async def upload_book(
    file: UploadFile = File(),
    title: str = Form(default=""),
    author: str = Form(default=""),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    file_type = _detect_file_type(file.filename)
    book_title = title or _title_from_filename(file.filename)
    book_author = author or "Unknown"

    _upload_dir.mkdir(parents=True, exist_ok=True)
    file_id = str(uuid.uuid4())
    ext = Path(file.filename).suffix
    saved_path = _upload_dir / f"{file_id}{ext}"

    content = await file.read()
    saved_path.write_bytes(content)

    async with async_session() as session:
        book = ImportedBook(
            id=file_id,
            title=book_title,
            author=book_author,
            source_type="file",
            file_type=file_type,
            file_path=str(saved_path),
            size_bytes=len(content),
        )
        session.add(book)
        await session.commit()

        return {
            "id": book.id,
            "title": book.title,
            "author": book.author,
            "file_type": book.file_type,
            "source_type": book.source_type,
            "size_bytes": book.size_bytes,
        }


@router.post("/import-url")
async def import_url(
    url: str = Form(default=""),
    title: str = Form(default=""),
    author: str = Form(default=""),
):
    url = url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="No URL provided")

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        html = resp.text

    book_title = title
    book_author = author or "Unknown"

    if not book_title:
        import re
        m = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
        if m:
            book_title = m.group(1).strip()
    if not book_title:
        book_title = url.rstrip("/").rsplit("/", 1)[-1] or "Untitled"

    content_type = resp.headers.get("content-type", "")
    file_type = "html"
    if "pdf" in content_type:
        file_type = "pdf"
    elif "text/plain" in content_type:
        file_type = "txt"
    elif "text/markdown" in content_type or url.endswith(".md"):
        file_type = "txt"

    async with async_session() as session:
        book = ImportedBook(
            id=str(uuid.uuid4()),
            title=book_title,
            author=book_author,
            source_type="url",
            file_type=file_type,
            original_url=url,
            size_bytes=len(html.encode()),
        )
        session.add(book)
        await session.commit()

        save_import_content(book.id, html)

        return {
            "id": book.id,
            "title": book.title,
            "author": book.author,
            "file_type": book.file_type,
            "source_type": book.source_type,
            "size_bytes": book.size_bytes,
        }


@router.get("/{book_id}/file")
async def get_book_file(book_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ImportedBook).where(ImportedBook.id == book_id)
    )
    book = result.scalar()
    if not book or not book.file_path:
        raise HTTPException(status_code=404, detail="File not found")
    if not os.path.isfile(book.file_path):
        raise HTTPException(status_code=404, detail="File missing")
    return FileResponse(
        book.file_path,
        headers={"content-disposition": "inline"},
    )


@router.get("/{book_id}/content")
async def get_book_content(book_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ImportedBook).where(ImportedBook.id == book_id)
    )
    book = result.scalar()
    if not book:
        raise HTTPException(status_code=404, detail="Content not found")
    content = load_import_content(book.id)
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    return {"id": book.id, "title": book.title, "content": content, "file_type": book.file_type}
