from pydantic import BaseModel
from datetime import datetime


class RepoAddRequest(BaseModel):
    full_name: str


class RepoUpdateRequest(BaseModel):
    category: str | None = None
    tags: list[str] | None = None
    is_favorite: bool | None = None


class ProgressUpdateRequest(BaseModel):
    repo_id: str
    section: str | None = None
    position: float = 0.0
    completed: bool = False


class RepoResponse(BaseModel):
    id: str
    github_id: int
    full_name: str
    owner: str
    name: str
    description: str | None
    html_url: str
    stars: int
    forks: int
    language: str | None
    topics: list[str]
    license_: str | None = None
    category: str
    tags: list[str]
    is_favorite: bool
    added_at: datetime
    has_readme: bool = False

    model_config = {"from_attributes": True}


class RepoDetailResponse(RepoResponse):
    readme_content: str | None = None
    reading_progress: list["ProgressResponse"] = []
    content_sections: list["SectionResponse"] = []


class ProgressResponse(BaseModel):
    id: str
    section: str | None
    position: float
    completed: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class SectionResponse(BaseModel):
    id: str
    section_type: str
    title: str
    content: str
    order_index: int
    metadata_: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class RepoListResponse(BaseModel):
    items: list[RepoResponse]
    total: int


class BookGenerationRequest(BaseModel):
    chapter_count: int | None = None
    target_words_per_chapter: int | None = None


class BookGenerationStatusResponse(BaseModel):
    repo_id: str
    status: str
    current_phase: str | None
    total_chapters: int
    completed_chapters: int
    error_log: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class BookListItem(BaseModel):
    repo_id: str
    book_id: str
    title: str
    author: str
    description: str | None
    language: str | None
    html_url: str
    status: str
    source_type: str = "github"
    file_type: str | None = None
    chapter_count: int
    completed_chapters: int = 0
    current_phase: str | None = None
    created_at: datetime
    updated_at: datetime


class BookUpdateRequest(BaseModel):
    status: str | None = None
    description: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    is_favorite: bool | None = None


class BookContentResponse(BaseModel):
    book_id: str
    title: str
    html_content: str
    cover_html: str | None = None
    chapters: list["SectionResponse"] = []
