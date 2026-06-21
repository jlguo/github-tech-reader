"""File-based content storage for readmes, generated books, and imported content.

Replaces DB Text columns for large content with disk files.
Uses atomic writes (write to .tmp, then os.rename) for safety.
"""

import os
import json
import shutil
from pathlib import Path

from app.core.config import settings


def _content_root() -> Path:
    data = settings.data_dir or str(Path(__file__).parent.parent.parent / "data")
    root = Path(data) / "content"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _atomic_write(filepath: Path, content: str | bytes) -> None:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    tmp = filepath.with_suffix(filepath.suffix + ".tmp")
    if isinstance(content, str):
        tmp.write_text(content, encoding="utf-8")
    else:
        tmp.write_bytes(content)
    os.replace(tmp, filepath)


def repos_dir(repo_id: str) -> Path:
    return _content_root() / "repos" / repo_id


def save_readme(repo_id: str, content: str) -> Path:
    path = repos_dir(repo_id) / "readme.md"
    _atomic_write(path, content)
    return path


def load_readme(repo_id: str) -> str | None:
    path = repos_dir(repo_id) / "readme.md"
    if path.is_file():
        return path.read_text(encoding="utf-8")
    return None


def delete_repo_content(repo_id: str) -> None:
    d = repos_dir(repo_id)
    if d.exists():
        shutil.rmtree(d)


def books_dir(book_gen_id: str) -> Path:
    return _content_root() / "books" / book_gen_id


def chapters_dir(book_gen_id: str) -> Path:
    return books_dir(book_gen_id) / "chapters"


def save_book_html(book_gen_id: str, html: str) -> Path:
    path = books_dir(book_gen_id) / "book.html"
    _atomic_write(path, html)
    return path


def load_book_html(book_gen_id: str) -> str | None:
    path = books_dir(book_gen_id) / "book.html"
    if path.is_file():
        return path.read_text(encoding="utf-8")
    return None


def save_cover_html(book_gen_id: str, html: str) -> Path:
    path = books_dir(book_gen_id) / "cover.html"
    _atomic_write(path, html)
    return path


def load_cover_html(book_gen_id: str) -> str | None:
    path = books_dir(book_gen_id) / "cover.html"
    if path.is_file():
        return path.read_text(encoding="utf-8")
    return None


def save_outline(book_gen_id: str, outline: dict) -> Path:
    path = books_dir(book_gen_id) / "outline.json"
    _atomic_write(path, json.dumps(outline, ensure_ascii=False, indent=2))
    return path


def load_outline(book_gen_id: str) -> dict | None:
    path = books_dir(book_gen_id) / "outline.json"
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def save_chapter(book_gen_id: str, chapter_number: int, content: str) -> Path:
    path = chapters_dir(book_gen_id) / f"{chapter_number:02d}.html"
    _atomic_write(path, content)
    return path


def load_chapter(book_gen_id: str, chapter_number: int) -> str | None:
    path = chapters_dir(book_gen_id) / f"{chapter_number:02d}.html"
    if path.is_file():
        return path.read_text(encoding="utf-8")
    return None


def delete_book_content(book_gen_id: str) -> None:
    d = books_dir(book_gen_id)
    if d.exists():
        shutil.rmtree(d)


def imports_dir(imported_id: str) -> Path:
    return _content_root() / "imports" / imported_id


def save_import_content(imported_id: str, content: str) -> Path:
    path = imports_dir(imported_id) / "content.html"
    _atomic_write(path, content)
    return path


def load_import_content(imported_id: str) -> str | None:
    path = imports_dir(imported_id) / "content.html"
    if path.is_file():
        return path.read_text(encoding="utf-8")
    return None


def delete_import_content(imported_id: str) -> None:
    d = imports_dir(imported_id)
    if d.exists():
        shutil.rmtree(d)


def has_readme(repo_id: str) -> bool:
    return (repos_dir(repo_id) / "readme.md").is_file()


def has_book_html(book_gen_id: str) -> bool:
    return (books_dir(book_gen_id) / "book.html").is_file()
