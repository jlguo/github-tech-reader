"""
CLI orchestrator for GitHub repository iteration analysis.

Optimized for large repos:
  - LLM result caching (skip re-analysis on re-run)
  - Smart iteration merging (adjacent patch versions)
  - Diff size control (aggressive truncation)
  - Parallel LLM processing (concurrent analysis)

Usage:
    python main.py https://github.com/user/repo
    python main.py https://github.com/user/repo --no-llm
    python main.py https://github.com/user/repo --no-cache --workers 4
"""

import argparse
import hashlib
import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime

from dotenv import load_dotenv

from diff_preprocessor import (
    extract_code_changes,
    extract_dependency_changes,
    get_diff_summary,
    strip_comment_lines,
)
from git_utils import GitRepo
from html_generator import HTMLGenerator
from llm_parser import LLMParser, _generate_mock_analysis
from manifest import MANIFEST_SCORER_VERSION, build_manifest, manifest_cache_key

load_dotenv()

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CACHE_DIR = os.path.join(BASE_DIR, "repo_cache")
DEFAULT_JSON_CACHE_DIR = os.path.join(BASE_DIR, "cache_json")
DEFAULT_OUTPUT_DIR = os.path.join(BASE_DIR, "report_output")


def _setup_logging() -> None:
    """Configure basic logging with timestamp format."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )


def _find_existing_report(output_dir: str, safe_repo_name: str) -> str | None:
    """Return existing report directory for a repo, or None."""
    if not os.path.isdir(output_dir):
        return None
    for entry in os.listdir(output_dir):
        if entry.startswith(safe_repo_name + "_"):
            path = os.path.join(output_dir, entry)
            if os.path.isdir(path) and os.path.isfile(os.path.join(path, "index.html")):
                return path
    return None


def parse_args():
    parser = argparse.ArgumentParser(
        description="Analyze GitHub repo iterations and generate an HTML tech-evolution report."
    )
    parser.add_argument("repo_url", help="GitHub repository URL")
    parser.add_argument("--no-llm", action="store_true",
                        help="Skip LLM analysis, generate report with mock data")
    parser.add_argument("--no-cache", action="store_true",
                        help="Skip LLM result cache, force re-analysis")
    parser.add_argument("--provider", choices=["openai", "ollama", "deepseek"],
                        default=os.environ.get("GTR_LLM_PROVIDER", "deepseek"),
                        help="LLM provider (default: deepseek)")
    parser.add_argument("--model", default=None, help="LLM model name")
    parser.add_argument("--api-key", default=None, help="API key")
    parser.add_argument("--base-url", default=None, help="API base URL")
    parser.add_argument("--output", default=None, help="Custom output HTML path")
    parser.add_argument("--cache-dir", default=DEFAULT_CACHE_DIR,
                        help="Bare repo cache directory")
    parser.add_argument("--max-diff-chars", type=int, default=10000,
                        help="Max diff chars per LLM request (default: 10000)")
    parser.add_argument("--workers", type=int, default=3,
                        help="Parallel LLM workers (default: 3)")
    parser.add_argument("--merge-patch", action="store_true", default=True,
                        help="Merge adjacent patch/minor versions (default: on)")
    parser.add_argument("--no-merge-patch", dest="merge_patch", action="store_false",
                        help="Don't merge patch versions")
    parser.add_argument("--limit", type=int, default=0,
                        help="Limit to N most recent iterations (0 = all)")
    parser.add_argument("--strategy", choices=["full", "minor-only", "major-only"], default="full",
                        help="Iteration strategy: full (all versions), minor-only (per X.Y), major-only (per X)")
    parser.add_argument("--use-manifest", action="store_true",
                        help="Use manifest-based selective patch extraction before LLM analysis")
    parser.add_argument("--manifest-max-files", type=int, default=30,
                        help="Max changed files to extract when --use-manifest is enabled")
    parser.add_argument("--no-fetch", action="store_true",
                        help="Skip git fetch on existing cached repos")
    parser.add_argument("--book", action="store_true",
                        help="Generate a book-mode analysis (Chinese product-perspective JSON report)")
    parser.add_argument("--book-section", default=None,
                        help="Optional section filter for book mode (e.g., 'arch', 'tech-stack')")
    parser.add_argument("--book-output-dir", default=None,
                        help="Custom output directory for book JSON artifacts (default: book_output/)")
    return parser.parse_args()


def _cache_key(repo_url: str, version: str, diff_text: str) -> str:
    """Generate a deterministic cache key for an iteration."""
    key = f"{repo_url}|{version}|{hashlib.sha256(diff_text.encode()).hexdigest()[:16]}"
    return hashlib.md5(key.encode()).hexdigest()


def _save_cache(cache_dir: str, cache_key: str, data: dict) -> None:
    """Save LLM analysis result to disk cache."""
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, f"{cache_key}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


def _load_cache(cache_dir: str, cache_key: str) -> dict | None:
    """Load cached LLM analysis result, or None if not found."""
    path = os.path.join(cache_dir, f"{cache_key}.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return None


def _merge_adjacent_patch_versions(iterations: list[dict], min_commits: int = 10) -> list[dict]:
    """Merge adjacent patch versions with few commits within the same minor series.

    Example: v1.0.1 (3 commits) + v1.0.2 (5 commits) + v1.0.3 (2 commits)
             → v1.0.1→v1.0.3 (10 commits)
    But v1.0.3 and v1.1.0 stay separate even if v1.0.3 is small.
    """
    if len(iterations) <= 3:
        return iterations

    def _minor_base(version: str) -> str:
        parts = version.lstrip("v").split(".")
        return ".".join(parts[:2]) if len(parts) >= 2 else parts[0]

    merged = []
    buffer = None

    for i, it in enumerate(iterations):
        curr_minor = _minor_base(it["version"])
        is_small = it["commit_count"] < min_commits
        next_minor = _minor_base(iterations[i + 1]["version"]) if i + 1 < len(iterations) else None
        can_merge = is_small and i + 1 < len(iterations) and curr_minor == next_minor

        if can_merge:
            if buffer is None:
                buffer = dict(it)
                buffer["_first_version"] = it["version"]
            else:
                buffer["_first_version"] = buffer.get("_first_version", it["version"])
                buffer["commit_count"] += it["commit_count"]
                buffer["date"] = it["date"]
                buffer["prev_hash"] = it.get("prev_hash")
                buffer["prev_tag"] = it.get("prev_tag")
                buffer["version"] = f"{buffer['_first_version']}→{it['version']}"
        else:
            if buffer:
                merged.append(buffer)
                buffer = None
            merged.append(it)

    if buffer:
        merged.append(buffer)

    return merged


def process_single_iteration(repo: GitRepo, it: dict, llm_parser: LLMParser,
                              use_llm: bool, max_diff_chars: int,
                              cache_dir: str, repo_url: str,
                              no_cache: bool, use_manifest: bool = False,
                              manifest_max_files: int = 30) -> dict | None:
    """Process one iteration — used by both serial and parallel paths."""
    version = it["version"]
    from_rev = it["prev_hash"] or it["tag_hash"]
    to_rev = it["tag_hash"]
    os.makedirs(cache_dir, exist_ok=True)

    if use_manifest:
        diff_stat = repo.get_diff_stat(from_rev, to_rev)
        commits = repo.get_commits_between(from_rev, to_rev)
        file_statuses = repo.get_name_status(from_rev, to_rev)
        manifest = build_manifest(
            repo_url=repo_url,
            from_ref=it.get("prev_tag", from_rev) or from_rev,
            to_ref=version,
            from_commit=from_rev,
            to_commit=to_rev,
            version=version,
            date=it["date"],
            commit_count=it["commit_count"],
            commits=commits,
            file_stats=diff_stat,
            max_files=manifest_max_files,
            file_statuses=file_statuses,
        )
        extraction_plan = manifest.extraction_plan
        selected_hash = hashlib.sha256(
            "|".join(extraction_plan.files).encode()
        ).hexdigest()[:12]
        cache_key = manifest_cache_key(
            repo_url,
            from_rev,
            to_rev,
            config_hash=f"{MANIFEST_SCORER_VERSION}|max_files={manifest_max_files}|max_chars={max_diff_chars}|selected={selected_hash}",
        )
        if use_llm and not no_cache:
            cached = _load_cache(cache_dir, cache_key)
            if cached:
                cached["id"] = version.replace(".", "-")
                cached["version"] = version
                cached["date"] = it["date"]
                cached["commit_count"] = it["commit_count"]
                return cached

        diff_text = repo.get_diff_for_files(from_rev, to_rev, extraction_plan.files)
        if not diff_text.strip():
            diff_text = repo.get_diff(from_rev, to_rev)
        summary_info = get_diff_summary(diff_text)
        file_list = extraction_plan.files[:50]
    else:
        diff_text = repo.get_diff(from_rev, to_rev)
        if not diff_text.strip() and not it.get("prev_hash"):
            root_rev = repo._get_root_commit()
            if root_rev:
                from_rev = root_rev
                diff_text = repo.get_diff(from_rev, to_rev)
        diff_stat = repo.get_diff_stat(from_rev, to_rev)
        summary_info = get_diff_summary(diff_text)
        file_list = repo.get_file_list(from_rev, to_rev)[:50]
        cache_key = _cache_key(repo_url, version, diff_text)
        manifest = None

    code_diff = extract_code_changes(diff_text)
    dep_diff = extract_dependency_changes(diff_text)
    combined = strip_comment_lines(code_diff + "\n" + dep_diff)

    metadata = {
        "version": version,
        "date": it["date"],
        "commit_count": it["commit_count"],
        "prev_version": it.get("prev_tag", "initial"),
        "diff_stat": diff_stat,
        "files_changed": summary_info.get("files_changed", 0),
        "changed_files": file_list,
    }
    if use_manifest and manifest is not None:
        metadata["manifest"] = manifest.to_dict()
        metadata["manifest_selected_files"] = file_list

    if use_llm and combined.strip():
        if not use_manifest and not no_cache:
            cached = _load_cache(cache_dir, cache_key)
            if cached:
                cached["id"] = version.replace(".", "-")
                cached["version"] = version
                cached["date"] = it["date"]
                cached["commit_count"] = it["commit_count"]
                return cached

        if len(combined) > max_diff_chars:
            combined = combined[:max_diff_chars] + f"\n... [truncated {len(combined) - max_diff_chars} chars]"

        analysis = llm_parser.analyze_with_fallback(combined, metadata)
        _save_cache(cache_dir, cache_key, analysis)
    else:
        analysis = _generate_mock_analysis(metadata)

    analysis["id"] = version.replace(".", "-")
    analysis["version"] = version
    analysis["date"] = it["date"]
    analysis["commit_count"] = it["commit_count"]

    return analysis


def build_report_data(
    repo: GitRepo,
    repo_info: dict,
    iterations_data: list[dict],
    llm_parser: LLMParser,
    use_llm: bool,
    max_diff_chars: int,
    cache_dir: str,
    repo_url: str,
    no_cache: bool,
    workers: int,
    use_manifest: bool = False,
    manifest_max_files: int = 30,
) -> dict:
    """Process all iterations and build the complete report data structure."""
    total = len(iterations_data)
    results = {}

    if workers > 1 and use_llm:
        logger.info(f"  Processing {total} iterations with {workers} workers...")
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(
                    process_single_iteration,
                    repo, it, llm_parser, use_llm, max_diff_chars,
                    cache_dir, repo_url, no_cache, use_manifest,
                    manifest_max_files,
                ): it["version"]
                for it in iterations_data
            }
            for future in as_completed(futures):
                version = futures[future]
                try:
                    result = future.result()
                    if result:
                        results[version] = result
                        logger.info(f"  ✓ {version}")
                except Exception:
                    logger.exception(f"  ✗ {version}")
    else:
        for it in iterations_data:
            version = it['version']
            logger.info(f"  Processing {version}...")
            try:
                result = process_single_iteration(
                    repo, it, llm_parser, use_llm, max_diff_chars,
                    cache_dir, repo_url, no_cache, use_manifest,
                    manifest_max_files,
                )
                if result:
                    results[version] = result
                else:
                    logger.warning(f"  ⚠ {version}: returned None")
            except (OSError, json.JSONDecodeError, ValueError, RuntimeError) as e:
                logger.error(f"  ✗ {version}: {e}")
                results[version] = _generate_mock_analysis(it, str(e) or type(e).__name__)
                results[version]["id"] = version.replace(".", "-")
                results[version]["version"] = version
                results[version]["date"] = it["date"]
                results[version]["commit_count"] = it["commit_count"]

    iterations = [results[it["version"]] for it in iterations_data if it["version"] in results]

    repo_name = repo_info.get("name", "")
    return {
        "repo": {
            "name": repo_name,
            "url": repo_info.get("url", ""),
            "description": repo_info.get("description", ""),
        },
        "analysis_time": datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
        "iterations": iterations,
    }


def build_structural_report(
    repo: GitRepo,
    repo_info: dict,
    llm_parser: LLMParser,
    use_llm: bool,
    workers: int,
    cache_dir: str,
    repo_url: str,
    no_cache: bool,
) -> dict:
    logger.info("  Discovering modules...")
    modules = repo.discover_modules()
    logger.info(f"  ✓ Found {len(modules)} modules")

    total_files = sum(m["file_count"] for m in modules)
    total_lines = sum(m["total_lines"] for m in modules)

    overview = {}
    if use_llm:
        logger.info("  [Phase 1/3] Analyzing codebase overview...")
        project_info = {
            "total_files": total_files,
            "total_lines": total_lines,
            "tech_stack": repo_info.get("tech_stack", {}),
            "entry_points": repo_info.get("entry_points", []),
        }
        try:
            overview = llm_parser.analyze_codebase_overview(modules, project_info)
            logger.info("  ✓ Overview complete")
        except (json.JSONDecodeError, OSError, ValueError, RuntimeError) as e:
            logger.error(f"  ✗ Overview failed: {e}")

    mod_results = {}
    if use_llm and modules:
        logger.info(f"  [Phase 2/3] Analyzing {len(modules)} modules (deep mode, {workers} workers)...")
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(
                    _analyze_module_cached,
                    repo, m, llm_parser, use_llm,
                    cache_dir, repo_url, no_cache, deep=True,
                ): m["name"]
                for m in modules
            }
            for future in as_completed(futures):
                name = futures[future]
                try:
                    result = future.result()
                    if result:
                        mod_results[name] = result
                        logger.info(f"  ✓ {name}")
                except Exception:
                    logger.exception(f"  ✗ {name}")

    analyzed_modules = []
    for m in modules:
        analysis = mod_results.get(m["name"], {
            "name": m["name"], "purpose": "", "architecture": "",
            "implementation": "", "design_decisions": [],
            "rules_and_constraints": [], "dependencies": [],
            "patterns": [], "highlights": [], "weaknesses": [],
            "diagram": None,
        })
        analyzed_modules.append({**m, "analysis": analysis})

    synthesis = {}
    if use_llm and overview and len(analyzed_modules) >= 3:
        logger.info("  [Phase 3/3] Synthesizing methodology & reusable patterns...")
        try:
            synthesis = llm_parser.synthesize_methodology(
                overview,
                [ma["analysis"] for ma in analyzed_modules],
            )
            logger.info("  ✓ Synthesis complete")
        except (json.JSONDecodeError, OSError, ValueError, RuntimeError) as e:
            logger.error(f"  ✗ Synthesis failed: {e}")

    return {
        "repo": {
            "name": repo_info.get("name", ""),
            "url": repo_info.get("url", ""),
            "description": repo_info.get("description", ""),
        },
        "analysis_time": datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
        "overview": overview,
        "modules": analyzed_modules,
        "synthesis": synthesis,
        "total_files": total_files,
        "total_lines": total_lines,
    }


def _analyze_module_cached(
    repo: GitRepo, module: dict, llm_parser: LLMParser,
    use_llm: bool, cache_dir: str, repo_url: str, no_cache: bool,
    deep: bool = False,
) -> dict | None:
    mode = "deep" if deep else "shallow"
    cache_key = hashlib.md5(
        f"{repo_url}|{mode}|{module['name']}|{module['file_count']}|{module['total_lines']}".encode()
    ).hexdigest()
    os.makedirs(cache_dir, exist_ok=True)

    if use_llm and not no_cache:
        cached = _load_cache(cache_dir, cache_key)
        if cached:
            return cached

    if not use_llm:
        kf_paths = [kf["path"] for kf in module.get("key_files", [])[:3]]
        return {
            "name": module["name"],
            "purpose": f"{module['name']} 模块（{module['file_count']} 文件, {module['total_lines']} 行）",
            "architecture": f"包含 {', '.join(kf_paths) if kf_paths else '?'} 等关键文件",
            "implementation": f"共 {module['file_count']} 个文件，{module['total_lines']} 行代码",
            "design_decisions": [],
            "rules_and_constraints": [],
            "dependencies": [],
            "patterns": [],
            "highlights": [],
            "weaknesses": [],
            "diagram": None,
        }

    result = llm_parser.analyze_module(module, deep=deep)
    _save_cache(cache_dir, cache_key, result)
    return result


def _main_book(repo: GitRepo, repo_meta: dict, args) -> str:
    """
    Book mode: generate a Chinese product-perspective JSON analysis report.

    If book_analyzer.py exists, delegates to build_book_report().
    Otherwise, writes a manifest JSON with repo metadata as a stub artifact,
    so the pipeline is safe even before the core book module is implemented.
    """
    base_dir = os.path.join(BASE_DIR, "book_output")
    if args.book_output_dir:
        base_dir = args.book_output_dir
        if not os.path.isabs(base_dir):
            base_dir = os.path.join(BASE_DIR, base_dir)

    safe_name = repo_meta["name"].replace("/", "_").replace(" ", "_")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = os.path.join(base_dir, f"{safe_name}_{timestamp}")
    os.makedirs(output_dir, exist_ok=True)

    repo_info = {
        "name": repo_meta["name"],
        "url": repo_meta.get("url", ""),
        "total_commits": repo_meta.get("total_commits", 0),
        "first_commit_date": repo_meta.get("first_commit_date", ""),
        "default_branch": repo_meta.get("default_branch", ""),
        "tag_count": repo_meta.get("tag_count", 0),
        "section_filter": args.book_section,
    }

    logger.info("\n  📖 Book mode: generating Chinese product-perspective analysis")
    logger.info(f"  Output dir: {output_dir}")

    try:
        import book_analyzer  # type: ignore[import-not-found]
    except ImportError:
        logger.warning("  ⚠ book_analyzer module not found — writing stub manifest JSON.")
        logger.info("  → To enable full book analysis, implement book_analyzer.py with:")
        logger.info("      def build_book_report(repo, repo_info, llm_parser, use_llm, output_dir, section=None, **kwargs) -> dict")

        # Write stub manifest so the pipeline produces a valid artifact.
        manifest = {
            "mode": "book",
            "status": "stub — book_analyzer module not available",
            "repo": repo_info,
            "analysis_time": datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
            "section_filter": args.book_section,
            "output_dir": output_dir,
        }
        manifest_path = os.path.join(output_dir, "book_manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
        logger.info(f"  ✓ Stub manifest written → {manifest_path}")
        return output_dir

    # book_analyzer is available — delegate to it.
    llm_parser = LLMParser(
        provider=args.provider, model=args.model,
        api_key=args.api_key, base_url=args.base_url,
    )
    use_llm = not args.no_llm

    logger.info("  [Book] Running full book analysis pipeline...")
    build_book_report = getattr(book_analyzer, "build_book_report", None)
    if not build_book_report:
        raise ImportError("book_analyzer.build_book_report not found")
    try:
        _ = build_book_report(
            repo=repo,
            repo_info=repo_info,
            llm_parser=llm_parser,
            use_llm=use_llm,
            output_dir=output_dir,
            section=args.book_section,
            workers=args.workers,
            no_cache=args.no_cache,
            cache_dir=os.path.join(BASE_DIR, "cache_json"),
        )
    except (OSError, json.JSONDecodeError, ValueError, RuntimeError) as e:
        logger.error(f"  ✗ Book analysis failed: {e}")
        # Still write a partial manifest on failure.
        error_manifest = {
            "mode": "book",
            "status": f"error — {e}",
            "repo": repo_info,
            "analysis_time": datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
            "section_filter": args.book_section,
            "output_dir": output_dir,
        }
        manifest_path = os.path.join(output_dir, "book_manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(error_manifest, f, indent=2, ensure_ascii=False)
        raise

    logger.info(f"  ✓ Book report complete → {output_dir}")
    return output_dir


def main():
    args = parse_args()
    _setup_logging()

    repo_url = args.repo_url.rstrip("/")
    repo_name = repo_url.split("/")[-1].removesuffix(".git")
    owner = repo_url.split("/")[-2]

    cache_dir = args.cache_dir
    json_cache_dir = DEFAULT_JSON_CACHE_DIR
    model_display = args.model or "default"

    logger.info(f"\n{'='*60}")
    logger.info("  GitHub Tech Reader — Iteration Analysis Pipeline")
    logger.info(f"  Repo: {owner}/{repo_name}")
    logger.info(f"  LLM: {'disabled' if args.no_llm else f'{args.provider}/{model_display}'}")
    logger.info(f"  Workers: {args.workers}  |  Cache: {'off' if args.no_cache else 'on'}")
    if args.merge_patch:
        logger.info("  Merge patch versions: on (threshold: <10 commits)")
    logger.info(f"{'='*60}\n")

    t_start = time.time()

    logger.info("[1/4] Cloning bare repository...")
    repo = GitRepo.clone_bare(repo_url, cache_dir, skip_fetch=args.no_fetch)
    if not args.no_fetch:
        repo.fetch()
    logger.info(f"  ✓ Bare repo at {repo.path}")

    repo_meta = repo.get_repo_metadata()
    repo_meta["name"] = f"{owner}/{repo_name}"
    repo_meta["url"] = repo_url

    if args.book:
        logger.info("[2/2] Book mode — generating Chinese product-perspective analysis...")
        t_start = time.time()
        output_dir = _main_book(repo, repo_meta, args)
        elapsed = time.time() - t_start
        logger.info(f"\n{'='*60}")
        logger.info(f"  ✓ Book report: {output_dir}")
        logger.info(f"  ⏱  Elapsed: {elapsed:.1f}s")

        try:
            generator = HTMLGenerator(output_dir=DEFAULT_OUTPUT_DIR)
            html_path = generator.generate_book(output_dir)
            logger.info(f"  ✓ Book HTML: {html_path}")
        except (OSError, RuntimeError) as e:
            logger.warning(f"  ⚠ Book HTML render skipped: {e}")

        logger.info(f"{'='*60}\n")
        return output_dir

    logger.info("[2/4] Extracting iterations...")
    all_tags = repo.get_tags()

    if args.strategy != "full":
        iterations_raw = repo.filter_by_strategy(args.strategy)
        logger.info(f"  ✓ Strategy: {args.strategy} → {len(iterations_raw)} iterations")
    else:
        iterations_raw = repo.extract_iterations()

    if not iterations_raw:
        logger.warning("  ⚠ No tags found. Using commit-chunk analysis...")
        iterations_raw = repo.extract_commit_chunks()
        logger.info(f"  ✓ Created {len(iterations_raw)} chunks from commit history")

    use_structural = False
    iterations_data = iterations_raw
    if len(iterations_raw) <= 1 and repo.get_commit_count() <= 1:
        logger.warning("  ⚠ Single/missing commit — switching to structural analysis...")
        use_structural = True

    if not use_structural:
        if args.merge_patch and args.strategy == "full":
            iterations_data = _merge_adjacent_patch_versions(iterations_raw)
            merged_count = len(iterations_raw) - len(iterations_data)
            if merged_count:
                logger.info(f"  ✓ Merged {merged_count} small patch versions → {len(iterations_data)} iterations")
        else:
            iterations_data = iterations_raw

    if args.limit and args.limit < len(iterations_data):
        iterations_data = iterations_data[-args.limit:]
        logger.info(f"  ✓ Limited to {args.limit} most recent iterations")

    logger.info(f"  ✓ Tags: {len(all_tags)}, Iterations: {len(iterations_data)}")

    llm_parser = LLMParser(
        provider=args.provider, model=args.model,
        api_key=args.api_key, base_url=args.base_url,
    )
    use_llm = not args.no_llm

    if use_structural:
        repo_meta["description"] = (
            f"代码结构分析 — {repo_meta['total_commits']} 次提交, "
            f"扫描所有模块与依赖关系。"
        )
        logger.info("[3/4] Analyzing code structure...")
        report_data = build_structural_report(
            repo, repo_meta, llm_parser,
            use_llm, args.workers, json_cache_dir,
            repo_url, args.no_cache,
        )
    else:
        repo_meta["description"] = (
            f"分析 {len(iterations_data)} 个版本迭代，共 {repo_meta['total_commits']} 次提交。"
        )
        report_data = build_report_data(
            repo, repo_meta, iterations_data, llm_parser,
            use_llm, args.max_diff_chars, json_cache_dir,
            repo_url, args.no_cache, args.workers,
            args.use_manifest, args.manifest_max_files,
        )

    if use_llm:
        from llm_parser import LLMParser as _LLM
        logger.info(
            f"\n  📊 Token stats: {_LLM.total_calls} calls | "
            f"input={_LLM.total_input_tokens:,} tokens | "
            f"output={_LLM.total_output_tokens:,} tokens | "
            f"total={_LLM.total_input_tokens + _LLM.total_output_tokens:,} tokens"
        )

    # Step 4: Generate HTML
    logger.info("[4/4] Generating HTML report...")
    existing_dir = _find_existing_report(DEFAULT_OUTPUT_DIR, f"{owner}_{repo_name}")
    generator = HTMLGenerator(output_dir=DEFAULT_OUTPUT_DIR)
    if use_structural:
        output_path = generator.generate_structural(report_data, args.output, existing_dir=existing_dir)
    else:
        output_path = generator.generate(report_data, args.output, existing_dir=existing_dir)

    elapsed = time.time() - t_start
    logger.info(f"\n{'='*60}")
    logger.info(f"  ✓ Report: {output_path}")
    logger.info(f"  ⏱  Elapsed: {elapsed:.1f}s")
    logger.info(f"{'='*60}\n")

    return output_path


if __name__ == "__main__":
    main()
