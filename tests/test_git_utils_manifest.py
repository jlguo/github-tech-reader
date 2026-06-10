from __future__ import annotations

import subprocess
from pathlib import Path

from git_utils import GitRepo


def _run_git(repo_path: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo_path), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def _commit(repo_path: Path, message: str) -> str:
    _run_git(repo_path, "add", ".")
    _run_git(repo_path, "commit", "-m", message)
    return _run_git(repo_path, "rev-parse", "HEAD")


def test_git_metadata_methods_and_selective_diff(tmp_path: Path) -> None:
    repo_path = tmp_path / "repo"
    repo_path.mkdir()
    _run_git(repo_path, "init")
    _run_git(repo_path, "config", "user.email", "test@example.com")
    _run_git(repo_path, "config", "user.name", "Test User")

    (repo_path / "src").mkdir()
    (repo_path / "src" / "auth.py").write_text("def login():\n    return True\n", encoding="utf-8")
    first = _commit(repo_path, "feat(auth): initial login")

    (repo_path / "src" / "auth.py").write_text("def login():\n    return False\n", encoding="utf-8")
    (repo_path / "requirements.txt").write_text("rich>=13\n", encoding="utf-8")
    second = _commit(repo_path, "perf(auth): tighten login flow")

    repo = GitRepo(str(repo_path))

    name_status = repo.get_name_status(first, second)
    numstat = repo.get_numstat(first, second)
    shortstat = repo.get_shortstat(first, second)
    messages = repo.get_commit_messages(first, second)
    selected_diff = repo.get_diff_for_files(first, second, ["requirements.txt"])
    empty_diff = repo.get_diff_for_files(first, second, [])

    assert {item["path"] for item in name_status} == {"src/auth.py", "requirements.txt"}
    assert {item["path"] for item in numstat} == {"src/auth.py", "requirements.txt"}
    assert "files changed" in shortstat
    assert messages == ["perf(auth): tighten login flow"]
    assert "requirements.txt" in selected_diff
    assert "src/auth.py" not in selected_diff
    assert empty_diff == ""
