"""
Git utility module for bare repository operations.

Handles cloning, fetching, tag extraction, commit diffing, and
iteration boundary detection for GitHub repository analysis.
"""

import os
import subprocess
from datetime import UTC, datetime


class GitRepo:
    """Wrapper around local bare Git repository operations."""

    def __init__(self, repo_path: str):
        self.path = repo_path
        self._git = ["git", "-C", repo_path]

    # ---- Lifecycle ----

    @classmethod
    def clone_bare(cls, url: str, cache_dir: str, skip_fetch: bool = False) -> "GitRepo":
        name = url.rstrip("/").split("/")[-1]
        if name.endswith(".git"):
            name = name[:-4]
        owner = url.rstrip("/").split("/")[-2]
        dirname = f"{owner}_{name}.git"
        target = os.path.join(cache_dir, dirname)

        if os.path.isdir(target):
            repo = cls(target)
            if not skip_fetch:
                repo.fetch()
        else:
            os.makedirs(cache_dir, exist_ok=True)
            subprocess.run(
                ["git", "clone", "--bare", "--filter=blob:none", url, target],
                check=True, capture_output=True,
                timeout=300,
            )
            repo = cls(target)
        return repo

    def fetch(self, depth: int | None = None) -> None:
        """Update the bare repo from remote."""
        cmd = ["git", "-C", self.path, "fetch", "--tags", "--force"]
        if depth:
            cmd += ["--depth", str(depth)]
        subprocess.run(cmd, check=True, capture_output=True, timeout=300)

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
                timeout=300,
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
                date = datetime.now(UTC)
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
            timeout=300,
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
                timeout=300,
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
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        # If no common ancestor (first commit), try direct diff
        if not result.stdout.strip() and result.returncode == 0:
            cmd = ["git", "-C", self.path, "diff", from_rev, to_rev] + filters
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        return result.stdout

    def get_diff_stat(self, from_rev: str, to_rev: str) -> str:
        """Get diffstat summary between two revisions."""
        try:
            result = subprocess.run(
                ["git", "-C", self.path, "diff", "--stat", f"{from_rev}...{to_rev}"],
                check=True, capture_output=True, text=True,
                timeout=300,
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
                timeout=300,
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

    def filter_by_strategy(self, strategy: str = "full") -> list[dict]:
        """Filter iterations using a tiered strategy for large repos.

        Strategies:
          full       — All tags, merge adjacent patch versions (current behavior)
          minor-only — One iteration per X.Y.* group with cumulative diff
          major-only — One iteration per X.*.* group with cumulative diff

        For minor-only/major-only, the diff covers the ENTIRE range between
        group boundaries, so no changes are missed.
        """
        if strategy == "full":
            return self.extract_iterations()

        tags = self.get_tags()
        if not tags:
            return []

        def _group_key(version: str, level: str) -> str:
            parts = version.lstrip("v").split(".")
            if level == "major":
                return parts[0] if parts else "0"
            return ".".join(parts[:2]) if len(parts) >= 2 else parts[0]

        groups: dict[str, list[dict]] = {}
        for tag in tags:
            key = _group_key(tag["name"], strategy.split("-")[0])
            if key not in groups:
                groups[key] = []
            groups[key].append(tag)

        group_keys = sorted(groups.keys(), key=lambda k: [int(x) for x in k.replace("-", ".").split(".") if x.isdigit()] or [0])

        iterations = []
        for i, key in enumerate(group_keys):
            group_tags = groups[key]
            representative = group_tags[-1]
            prev_tag = None
            prev_hash = None
            if i > 0:
                prev_key = group_keys[i - 1]
                prev_group = groups[prev_key]
                prev_tag = prev_group[-1]["name"]
                prev_hash = prev_group[-1]["commit_hash"]

            total_commits = 0
            for tag in group_tags:
                total_commits += tag.get("_commit_count", 0) or 0

            if not total_commits:
                if prev_hash:
                    from_rev = prev_hash
                else:
                    root = self._get_root_commit()
                    from_rev = root or representative["commit_hash"]
                to_rev = representative["commit_hash"]
                total_commits = self.get_commit_count(f"{from_rev}..{to_rev}") if from_rev != to_rev else self.get_commit_count(to_rev)

            if len(group_tags) > 1:
                oldest = group_tags[-1]["name"]
                newest = group_tags[0]["name"]
                label = f"{oldest}→{newest}" if oldest != newest else newest
            else:
                label = representative["name"]

            iterations.append({
                "version": label,
                "date": representative["date"],
                "tag_hash": representative["commit_hash"],
                "prev_tag": prev_tag,
                "prev_hash": prev_hash,
                "commit_count": total_commits,
            })

        return iterations

    def _get_root_commit(self) -> str | None:
        """Get the hash of the repository's first/root commit."""
        try:
            result = subprocess.run(
                ["git", "-C", self.path, "rev-list", "--max-parents=0", "HEAD"],
                check=True, capture_output=True, text=True,
                timeout=300,
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
                timeout=300,
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
                timeout=300,
            )
            for line in result.stdout.strip().split("\n"):
                stripped = line.strip().lstrip("*").strip()
                if "origin/" in stripped:
                    branch = stripped.split("origin/")[-1].strip()
                    if branch and "HEAD" not in branch:
                        return branch
                elif stripped and "HEAD" not in stripped and "/" not in stripped:
                    return stripped
        except subprocess.CalledProcessError:
            pass

        for branch in ("main", "master", "trunk", "develop"):
            try:
                subprocess.run(
                    ["git", "-C", self.path, "rev-parse", "--verify",
                     f"refs/heads/{branch}"],
                    check=True, capture_output=True,
                    timeout=300,
                )
                return branch
            except subprocess.CalledProcessError:
                continue

        return "main"

    # ---- Structural Analysis (0-1 commit repos) ----

    def list_tree(self, ref: str = "HEAD") -> list[str]:
        try:
            result = subprocess.run(
                ["git", "-C", self.path, "ls-tree", "-r", "--name-only", ref],
                check=True, capture_output=True, text=True,
                timeout=300,
            )
        except subprocess.CalledProcessError:
            return []
        return [f for f in result.stdout.strip().split("\n") if f]

    def get_file_content(self, filepath: str, ref: str = "HEAD",
                         max_lines: int = 200) -> str | None:
        try:
            result = subprocess.run(
                ["git", "-C", self.path, "show", f"{ref}:{filepath}"],
                check=True, capture_output=True, text=True,
                timeout=300,
            )
        except subprocess.CalledProcessError:
            return None
        lines = result.stdout.split("\n")
        if len(lines) > max_lines:
            head = "\n".join(lines[:max_lines // 2])
            tail = "\n".join(lines[-(max_lines // 2):])
            return head + f"\n... [{len(lines) - max_lines} lines truncated] ...\n" + tail
        return result.stdout

    def get_file_imports(self, filepath: str, ref: str = "HEAD") -> str:
        raw = self.get_file_content(filepath, ref, max_lines=60)
        if not raw:
            return ""
        lines = raw.split("\n")
        imports = []
        for line in lines:
            s = line.strip()
            if s.startswith(("import ", "from ", "require(", "/// <reference",
                             "use ", "mod ", "extern crate", "#include", "#import",
                             "@import", "package ")):
                imports.append(line)
        return "\n".join(imports[:30])

    def discover_modules(self) -> list[dict]:
        files = self.list_tree()
        if not files:
            return []

        from collections import defaultdict
        groups: dict[str, list[tuple[str, str]]] = defaultdict(list)
        for f in files:
            parts = f.split("/", 1)
            if len(parts) == 1:
                groups["(root)"].append((f, f))
            else:
                groups[parts[0]].append((parts[1], f))

        while groups:
            total = sum(len(v) for v in groups.values())
            largest_name = max(groups, key=lambda k: len(groups[k]))
            largest_count = len(groups[largest_name])
            if total == 0 or largest_count < total * 0.9:
                break
            if largest_name == "(root)":
                break
            entries = groups.pop(largest_name)
            next_groups: dict[str, list[tuple[str, str]]] = defaultdict(list)
            for display, git_path in entries:
                parts = display.split("/", 1)
                if len(parts) == 1:
                    next_groups["(root)"].append((display, git_path))
                else:
                    next_groups[parts[0]].append((parts[1], git_path))
            old_root = groups.pop("(root)", [])
            next_groups["(root)"].extend(old_root)
            for k, v in groups.items():
                next_groups[k] = v
            groups = next_groups

        modules = []
        for name, entries in sorted(groups.items()):
            source_entries = [(d, g) for d, g in entries
                              if not d.startswith(".") and not any(
                                  d.endswith(ext) for ext in
                                  (".lock", ".sum", ".min.js", ".min.css",
                                   ".pb.go", ".pb.cc", ".pb.py", ".generated."))]

            total_lines = 0
            key_files = []
            for display, git_path in sorted(source_entries)[:8]:
                try:
                    result = subprocess.run(
                        ["git", "-C", self.path, "show", f"HEAD:{git_path}"],
                        check=True, capture_output=True, text=True,
                        timeout=300,
                    )
                    line_count = len(result.stdout.split("\n"))
                    total_lines += line_count
                    content = "\n".join(result.stdout.split("\n")[:300])
                    lines = result.stdout.split("\n")[:60]
                    import_lines = []
                    for line in lines:
                        s = line.strip()
                        if s.startswith(("import ", "from ", "require(", "/// <reference",
                                         "use ", "mod ", "extern crate", "#include",
                                         "#import", "@import", "package ")):
                            import_lines.append(line)
                    imports = "\n".join(import_lines[:30])
                    key_files.append({"path": display, "lines": line_count,
                                      "imports": imports, "content": content})
                except subprocess.CalledProcessError:
                    key_files.append({"path": display, "lines": 0,
                                      "imports": "", "content": ""})

            modules.append({
                "name": name,
                "file_count": len(source_entries),
                "total_lines": total_lines,
                "key_files": key_files,
            })

        return modules

    # ---- Tagless / Commit Chunking ----

    def _get_all_commit_hashes(self) -> list[str]:
        """Return all commit hashes on default branch in chronological order."""
        try:
            result = subprocess.run(
                ["git", "-C", self.path, "log", "--reverse", "--format=%H",
                 self._resolve_branch_ref(self.get_default_branch())],
                check=True, capture_output=True, text=True,
                timeout=300,
            )
        except subprocess.CalledProcessError:
            return []
        return [h for h in result.stdout.strip().split("\n") if h]

    def _get_commit_date(self, commit_hash: str) -> str | None:
        """Get date string (YYYY-MM-DD) for a commit."""
        try:
            result = subprocess.run(
                ["git", "-C", self.path, "log", "-1", "--format=%aI", commit_hash],
                check=True, capture_output=True, text=True,
                timeout=300,
            )
            return result.stdout.strip()[:10] or None
        except subprocess.CalledProcessError:
            return None

    def extract_commit_chunks(self, target_chunks: int = 30) -> list[dict]:
        """Group commits into chronological chunks for tagless repos.

        Each chunk spans a range of commits. The diff between consecutive
        chunk boundaries becomes an iteration — reusing the same pipeline
        as tag-based analysis.

        Returns list of iteration-compatible dicts:
        {version, date, tag_hash, prev_hash, prev_tag, commit_count}
        """
        hashes = self._get_all_commit_hashes()
        if not hashes:
            return []

        total = len(hashes)
        if total <= 5:
            # Few commits: one chunk per commit
            chunk_size = 1
        else:
            chunk_size = max(5, total // target_chunks)

        # Group into chunks
        chunks: list[dict] = []
        for i in range(0, total, chunk_size):
            chunk_hashes = hashes[i:i + chunk_size]
            chunks.append({
                "first": chunk_hashes[0],
                "last": chunk_hashes[-1],
                "count": len(chunk_hashes),
            })

        # Build iteration dicts
        iterations: list[dict] = []
        root_hash = self._get_root_commit()

        for idx, chunk in enumerate(chunks):
            date = self._get_commit_date(chunk["last"])
            if not date:
                date = datetime.now(UTC).strftime("%Y-%m-%d")

            if idx == 0:
                prev_hash = root_hash
                prev_tag = None
            else:
                prev_hash = chunks[idx - 1]["last"]
                prev_tag = f"chunk-{idx}"

            label = f"Chunk {idx + 1}" if idx > 0 else f"Initial (1–{chunk['count']} commits)"
            if date:
                label += f" — {date}"

            iterations.append({
                "version": label,
                "date": date,
                "tag_hash": chunk["last"],
                "prev_hash": prev_hash,
                "prev_tag": prev_tag,
                "commit_count": chunk["count"],
            })

        return iterations

    def get_name_status(self, from_rev: str, to_rev: str) -> list[dict]:
        """Get file status list between two revisions.

        Returns list of {status, path, (old_path)}. Renamed/copied files include old_path.
        Status codes: A=added, D=deleted, M=modified, R=renamed, C=copied, T=type-changed.
        """
        try:
            result = subprocess.run(
                ["git", "-C", self.path, "diff", "--name-status", "-z",
                 f"{from_rev}...{to_rev}"],
                check=True, capture_output=True, text=True,
                timeout=300,
            )
        except subprocess.CalledProcessError:
            return []

        files = []
        tokens = [token for token in result.stdout.split("\x00") if token]
        index = 0
        while index < len(tokens):
            raw_status = tokens[index]
            status = raw_status[0]
            index += 1
            if status in ("R", "C") and index + 1 < len(tokens):
                old_path = tokens[index]
                new_path = tokens[index + 1]
                files.append({"status": status, "old_path": old_path, "path": new_path})
                index += 2
            elif index < len(tokens):
                files.append({"status": status, "path": tokens[index]})
                index += 1
        return files

    def get_numstat(self, from_rev: str, to_rev: str) -> list[dict]:
        """Get numstat lines between two revisions.

        Returns list of {path, insertions, deletions}. Binary files show '-' as 0s.
        """
        try:
            result = subprocess.run(
                ["git", "-C", self.path, "diff", "--numstat",
                 f"{from_rev}...{to_rev}"],
                check=True, capture_output=True, text=True,
                timeout=300,
            )
        except subprocess.CalledProcessError:
            return []

        rows = []
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) < 3:
                continue
            ins = 0 if parts[0] == "-" else int(parts[0])
            dels = 0 if parts[1] == "-" else int(parts[1])
            rows.append({"path": parts[2], "insertions": ins, "deletions": dels})
        return rows

    def get_shortstat(self, from_rev: str, to_rev: str) -> str:
        """Get shortstat summary line between two revisions.

        Returns a string like " 5 files changed, 42 insertions(+), 7 deletions(-)".
        """
        try:
            result = subprocess.run(
                ["git", "-C", self.path, "diff", "--shortstat",
                 f"{from_rev}...{to_rev}"],
                check=True, capture_output=True, text=True,
                timeout=300,
            )
        except subprocess.CalledProcessError:
            return ""
        return result.stdout.strip()

    def get_commit_messages(self, from_rev: str, to_rev: str,
                            limit: int = 200) -> list[str]:
        """Get commit messages (subject lines) between two revisions.

        Returns a list of message strings, newest first, capped at limit.
        """
        try:
            result = subprocess.run(
                ["git", "-C", self.path, "log", "--format=%s",
                 "-n", str(limit), f"{from_rev}..{to_rev}"],
                check=True, capture_output=True, text=True,
                timeout=300,
            )
        except subprocess.CalledProcessError:
            return []
        return [m for m in result.stdout.strip().split("\n") if m]

    def get_diff_for_files(self, from_rev: str, to_rev: str,
                           paths: list[str]) -> str:
        """Get unified diff for a specific set of files between two revisions.

        Returns empty string when paths is empty. Uses -- as path separator
        for safety against revision-like path names.
        """
        if not paths:
            return ""
        try:
            result = subprocess.run(
                ["git", "-C", self.path, "diff",
                 f"{from_rev}...{to_rev}", "--"] + paths,
                capture_output=True, text=True,
                timeout=300,
            )
        except subprocess.CalledProcessError:
            return ""
        return result.stdout

    def get_repo_metadata(self) -> dict:
        default_branch = self.get_default_branch()
        branch_ref = self._resolve_branch_ref(default_branch)

        first_commit = ""
        try:
            first = subprocess.run(
                ["git", "-C", self.path, "log", "--reverse", "--format=%aI", branch_ref],
                check=True, capture_output=True, text=True,
                timeout=300,
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
                timeout=300,
            )
            return f"refs/heads/{branch}"
        except subprocess.CalledProcessError:
            pass

        try:
            subprocess.run(
                ["git", "-C", self.path, "rev-parse", "--verify", f"origin/{branch}"],
                check=True, capture_output=True,
                timeout=300,
            )
            return f"origin/{branch}"
        except subprocess.CalledProcessError:
            pass

        return branch
