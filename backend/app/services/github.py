import httpx
from datetime import datetime
from collections import Counter

from app.core.config import settings

# Module-level shared client for connection pooling across all GitHub API calls.
# Created lazily on first use; closed via shutdown event in main.py.
_shared_client: httpx.AsyncClient | None = None

# Priority file extensions used by fetch_key_files and measure_repo_scope.
PRIORITY_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".go", ".rs", ".md", ".yml", ".yaml", ".toml"}


def _get_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient()
    return _shared_client


async def close_github_client():
    global _shared_client
    if _shared_client and not _shared_client.is_closed:
        await _shared_client.aclose()
        _shared_client = None


def _github_headers() -> dict:
    headers = {"Accept": "application/vnd.github+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


async def fetch_repo_info(full_name: str) -> dict | None:
    url = f"{settings.github_api_base}/repos/{full_name}"
    client = _get_client()
    resp = await client.get(url, headers=_github_headers())
    if resp.status_code == 404:
        return None
    if resp.status_code == 403:
        raise Exception("GitHub API rate limit exceeded. Set GITHUB_TOKEN in backend/.env to increase the limit (60 → 5000 req/hr).")
    if resp.status_code != 200:
        raise Exception(f"GitHub API error: {resp.status_code} — {resp.text[:200]}")
    data = resp.json()
    return {
        "github_id": data["id"],
        "full_name": data["full_name"],
        "owner": data["owner"]["login"],
        "name": data["name"],
        "description": data.get("description"),
        "html_url": data["html_url"],
        "stars": data.get("stargazers_count", 0),
        "forks": data.get("forks_count", 0),
        "language": data.get("language"),
        "topics": data.get("topics", []),
        "license_": data["license"]["spdx_id"] if data.get("license") else None,
        "default_branch": data.get("default_branch", "main"),
        "created_at_github": (
            datetime.fromisoformat(data["created_at"].replace("Z", "+00:00"))
            if data.get("created_at") else None
        ),
        "updated_at_github": (
            datetime.fromisoformat(data["updated_at"].replace("Z", "+00:00"))
            if data.get("updated_at") else None
        ),
    }


async def fetch_readme(full_name: str) -> str | None:
    url = f"{settings.github_api_base}/repos/{full_name}/readme"
    headers = {"Accept": "application/vnd.github.raw+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    client = _get_client()
    resp = await client.get(url, headers=headers)
    if resp.status_code != 200:
        return None
    return resp.text


async def fetch_repo_tree(full_name: str) -> list[dict]:
    url = f"{settings.github_api_base}/repos/{full_name}/git/trees/HEAD"
    params = {"recursive": "1"}
    client = _get_client()
    resp = await client.get(url, headers=_github_headers(), params=params)
    if resp.status_code != 200:
        return []
    tree = resp.json().get("tree", [])
    return [
        {"path": t["path"], "type": t["type"], "size": t.get("size")}
        for t in tree
        if t["type"] == "blob"
    ]


async def measure_repo_scope(full_name: str) -> dict:
    tree = await fetch_repo_tree(full_name)
    total_files = len(tree)

    code_files_list = [
        f for f in tree
        if any(f["path"].endswith(ext) for ext in PRIORITY_EXTENSIONS)
    ]
    code_files = len(code_files_list)
    total_bytes = sum(f.get("size") or 0 for f in code_files_list)
    est_loc = total_bytes // 40

    dirs: set[str] = set()
    top_segments: Counter[str] = Counter()
    lang_counter: Counter[str] = Counter()

    for f in code_files_list:
        p = f["path"]
        if "/" in p:
            dirs.add(p.rsplit("/", 1)[0])
            top_segments[p.split("/", 1)[0]] += 1
        else:
            top_segments["."] += 1
        ext = next(e for e in PRIORITY_EXTENSIONS if p.endswith(e))
        lang_counter[ext] += 1

    return {
        "total_files": total_files,
        "code_files": code_files,
        "total_bytes": total_bytes,
        "est_loc": est_loc,
        "dir_count": len(dirs),
        "top_dirs": [seg for seg, _ in top_segments.most_common(10)],
        "language_mix": dict(lang_counter),
    }


async def fetch_file_content(full_name: str, path: str) -> str | None:
    url = f"{settings.github_api_base}/repos/{full_name}/contents/{path}"
    headers = {"Accept": "application/vnd.github.raw+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    client = _get_client()
    resp = await client.get(url, headers=headers)
    if resp.status_code != 200:
        return None
    return resp.text


def _relevance_score(path: str, size: int) -> float:
    """Rank a file's relevance for code analysis (higher = more valuable to read)."""
    score = 0.0

    filename = path.rsplit("/", 1)[-1] if "/" in path else path
    segments = path.split("/")
    lower_path = path.lower()
    path_segments = lower_path.split("/")

    # +++ BOOSTS +++

    # Entrypoint filenames — these are the most valuable files to understand a project
    if any(filename.startswith(p) for p in ("main.", "app.", "index.", "cli.")):
        score += 50
    if filename in ("__init__.py", "lib.rs", "mod.rs"):
        score += 50

    # Shallow paths — fewer segments = closer to root = more likely structural
    score += max(0, 10 - len(segments)) * 5

    # Files under core source directories
    if segments[0] in {"src", "app", "lib", "pkg", "internal"}:
        score += 20

    # README and top-level markdown
    if filename.upper() == "README" or (path.endswith(".md") and len(segments) == 1):
        score += 15

    # --- PENALTIES ---

    # Tests, fixtures, mocks, examples, e2e
    test_keywords = {"test", "tests", "__tests__", "spec", "fixture", "mock",
                     "example", "examples", "e2e"}
    if any(seg in test_keywords for seg in path_segments):
        score -= 30

    # Generated / vendored directories
    generated_dirs = {"dist", "build", "node_modules", "vendor", "__pycache__",
                      "migrations"}
    if any(seg in generated_dirs for seg in path_segments):
        score -= 20
    if ".min." in lower_path or ".generated." in lower_path:
        score -= 20

    # Lockfiles — almost never useful for analysis
    if path.endswith(".lock") or filename in (
        "package-lock.json", "poetry.lock", "uv.lock", "yarn.lock", "Cargo.lock"
    ):
        score -= 100

    # Very large single files are unlikely to be useful as a whole
    if size > 50000:
        score -= 20

    return score


async def fetch_key_files(full_name: str, max_files: int | None = None, progress_callback=None) -> dict[str, str]:
    tree = await fetch_repo_tree(full_name)
    if not tree:
        return {}

    max_size = 100000

    files = [
        f for f in tree
        if any(f["path"].endswith(ext) for ext in PRIORITY_EXTENSIONS)
        and (f.get("size") or 0) < max_size
    ]
    files.sort(
        key=lambda f: _relevance_score(f["path"], f.get("size") or 0),
        reverse=True,
    )
    limit = max_files if max_files is not None else settings.book_max_files_to_fetch
    files = files[:limit]

    if progress_callback:
        await progress_callback(phase_items_total=len(files), phase_items_completed=0)

    result = {}
    client = _get_client()
    for i, f in enumerate(files):
        url = f"{settings.github_api_base}/repos/{full_name}/contents/{f['path']}"
        headers = {"Accept": "application/vnd.github.raw+json"}
        if settings.github_token:
            headers["Authorization"] = f"Bearer {settings.github_token}"
        resp = await client.get(url, headers=headers)
        if resp.status_code == 200:
            result[f["path"]] = resp.text
        if progress_callback:
            await progress_callback(phase_items_total=len(files), phase_items_completed=i + 1)
    return result


async def fetch_top_issues(full_name: str, count: int = 10) -> list[dict]:
    url = f"{settings.github_api_base}/repos/{full_name}/issues"
    params = {"state": "all", "per_page": count, "sort": "comments", "direction": "desc"}
    client = _get_client()
    resp = await client.get(url, headers=_github_headers(), params=params)
    if resp.status_code != 200:
        return []
    return [
        {"title": i["title"], "body": (i.get("body") or "")[:500], "state": i["state"]}
        for i in resp.json()
        if "pull_request" not in i
    ]
