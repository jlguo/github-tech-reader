from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    app_name: str = "GitHub Tech Reader"
    debug: bool = True

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
    book_max_chapters: int = 16
    book_max_files_to_fetch: int = 100
    book_chapter_min_words: int = 2000
    book_chapter_max_words: int = 5000

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

    @property
    def database_url(self) -> str:
        data = self.data_dir or str(Path(__file__).parent.parent.parent / "data")
        return f"sqlite+aiosqlite:///{data}/reader.db"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
