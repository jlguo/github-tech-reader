"""
Pydantic request / response schemas for the FastAPI web layer.

These models are pure data contracts – no business logic or persistence.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Request
# ---------------------------------------------------------------------------


class AnalyzeRequest(BaseModel):
    """Payload submitted to ``POST /api/analyze``."""

    model_config = ConfigDict(extra="forbid")

    repo_url: str = Field(
        ...,
        description="GitHub repository URL to analyze (e.g. https://github.com/user/repo)",
        examples=["https://github.com/tiangolo/fastapi"],
    )
    provider: Literal["openai", "ollama", "deepseek"] = Field(
        default="deepseek",
        description="LLM provider to use for analysis",
    )
    no_llm: bool = Field(
        default=False,
        description="Skip LLM analysis and generate mock data",
    )
    no_cache: bool = Field(
        default=False,
        description="Skip LLM result cache and force re-analysis",
    )
    limit: int | None = Field(
        default=None,
        ge=1,
        description="Limit analysis to the N most recent iterations (None = all)",
    )


# ---------------------------------------------------------------------------
# Job lifecycle
# ---------------------------------------------------------------------------


class AnalyzeResponse(BaseModel):
    """Immediate response returned after a new analysis job is queued."""

    job_id: str = Field(..., description="Unique job identifier (UUID)")
    status: str = Field(default="pending", description="Initial job status")
    message: str = Field(
        default="Analysis job queued successfully",
        description="Human-readable status message",
    )


class JobStatus(BaseModel):
    """Full snapshot of an analysis job at any point in its lifecycle.

    State machine: ``pending → running → done`` or ``pending → running → error``.
    """

    job_id: str = Field(..., description="Unique job identifier (UUID)")
    status: Literal["pending", "running", "done", "error"] = Field(
        default="pending",
        description="Current job status",
    )
    progress: int = Field(
        default=0,
        ge=0,
        le=100,
        description="Completion percentage (0–100)",
    )
    repo_url: str = Field(
        ...,
        description="GitHub repository URL being analyzed",
    )
    created_at: str = Field(
        default_factory=lambda: datetime.now(UTC).isoformat(),
        description="ISO-8601 timestamp of job creation",
    )
    updated_at: str = Field(
        default_factory=lambda: datetime.now(UTC).isoformat(),
        description="ISO-8601 timestamp of last status change",
    )
    report_path: str | None = Field(
        default=None,
        description="Absolute filesystem path to the generated HTML report",
    )
    report_url: str | None = Field(
        default=None,
        description="Web URL for viewing the report (relative to /reports mount)",
    )
    error: str | None = Field(
        default=None,
        description="Error message if the job failed",
    )
