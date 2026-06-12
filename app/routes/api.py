"""
REST API routes for the GitHub Tech Reader web application.

Provides endpoints to queue analysis jobs, check job status, and list
historical jobs.  All job lifecycle mutations are delegated to the
SQLite-backed job store.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil

from fastapi import APIRouter, HTTPException, status

from app.config import settings
from app.job_store import create_job, get_job, list_jobs
from app.models import AnalyzeRequest, AnalyzeResponse, JobStatus
from app.services.analysis_job import run_analysis_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["api"])


# ---------------------------------------------------------------------------
# POST /analyze — queue a new analysis job
# ---------------------------------------------------------------------------


@router.post("/analyze", response_model=AnalyzeResponse, status_code=status.HTTP_202_ACCEPTED)
async def analyze(payload: AnalyzeRequest) -> AnalyzeResponse:
    """Queue an analysis job for the given GitHub repository.

    The job is persisted immediately and the analysis runs in a
    background task.  Clients should poll ``GET /api/analyze/{job_id}``
    for progress updates.
    """
    job_id = await create_job(
        repo_url=payload.repo_url,
        provider=payload.provider,
        no_llm=payload.no_llm,
        no_cache=payload.no_cache,
        limit=payload.limit,
    )

    # Fire-and-forget the analysis in the background.
    asyncio.create_task(run_analysis_job(job_id))

    logger.info("Job %s queued for %s", job_id, payload.repo_url)
    return AnalyzeResponse(job_id=job_id)


# ---------------------------------------------------------------------------
# GET /analyze/{job_id} — fetch job status
# ---------------------------------------------------------------------------


@router.get("/analyze/{job_id}", response_model=JobStatus)
async def get_analysis_status(job_id: str) -> JobStatus:
    """Return the current status and progress of an analysis job."""
    row = await get_job(job_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")

    report_url: str | None = None
    report_path: str | None = row.get("report_path")
    if report_path:
        try:
            rel = os.path.relpath(report_path, settings.OUTPUT_DIR)
            report_url = f"/reports/{rel}"
        except ValueError:
            report_url = None

    return JobStatus(
        job_id=row["id"],
        status=row["status"],
        progress=row["progress"],
        repo_url=row["repo_url"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        report_path=report_path,
        report_url=report_url,
        error=row.get("error"),
    )


# ---------------------------------------------------------------------------
# GET /jobs — list recent jobs
# ---------------------------------------------------------------------------


@router.get("/jobs")
async def list_all_jobs(limit: int = 50) -> list[dict]:
    """Return the most recent analysis jobs, newest first."""
    rows = await list_jobs(limit=min(limit, 200))
    result: list[dict] = []
    for r in rows:
        report_url: str | None = None
        rp = r.get("report_path")
        if rp:
            try:
                report_url = f"/reports/{os.path.relpath(rp, settings.OUTPUT_DIR)}"
            except ValueError:
                report_url = None
        result.append({
            "job_id": r["id"],
            "status": r["status"],
            "progress": r["progress"],
            "repo_url": r["repo_url"],
            "created_at": r["created_at"],
            "report_path": rp,
            "report_url": report_url,
        })
    return result


# ---------------------------------------------------------------------------
# DELETE /reports/{report_dir} — remove a report
# ---------------------------------------------------------------------------


@router.delete("/reports/{report_dir}", status_code=status.HTTP_200_OK)
async def delete_report(report_dir: str) -> dict:
    """Delete a report directory and all its contents.

    The ``report_dir`` must be a direct subdirectory of the output
    directory.  Path traversal (``..``, ``/``) is rejected.
    """
    if ".." in report_dir or "/" in report_dir or "\\" in report_dir:
        raise HTTPException(status_code=400, detail="Invalid report directory name")

    target = os.path.join(settings.OUTPUT_DIR, report_dir)
    resolved = os.path.realpath(target)
    allowed = os.path.realpath(settings.OUTPUT_DIR)

    if not resolved.startswith(allowed + os.sep) and resolved != allowed:
        raise HTTPException(status_code=400, detail="Path traversal denied")

    if not os.path.isdir(target):
        raise HTTPException(status_code=404, detail=f"Report {report_dir!r} not found")

    shutil.rmtree(target)
    logger.info("Deleted report: %s", report_dir)
    return {"detail": f"Report {report_dir!r} deleted"}
