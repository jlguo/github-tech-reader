import uuid
import os
import re
import ipaddress
import socket
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
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

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB
MAX_FETCH_SIZE = 10 * 1024 * 1024   # 10 MB for URL imports
MAX_REDIRECTS = 5
CHUNK_SIZE = 1024 * 1024  # 1 MB


def _detect_file_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return FILE_TYPE_MAP.get(ext, "txt")


def _title_from_filename(filename: str) -> str:
    stem = Path(filename).stem
    return stem.replace("_", " ").replace("-", " ").strip() or "Untitled"


def _validate_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only http/https URLs are allowed")
    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="Invalid URL: no hostname")
    if hostname.lower() in ("localhost", "127.0.0.1", "0.0.0.0", "::1", "0:0:0:0:0:0:0:1"):
        raise HTTPException(status_code=400, detail="Access to local addresses is not allowed")
    try:
        addr = ipaddress.ip_address(hostname)
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast or addr.is_unspecified:
            raise HTTPException(status_code=400, detail="Access to private/reserved addresses is not allowed")
    except ValueError:
        pass


async def _safe_fetch(client: httpx.AsyncClient, url: str, max_size: int) -> tuple[httpx.Response, str]:
    current_url = url
    for _ in range(MAX_REDIRECTS + 1):
        _validate_url(current_url)
        resp = await client.get(current_url, follow_redirects=False)
        if resp.status_code in (301, 302, 303, 307, 308):
            location = resp.headers.get("location", "")
            if not location:
                raise HTTPException(status_code=400, detail="Redirect without location header")
            if location.startswith("/"):
                parsed = urlparse(current_url)
                current_url = f"{parsed.scheme}://{parsed.netloc}{location}"
            else:
                current_url = location
            continue
        resp.raise_for_status()
        html_chunks = []
        total = 0
        async for chunk in resp.aiter_text(chunk_size=CHUNK_SIZE):
            total += len(chunk.encode("utf-8"))
            if total > max_size:
                raise HTTPException(status_code=413, detail=f"Content too large (max {max_size // (1024*1024)}MB)")
            html_chunks.append(chunk)
        return resp, "".join(html_chunks)
    raise HTTPException(status_code=400, detail="Too many redirects")


@router.post("/upload")
async def upload_book(
    file: UploadFile = File(),
    title: str = Form(default=""),
    author: str = Form(default=""),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in FILE_TYPE_MAP:
        allowed = ", ".join(sorted(FILE_TYPE_MAP.keys()))
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{ext}'. Allowed: {allowed}")

    file_type = _detect_file_type(file.filename)
    book_title = title or _title_from_filename(file.filename)
    book_author = author or "Unknown"

    _upload_dir.mkdir(parents=True, exist_ok=True)
    file_id = str(uuid.uuid4())
    saved_path = _upload_dir / f"{file_id}{ext}"

    bytes_read = 0
    with open(saved_path, "wb") as f:
        while chunk := await file.read(CHUNK_SIZE):
            bytes_read += len(chunk)
            if bytes_read > MAX_UPLOAD_SIZE:
                f.close()
                os.unlink(saved_path)
                raise HTTPException(status_code=413, detail=f"File too large (max {MAX_UPLOAD_SIZE // (1024*1024)}MB)")
            f.write(chunk)

    async with async_session() as session:
        book = ImportedBook(
            id=file_id,
            title=book_title,
            author=book_author,
            source_type="file",
            file_type=file_type,
            file_path=str(saved_path),
            size_bytes=bytes_read,
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

    _validate_url(url)

    async with httpx.AsyncClient(timeout=30) as client:
        resp, html = await _safe_fetch(client, url, MAX_FETCH_SIZE)

    book_title = title
    book_author = author or "Unknown"

    if not book_title:
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

    headers = {
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data: https: http:; sandbox",
        "Content-Disposition": "inline",
    }

    return FileResponse(
        book.file_path,
        headers=headers,
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
