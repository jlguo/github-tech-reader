import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON

from app.core.database import Base


class Repo(Base):
    __tablename__ = "repos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    github_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(256), nullable=False)
    owner: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    html_url: Mapped[str] = mapped_column(String(512), nullable=False)
    stars: Mapped[int] = mapped_column(Integer, default=0)
    forks: Mapped[int] = mapped_column(Integer, default=0)
    language: Mapped[str | None] = mapped_column(String(64), nullable=True)
    topics: Mapped[list[str]] = mapped_column(JSON, default=list)
    license_: Mapped[str | None] = mapped_column("license", String(128), nullable=True)
    default_branch: Mapped[str] = mapped_column(String(128), default="main")
    created_at_github: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at_github: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    category: Mapped[str] = mapped_column(String(64), default="uncategorized")
    source_type: Mapped[str] = mapped_column(String(16), default="github")  # "github" | "youtube"
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    readme_fetched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    reading_progress = relationship("ReadingProgress", back_populates="repo", cascade="all, delete-orphan")
    content_sections = relationship("ContentSection", back_populates="repo", cascade="all, delete-orphan")
    book_generation = relationship("BookGeneration", back_populates="repo", cascade="all, delete-orphan", uselist=False)


class ReadingProgress(Base):
    __tablename__ = "reading_progress"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    repo_id: Mapped[str] = mapped_column(String(36), ForeignKey("repos.id"), nullable=False, index=True)
    section: Mapped[str | None] = mapped_column(String(256), nullable=True)
    position: Mapped[float] = mapped_column(Float, default=0.0)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    repo = relationship("Repo", back_populates="reading_progress")


class ContentSection(Base):
    __tablename__ = "content_sections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    repo_id: Mapped[str] = mapped_column(String(36), ForeignKey("repos.id"), nullable=False, index=True)
    section_type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    chapter_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    word_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="drafting")
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    repo = relationship("Repo", back_populates="content_sections")


class BookGeneration(Base):
    __tablename__ = "book_generations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    repo_id: Mapped[str] = mapped_column(String(36), ForeignKey("repos.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(32), default="pending", nullable=False,
    )
    total_chapters: Mapped[int] = mapped_column(Integer, default=0)
    completed_chapters: Mapped[int] = mapped_column(Integer, default=0)
    current_phase: Mapped[str | None] = mapped_column(String(64), nullable=True)
    outline: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    cover_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    error_log: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    repo = relationship("Repo", back_populates="book_generation")
