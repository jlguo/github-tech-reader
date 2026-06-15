from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    app_name: str = "GitHub Tech Reader"
    debug: bool = True

    # Database
    database_url: str = f"sqlite+aiosqlite:///{Path(__file__).parent.parent.parent / 'data' / 'reader.db'}"

    # GitHub
    github_token: str = ""
    github_api_base: str = "https://api.github.com"

    # CrewAI
    openai_api_key: str = ""
    crewai_model: str = "gpt-4o-mini"

    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
