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
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from dotenv import load_dotenv
from git_utils import GitRepo
from diff_preprocessor import (
    strip_comment_lines,
    extract_code_changes,
    extract_dependency_changes,
    get_diff_summary,
)
from llm_parser import LLMParser, _generate_mock_analysis
from html_generator import HTMLGenerator
from manifest import build_manifest, manifest_cache_key, MANIFEST_SCORER_VERSION


load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CACHE_DIR = os.path.join(BASE_DIR, "repo_cache")
DEFAULT_JSON_CACHE_DIR = os.path.join(BASE_DIR, "cache_json")
DEFAULT_OUTPUT_DIR = os.path.join(BASE_DIR, "report_output")


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
    return parser.parse_args()


def _cache_key(repo_url: str, version: str, diff_text: str) -> str:
    """Generate a deterministic cache key for an iteration."""
    key = f"{repo_url}|{version}|{hashlib.sha256(diff_text.encode()).hexdigest()[:16]}"
    return hashlib.md5(key.encode()).hexdigest()


def _save_cache(cache_dir: str, cache_key: str, data: dict) -> None:
    """Save LLM analysis result to disk cache."""
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, f"{cache_key}.json")
    with open(path, "w") as f:
        json.dump(data, f, ensure_ascii=False)


def _load_cache(cache_dir: str, cache_key: str) -> dict | None:
    """Load cached LLM analysis result, or None if not found."""
    path = os.path.join(cache_dir, f"{cache_key}.json")
    if os.path.exists(path):
        with open(path) as f:
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
        print(f"  Processing {total} iterations with {workers} workers...")
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
                        print(f"  ✓ {version}")
                except Exception as e:
                    print(f"  ✗ {version}: {e}")
    else:
        for it in iterations_data:
            version = it['version']
            print(f"  Processing {version}...")
            try:
                result = process_single_iteration(
                    repo, it, llm_parser, use_llm, max_diff_chars,
                    cache_dir, repo_url, no_cache, use_manifest,
                    manifest_max_files,
                )
                if result:
                    results[version] = result
                else:
                    print(f"  ⚠ {version}: returned None")
            except Exception as e:
                print(f"  ✗ {version}: {e}")
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
        "analysis_time": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "iterations": iterations,
    }


def main():
    args = parse_args()

    repo_url = args.repo_url.rstrip("/")
    repo_name = repo_url.split("/")[-1].removesuffix(".git")
    owner = repo_url.split("/")[-2]

    cache_dir = args.cache_dir
    json_cache_dir = DEFAULT_JSON_CACHE_DIR
    model_display = args.model or "default"

    print(f"\n{'='*60}")
    print("  GitHub Tech Reader — Iteration Analysis Pipeline")
    print(f"  Repo: {owner}/{repo_name}")
    print(f"  LLM: {'disabled' if args.no_llm else f'{args.provider}/{model_display}'}")
    print(f"  Workers: {args.workers}  |  Cache: {'off' if args.no_cache else 'on'}")
    if args.merge_patch:
        print("  Merge patch versions: on (threshold: <10 commits)")
    print(f"{'='*60}\n")

    t_start = time.time()

    print("[1/4] Cloning bare repository...")
    repo = GitRepo.clone_bare(repo_url, cache_dir, skip_fetch=args.no_fetch)
    if not args.no_fetch:
        repo.fetch()
    print(f"  ✓ Bare repo at {repo.path}")

    print("[2/4] Extracting iterations...")
    all_tags = repo.get_tags()

    if args.strategy != "full":
        iterations_raw = repo.filter_by_strategy(args.strategy)
        print(f"  ✓ Strategy: {args.strategy} → {len(iterations_raw)} iterations")
    else:
        iterations_raw = repo.extract_iterations()

    if not iterations_raw:
        print("  ⚠ No iterations found. Creating single-iteration from HEAD...")
        default_branch = repo.get_default_branch()
        iterations_raw = [{
            "version": "HEAD",
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "tag_hash": f"refs/heads/{default_branch}",
            "prev_hash": None,
            "prev_tag": None,
            "commit_count": repo.get_commit_count(),
        }]

    if args.merge_patch and args.strategy == "full":
        iterations_data = _merge_adjacent_patch_versions(iterations_raw)
        merged_count = len(iterations_raw) - len(iterations_data)
        if merged_count:
            print(f"  ✓ Merged {merged_count} small patch versions → {len(iterations_data)} iterations")
    else:
        iterations_data = iterations_raw

    if args.limit and args.limit < len(iterations_data):
        iterations_data = iterations_data[-args.limit:]
        print(f"  ✓ Limited to {args.limit} most recent iterations")

    print(f"  ✓ Tags: {len(all_tags)}, Iterations: {len(iterations_data)}")

    print("[3/4] Analyzing iterations...")
    llm_parser = LLMParser(
        provider=args.provider, model=args.model,
        api_key=args.api_key, base_url=args.base_url,
    )
    use_llm = not args.no_llm

    repo_meta = repo.get_repo_metadata()
    repo_meta["name"] = f"{owner}/{repo_name}"
    repo_meta["url"] = repo_url
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
        print(f"\n  📊 Token stats: {_LLM.total_calls} calls | "
              f"input={_LLM.total_input_tokens:,} tokens | "
              f"output={_LLM.total_output_tokens:,} tokens | "
              f"total={_LLM.total_input_tokens + _LLM.total_output_tokens:,} tokens")

    # Step 4: Generate HTML
    print("[4/4] Generating HTML report...")
    generator = HTMLGenerator(output_dir=DEFAULT_OUTPUT_DIR)
    output_path = generator.generate(report_data, args.output)

    elapsed = time.time() - t_start
    print(f"\n{'='*60}")
    print(f"  ✓ Report: {output_path}")
    print(f"  ⏱  Elapsed: {elapsed:.1f}s")
    print(f"{'='*60}\n")

    return output_path


if __name__ == "__main__":
    main()
