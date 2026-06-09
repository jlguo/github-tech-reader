"""
Git utility module for bare repository operations.

Handles cloning, fetching, tag extraction, commit diffing, and
iteration boundary detection for GitHub repository analysis.
"""

import subprocess
import os
from datetime import datetime, timezone
from typing import Optional


class GitRepo:
    """Wrapper around local bare Git repository operations."""

    def __init__(self, repo_path: str):
        self.path = repo_path
        self._git = ["git", "-C", repo_path]

    # ---- Lifecycle ----

    @classmethod
    def clone_bare(cls, url: str, cache_dir: str) -> "GitRepo":
        """Clone a bare repository into cache_dir/{owner}_{repo}.git."""
        name = url.rstrip("/").split("/")[-1]
        if name.endswith(".git"):
            name = name[:-4]
        owner = url.rstrip("/").split("/")[-2]
        dirname = f"{owner}_{name}.git"
        target = os.path.join(cache_dir, dirname)

        if os.path.isdir(target):
            repo = cls(target)
            repo.fetch()
        else:
            os.makedirs(cache_dir, exist_ok=True)
            subprocess.run(
                ["git", "clone", "--bare", "--filter=blob:none", url, target],
                check=True, capture_output=True,
            )
            repo = cls(target)
        return repo

    def fetch(self, depth: Optional[int] = None) -> None:
        """Update the bare repo from remote."""
        cmd = ["git", "-C", self.path, "fetch", "--tags", "--force"]
        if depth:
            cmd += ["--depth", str(depth)]
        subprocess.run(cmd, check=True, capture_output=True)

    # ---- Queries ----

    def get_tags(self) -> list[dict]:
        """Return all tags sorted by commit date descending.

        Returns list of {name, date, commit_hash, is_annotated}.
        """
        fmt = "%(refname:short)%00%(creatordate:iso-strict)%00%(objectname:short)%00%(objecttype)"
        try:
            result = subprocess.run(
                ["git", "-C", self.path, "for-each-ref", "refs/tags", f"--format={fmt}", "--sort=-creatordate"],
                check=True, capture_output=True, text=True,
            )
        except subprocess.CalledProcessError:
            return []

        tags = []
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split("\x00")
            if len(parts) != 4:
                continue
            name, date_str, commit_hash, obj_type = parts
            try:
                date = datetime.fromisoformat(date_str)
            except ValueError:
                date = datetime.now(timezone.utc)
            tags.append({
                "name": name,
                "date": date.strftime("%Y-%m-%d"),
                "datetime": date,
                "commit_hash": commit_hash,
                "is_annotated": obj_type == "tag",
            })
        return tags

    def get_commit_count(self, rev: str = "HEAD") -> int:
        """Count commits reachable from a revision."""
        result = subprocess.run(
            ["git", "-C", self.path, "rev-list", "--count", rev],
            check=True, capture_output=True, text=True,
        )
        return int(result.stdout.strip())

    def get_commits_between(self, from_rev: str, to_rev: str) -> list[dict]:
        """Get commit log between two revisions.

        Returns list of {hash, date, author, message}.
        """
        fmt = "%H%00%aI%00%an%00%s"
        try:
            result = subprocess.run(
                ["git", "-C", self.path, "log", "--format=" + fmt, f"{from_rev}..{to_rev}"],
                check=True, capture_output=True, text=True,
            )
        except subprocess.CalledProcessError:
            return []

        commits = []
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split("\x00")
            if len(parts) != 4:
                continue
            commits.append({
                "hash": parts[0],
                "date": parts[1][:10],
                "author": parts[2],
                "message": parts[3],
            })
        return commits

    def get_diff(self, from_rev: str, to_rev: str) -> str:
        """Get unified diff between two revisions (filtered).

        Excludes binary files, lock files, and auto-generated files.
        """
        filters = [
            ":(exclude)*.lock",
            ":(exclude)*.sum",
            ":(exclude)package-lock.json",
            ":(exclude)yarn.lock",
            ":(exclude)pnpm-lock.yaml",
            ":(exclude)Gemfile.lock",
            ":(exclude)Cargo.lock",
            ":(exclude)poetry.lock",
            ":(exclude)*.pb.go",
            ":(exclude)*.pb.cc",
            ":(exclude)*.generated.*",
            ":(exclude)vendor/",
            ":(exclude)node_modules/",
        ]
        cmd = ["git", "-C", self.path, "diff", f"{from_rev}...{to_rev}"] + filters
        result = subprocess.run(cmd, capture_output=True, text=True)

        # If no common ancestor (first commit), try direct diff
        if not result.stdout.strip() and result.returncode == 0:
            cmd = ["git", "-C", self.path, "diff", from_rev, to_rev] + filters
            result = subprocess.run(cmd, capture_output=True, text=True)

        return result.stdout

    def get_diff_stat(self, from_rev: str, to_rev: str) -> str:
        """Get diffstat summary between two revisions."""
        try:
            result = subprocess.run(
                ["git", "-C", self.path, "diff", "--stat", f"{from_rev}...{to_rev}"],
                check=True, capture_output=True, text=True,
            )
        except subprocess.CalledProcessError:
            return ""
        return result.stdout

    def get_file_list(self, from_rev: str, to_rev: str) -> list[str]:
        """List changed files between two revisions."""
        try:
            result = subprocess.run(
                ["git", "-C", self.path, "diff", "--name-only", f"{from_rev}...{to_rev}"],
                check=True, capture_output=True, text=True,
            )
        except subprocess.CalledProcessError:
            return []
        return [f for f in result.stdout.strip().split("\n") if f]

    # ---- Iteration Extraction ----

    def extract_iterations(self) -> list[dict]:
        """Group commits into iterations using tags as boundaries.

        Each iteration spans from one tag to the next. Returns list of:
        {version, from_tag, to_tag, from_hash, to_hash, date, commit_count}.
        """
        tags = self.get_tags()
        if not tags:
            return []

        iterations = []
        for i in range(len(tags)):
            current = tags[i]
            prev = tags[i + 1] if i + 1 < len(tags) else None

            if prev:
                commit_count = self.get_commit_count(f"{prev['commit_hash']}..{current['commit_hash']}")
            else:
                commit_count = self.get_commit_count(current["commit_hash"])

            iterations.append({
                "version": current["name"],
                "date": current["date"],
                "tag_hash": current["commit_hash"],
                "prev_tag": prev["name"] if prev else None,
                "prev_hash": prev["commit_hash"] if prev else None,
                "commit_count": commit_count,
            })

        return iterations

    def _get_root_commit(self) -> str | None:
        """Get the hash of the repository's first/root commit."""
        try:
            result = subprocess.run(
                ["git", "-C", self.path, "rev-list", "--max-parents=0", "HEAD"],
                check=True, capture_output=True, text=True,
            )
            return result.stdout.strip().split("\n")[0] or None
        except subprocess.CalledProcessError:
            return None

    def get_default_branch(self) -> str:
        """Detect the default branch name."""
        try:
            result = subprocess.run(
                ["git", "-C", self.path, "symbolic-ref", "refs/remotes/origin/HEAD"],
                check=True, capture_output=True, text=True,
            )
            branch = result.stdout.strip().split("/")[-1]
            if branch:
                return branch
        except subprocess.CalledProcessError:
            pass

        try:
            result = subprocess.run(
                ["git", "-C", self.path, "branch", "-a"],
                check=True, capture_output=True, text=True,
            )
            for line in result.stdout.strip().split("\n"):
                line = line.strip().lstrip("*").strip()
                if "origin/" in line:
                    branch = line.split("origin/")[-1].strip()
                    if branch and "HEAD" not in branch:
                        return branch
        except subprocess.CalledProcessError:
            pass

        common = ["main", "master", "trunk", "develop"]
        for branch in common:
            try:
                subprocess.run(
                    ["git", "-C", self.path, "rev-parse", "--verify", f"refs/heads/{branch}"],
                    check=True, capture_output=True,
                )
                return branch
            except subprocess.CalledProcessError:
                continue

        return "main"

    def get_repo_metadata(self) -> dict:
        default_branch = self.get_default_branch()
        branch_ref = self._resolve_branch_ref(default_branch)

        first_commit = ""
        try:
            first = subprocess.run(
                ["git", "-C", self.path, "log", "--reverse", "--format=%aI", branch_ref],
                check=True, capture_output=True, text=True,
            )
            first_line = first.stdout.strip().split("\n")[0] if first.stdout.strip() else ""
            first_commit = first_line[:10]
        except subprocess.CalledProcessError:
            pass

        total_commits = self.get_commit_count(branch_ref)

        return {
            "total_commits": total_commits,
            "first_commit_date": first_commit,
            "default_branch": default_branch,
            "tag_count": len(self.get_tags()),
        }

    def _resolve_branch_ref(self, branch: str) -> str:
        """Resolve a branch name to a valid git ref for a bare repo."""
        try:
            subprocess.run(
                ["git", "-C", self.path, "rev-parse", "--verify", f"refs/heads/{branch}"],
                check=True, capture_output=True,
            )
            return f"refs/heads/{branch}"
        except subprocess.CalledProcessError:
            pass

        try:
            subprocess.run(
                ["git", "-C", self.path, "rev-parse", "--verify", f"origin/{branch}"],
                check=True, capture_output=True,
            )
            return f"origin/{branch}"
        except subprocess.CalledProcessError:
            pass

        return branch
