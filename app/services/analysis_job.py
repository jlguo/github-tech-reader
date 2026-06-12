"""
Analysis job service — wraps the github-tech-reader CLI pipeline.

Provides ``run_analysis_job()``, an async function that executes
the full analysis pipeline in a background thread, updating job
status via the SQLite-backed job store.

Pipeline modes (auto-detected):
  - **evolution** — tags exist, classic tag-to-tag diff analysis
  - **commit-chunk** — no tags, groups commits into ~30 chunks
  - **structural** — ≤1 commit, module discovery + 3-phase LLM analysis

Progress is reported at key milestones:
  clone done=10%, iterations extracted=20%, analysis=30-80%,
  HTML gen=90%, complete=100%.
"""

from __future__ import annotations

import asyncio
import logging
import subprocess
from collections.abc import Callable

from app.config import settings
from app.job_store import get_job, update_job
from git_utils import GitRepo
from html_generator import HTMLGenerator
from llm_parser import LLMParser
from main import _merge_adjacent_patch_versions, build_report_data, build_structural_report

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def run_analysis_job(job_id: str) -> None:
    """Execute an analysis job in a background thread.

    Called from FastAPI routes via ``asyncio.create_task(run_analysis_job(job_id))``.

    The function:
    1. Loads job parameters from the job store
    2. Clones/fetches the target repo
    3. Determines analysis mode (evolution / commit-chunk / structural)
    4. Runs the LLM analysis pipeline (sync code in thread pool)
    5. Generates HTML reports
    6. Updates job status to ``done`` or ``error``

    Progress is reported at key milestones: clone=10%, extraction=20%,
    analysis=30-80%, HTML gen=90%, complete=100%.

    Args:
        job_id: UUID of the job to process.
    """
    job = await get_job(job_id)
    if job is None:
        logger.error("Job %s not found — cannot run", job_id)
        return

    await update_job(job_id, status="running", progress=0)
    logger.info("Starting analysis job %s for %s", job_id, job["repo_url"])

    loop = asyncio.get_running_loop()

    def _progress(pct: int) -> None:
        """Thread-safe progress reporter.

        Schedules a job-store update on the event loop from whatever
        background thread the analysis pipeline is running in.
        """
        asyncio.run_coroutine_threadsafe(
            update_job(job_id, progress=pct), loop,
        )

    try:
        output_path = await loop.run_in_executor(
            None, _run_pipeline, job, _progress,
        )
        await update_job(job_id, status="done", progress=100, report_path=output_path)
        logger.info("Job %s completed → %s", job_id, output_path)
    except Exception as exc:
        logger.exception("Job %s failed", job_id)
        try:
            await update_job(job_id, status="error", progress=0, error=str(exc))
        except Exception:
            logger.exception("Failed to write error status for job %s", job_id)


# ---------------------------------------------------------------------------
# Internal — pipeline orchestrator (sync, runs in thread pool)
# ---------------------------------------------------------------------------


