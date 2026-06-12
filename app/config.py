"""
Application configuration loaded from environment variables.

Uses python-dotenv for .env file support.  All settings have sensible defaults
for local development and can be overridden via environment variables prefixed
with ``GTR_`` (matching the CLI convention).
"""

import os

from dotenv import load_dotenv

load_dotenv()

# Project root (one level up from the ``app/`` package).
BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _env(key: str, default: str) -> str:
    """Return an environment variable, checking both the ``GTR_``-prefixed
    key and the plain key.  Prefixed keys take precedence."""
    return os.environ.get(f"GTR_{key}", os.environ.get(key, default))


class Settings:
    """Application settings read from environment / ``.env``.

    Attributes:
        HOST: Bind address for the uvicorn server.
        PORT: Bind port for the uvicorn server.
        CACHE_DIR: Directory for bare-repo Git clones.
        OUTPUT_DIR: Directory where analysis reports are written.
        REPO_CACHE_DIR: Alias for CACHE_DIR (used by the analysis service).
        JSON_CACHE_DIR: Directory for LLM response cache.
    """

    HOST: str = _env("HOST", "0.0.0.0")
    PORT: int = int(_env("PORT", "8000"))
    CACHE_DIR: str = _env("CACHE_DIR", os.path.join(BASE_DIR, "repo_cache"))
    OUTPUT_DIR: str = _env("OUTPUT_DIR", os.path.join(BASE_DIR, "report_output"))
    REPO_CACHE_DIR: str = _env("REPO_CACHE_DIR", os.path.join(BASE_DIR, "repo_cache"))
    JSON_CACHE_DIR: str = _env("JSON_CACHE_DIR", os.path.join(BASE_DIR, "cache_json"))


# Module-level singleton – import ``from app.config import settings`` elsewhere.
settings = Settings()
