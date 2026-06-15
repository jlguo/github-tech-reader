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