def _run_pipeline(job: dict, progress: Callable[[int], None]) -> str:
    """Run the full analysis pipeline synchronously.

    This is called via ``loop.run_in_executor(None, ...)`` so it can
    freely use blocking operations (git clone, LLM HTTP calls, etc.)
    without blocking the event loop.

    Args:
        job: Job dictionary from the job store.
        progress: Thread-safe progress callback (accepts 0-100).

    Returns:
        Absolute path to the generated HTML report.
    """
    repo_url: str = job["repo_url"].rstrip("/")
    provider: str = job["provider"]
    no_llm: bool = bool(job["no_llm"])
    no_cache: bool = bool(job["no_cache"])
    limit: int | None = job.get("limit_amount")

    cache_dir: str = settings.REPO_CACHE_DIR
    json_cache_dir: str = settings.JSON_CACHE_DIR
    output_dir: str = settings.OUTPUT_DIR

    repo_name: str = repo_url.split("/")[-1].removesuffix(".git")
    owner: str = repo_url.split("/")[-2]

    progress(5)

    # -- Step 0: Quick repo validation ---------------------------------------
    _validate_repo(repo_url)

    # -- Step 1: Clone bare repository ---------------------------------------
    logger.info("[1/4] Cloning bare repository: %s", repo_url)
    repo = GitRepo.clone_bare(repo_url, cache_dir)
    logger.info("  Bare repo at %s", repo.path)
    progress(10)

    repo_meta = repo.get_repo_metadata()
    repo_meta["name"] = f"{owner}/{repo_name}"
    repo_meta["url"] = repo_url

    # -- Step 2: Extract iterations -------------------------------------------
    logger.info("[2/4] Extracting iterations...")
    all_tags = repo.get_tags()
    iterations_raw = repo.extract_iterations()

    if not iterations_raw:
        logger.info("  No tags found, falling back to commit-chunk analysis")
        iterations_raw = repo.extract_commit_chunks()

    use_structural = False
    iterations_data = iterations_raw
    if len(iterations_raw) <= 1 and repo.get_commit_count() <= 1:
        logger.info("  Single/missing commit — switching to structural mode")
        use_structural = True

    if not use_structural:
        iterations_data = _merge_adjacent_patch_versions(iterations_raw)
        if limit and limit < len(iterations_data):
            iterations_data = iterations_data[-limit:]

    logger.info("  Tags: %d, Iterations: %d", len(all_tags), len(iterations_data))
    progress(20)

    # -- Step 3: LLM Analysis ------------------------------------------------
    llm_parser = LLMParser(provider=provider)
    use_llm: bool = not no_llm
    workers: int = 3

    if use_structural:
        repo_meta["description"] = (
            f"代码结构分析 — {repo_meta['total_commits']} 次提交, "
            "扫描所有模块与依赖关系。"
        )
        logger.info("[3/4] Analyzing code structure (structural mode)...")
        progress(30)
        report_data = build_structural_report(
            repo, repo_meta, llm_parser,
            use_llm, workers, json_cache_dir,
            repo_url, no_cache,
        )
        progress(90)

        _log_token_stats()
        logger.info("[4/4] Generating HTML report...")
        generator = HTMLGenerator(output_dir=output_dir)
        output_path = generator.generate_structural(report_data)
    else:
        repo_meta["description"] = (
            f"分析 {len(iterations_data)} 个版本迭代，"
            f"共 {repo_meta['total_commits']} 次提交。"
        )
        logger.info("[3/4] Analyzing %d iterations (evolution mode)...", len(iterations_data))
        progress(30)
        report_data = build_report_data(
            repo, repo_meta, iterations_data, llm_parser,
            use_llm, max_diff_chars=10000,
            cache_dir=json_cache_dir, repo_url=repo_url,
            no_cache=no_cache, workers=workers,
        )
        progress(90)

        _log_token_stats()
        logger.info("[4/4] Generating HTML report...")
        generator = HTMLGenerator(output_dir=output_dir)
        output_path = generator.generate(report_data)

    progress(100)
    return output_path


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _validate_repo(repo_url: str) -> None:
    """Quickly check that a GitHub repo exists before attempting a full clone.

    Runs ``git ls-remote`` with a 15-second timeout.  Raises ``ValueError``
    if the repo is unreachable, so the job fails fast instead of hanging
    for the full 300-second clone timeout.
    """
    try:
        subprocess.run(
            ["git", "ls-remote", "--heads", repo_url],
            capture_output=True, text=True, timeout=15, check=True,
        )
    except subprocess.TimeoutExpired:
        raise ValueError(f"Repository {repo_url!r} is unreachable (timed out after 15s)") from None
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        raise ValueError(
            f"Repository {repo_url!r} not found or not accessible"
            + (f": {stderr}" if stderr else ""),
        ) from None


def _log_token_stats() -> None:
    if LLMParser.total_calls == 0:
        return
    logger.info(
        "  Token stats: %d calls | input=%s tokens | output=%s tokens | total=%s tokens",
        LLMParser.total_calls,
        f"{LLMParser.total_input_tokens:,}",
        f"{LLMParser.total_output_tokens:,}",
        f"{LLMParser.total_input_tokens + LLMParser.total_output_tokens:,}",
    )
