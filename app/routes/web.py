from __future__ import annotations

import json
import logging
import os
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from app.config import settings
from app.job_store import get_job, list_jobs

logger = logging.getLogger(__name__)

router = APIRouter(tags=["web"])


def _scan_reports() -> list[dict[str, Any]]:
    """Read meta.json from each report subdirectory under OUTPUT_DIR.

    Returns a list sorted by generation date, newest first.
    """
    reports: list[dict[str, Any]] = []
    output_dir = settings.OUTPUT_DIR
    if not os.path.isdir(output_dir):
        return reports

    for entry in sorted(os.listdir(output_dir), reverse=True):
        entry_path = os.path.join(output_dir, entry)
        if not os.path.isdir(entry_path):
            continue
        meta_path = os.path.join(entry_path, "meta.json")
        if not os.path.isfile(meta_path):
            continue
        try:
            with open(meta_path) as fh:
                meta = json.load(fh)
        except (json.JSONDecodeError, OSError):
            continue
        reports.append({
            "dir": entry,
            "repo": meta.get("repo", entry),
            "repo_url": meta.get("repo_url", ""),
            "generated": meta.get("generated", ""),
            "iterations": meta.get("iterations", 0),
            "pages": meta.get("pages", 1),
            "index_url": f"/reports/{entry}/index.html",
        })

    return reports


# ---------------------------------------------------------------------------
# GET / — home page
# ---------------------------------------------------------------------------


@router.get("/", response_class=HTMLResponse)
async def home(request: Request) -> HTMLResponse:
    """Render the landing page with repo input form, recent reports, and active jobs."""
    reports = _scan_reports()
    jobs = await list_jobs(limit=20)
    return request.app.state.templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"request": request, "reports": reports, "jobs": jobs},
    )


# ---------------------------------------------------------------------------
# GET /jobs/{job_id} — job status page
# ---------------------------------------------------------------------------


@router.get("/jobs/{job_id}", response_class=HTMLResponse)
async def job_status(request: Request, job_id: str) -> HTMLResponse:
    """Render a polling status page for a single analysis job."""
    row = await get_job(job_id)
    if row is None:
        return request.app.state.templates.TemplateResponse(
            request=request,
            name="job_status.html",
            context={"request": request, "job": None, "job_id": job_id},
            status_code=404,
        )

    report_url: str | None = None
    rp = row.get("report_path")
    if rp:
        try:
            report_url = f"/reports/{os.path.relpath(rp, settings.OUTPUT_DIR)}"
        except ValueError:
            report_url = None

    job = dict(row)
    job["report_url"] = report_url
    return request.app.state.templates.TemplateResponse(
        request=request,
        name="job_status.html",
        context={"request": request, "job": job, "job_id": job_id},
    )
