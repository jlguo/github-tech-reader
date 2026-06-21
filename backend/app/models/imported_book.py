import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Boolean, DateTime, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON

from app.core.database import Base


class ImportedBook(Base):
    __tablename__ = "imported_books"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    author: Mapped[str] = mapped_column(String(128), default="Unknown")
    source_type: Mapped[str] = mapped_column(String(16), nullable=False)  # "file" | "url"
    file_type: Mapped[str] = mapped_column(String(16), nullable=False)  # epub, pdf, txt, doc, ppt, xlsx, html
    file_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    original_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(64), default="imported")
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
