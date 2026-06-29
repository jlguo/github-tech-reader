"""
Delete ONLY books created by the e2e test suite.

Usage (from backend/):
    uv run python scripts/cleanup_test_books.py          # delete matching test books
    uv run python scripts/cleanup_test_books.py --dry-run # list what would be deleted

Test books are matched against a fixed allowlist of titles the e2e suite is
known to create (uploaded fixtures + repos/URLs imported by tests). Real user
books and demo seed books are never touched. Run with --dry-run first if unsure.
"""
import asyncio
import sys

import httpx

API_BASE = "http://localhost:8000"

# Titles the e2e suite uploads or imports. Sourced from frontend/tests/e2e/*.spec.ts
# and fixtures/test-files. Keep in sync when tests add new fixtures.
TEST_TITLES = {
    "test",
    "smoke-test",
    "delete-me",
    "edit-me",
    "progress-test",
    "dive-into-docker",
    "Docker-podman",
    "AWS-digital-Transform",
    "classic-books",
    "RESTful-Web-APIs",
    "multipage",
}

# Repo slugs / URLs the e2e suite imports as real network operations.
TEST_REPO_SLUGS = {
    "facebook/react",
    "existing/repo",
}


def is_test_book(book: dict) -> bool:
    title = (book.get("title") or "").strip()
    if title in TEST_TITLES:
        return True
    full_name = (book.get("full_name") or "").strip()
    if full_name in TEST_REPO_SLUGS:
        return True
    return False


async def main():
    dry_run = "--dry-run" in sys.argv
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{API_BASE}/api/books", params={"limit": 500})
        resp.raise_for_status()
        books = resp.json()

        targets = [b for b in books if is_test_book(b)]
        kept = [b for b in books if not is_test_book(b)]

        print(f"Found {len(books)} books total: {len(targets)} test, {len(kept)} preserved.")
        for b in kept:
            print(f"  [KEEP] {b.get('title', '?')}")

        if not targets:
            print("No test books to clean.")
            return

        deleted = 0
        failed = 0
        for book in targets:
            repo_id = book.get("repo_id") or book.get("book_id")
            label = f"{book.get('title', '?')} ({str(repo_id)[:8]}...)"
            if dry_run:
                print(f"  [DRY-RUN] would delete: {label}")
                continue
            try:
                del_resp = await client.delete(f"{API_BASE}/api/books/{repo_id}")
                if del_resp.status_code == 200:
                    deleted += 1
                    print(f"  [OK] Deleted: {label}")
                else:
                    failed += 1
                    print(f"  [FAIL] {label}: HTTP {del_resp.status_code}")
            except Exception as e:
                failed += 1
                print(f"  [ERR] {label}: {e}")

        if dry_run:
            print(f"\nDry run. {len(targets)} test books would be deleted.")
        else:
            print(f"\nDone. Deleted: {deleted}, Failed: {failed}")


if __name__ == "__main__":
    asyncio.run(main())
