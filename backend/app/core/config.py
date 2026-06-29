from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    app_name: str = "GitHub Tech Reader"
    debug: bool = False

    # Data directory — set via env for containers, auto-detected otherwise
    data_dir: str = ""

    # GitHub
    github_token: str = ""
    github_api_base: str = "https://api.github.com"

    # CrewAI / LLM
    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"

    @property
    def llm_base_url_normalized(self) -> str:
        return self.llm_base_url.rstrip("/").removesuffix("/chat/completions")

    # Book generation
    book_language: str = "zh"
    book_min_chapters: int = 3
    book_max_chapters: int = 24
    book_max_files_to_fetch: int = 100
    book_chapter_min_words: int = 2000
    book_chapter_max_words: int = 5000
    llm_planning_model: str = ""
    llm_review_model: str = ""

    # LLM rate limiting
    llm_max_parallel_chapters: int = 3
    llm_request_delay_seconds: float = 2.0
    llm_max_retries: int = 4
    llm_rate_limit_wait_seconds: int = 30

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:8000",
    ]

    port: int = 8000

    # Optional explicit database URL (e.g., for PostgreSQL in production).
    # When empty, falls back to a SQLite file under data_dir.
    database_url: str = ""

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        resolved_data_dir = self.data_dir or str(Path(__file__).parent.parent.parent / "data")
        return f"sqlite+aiosqlite:///{resolved_data_dir}/reader.db"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
