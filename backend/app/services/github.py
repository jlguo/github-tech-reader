import httpx
from datetime import datetime

from app.core.config import settings

# Module-level shared client for connection pooling across all GitHub API calls.
# Created lazily on first use; closed via shutdown event in main.py.
_shared_client: httpx.AsyncClient | None = None


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


async def fetch_key_files(full_name: str) -> dict[str, str]:
    tree = await fetch_repo_tree(full_name)
    if not tree:
        return {}

    priority_extensions = {".py", ".ts", ".tsx", ".js", ".go", ".rs", ".md", ".yml", ".yaml", ".toml"}
    max_size = 100000

    files = [
        f for f in tree
        if any(f["path"].endswith(ext) for ext in priority_extensions)
        and (f.get("size") or 0) < max_size
    ]
    files.sort(key=lambda f: f.get("size") or 0, reverse=True)
    files = files[:settings.book_max_files_to_fetch]

    result = {}
    client = _get_client()
    for f in files:
        url = f"{settings.github_api_base}/repos/{full_name}/contents/{f['path']}"
        headers = {"Accept": "application/vnd.github.raw+json"}
        if settings.github_token:
            headers["Authorization"] = f"Bearer {settings.github_token}"
        resp = await client.get(url, headers=headers)
        if resp.status_code == 200:
            result[f["path"]] = resp.text
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
