import httpx
from datetime import datetime

from app.core.config import settings


async def fetch_repo_info(full_name: str) -> dict | None:
    url = f"{settings.github_api_base}/repos/{full_name}"
    headers = {"Accept": "application/vnd.github+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            return None

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

    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            return None
        return resp.text
