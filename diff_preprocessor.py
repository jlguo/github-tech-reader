"""
Diff preprocessor for LLM ingestion.

Filters noise (comments, whitespace, formatting) from raw git diffs,
extracts dependency changes, and chunks large diffs for LLM context windows.
"""

import re

# Patterns to detect dependency manifest files
DEPENDENCY_FILES = [
    r"package\.json$",
    r"requirements\.txt$",
    r"Pipfile(\.lock)?$",
    r"pyproject\.toml$",
    r"Cargo\.toml$",
    r"go\.mod$",
    r"go\.sum$",
    r"Gemfile$",
    r"pom\.xml$",
    r"build\.gradle(\.kts)?$",
    r"\.csproj$",
    r"composer\.json$",
    r"mix\.exs$",
    r"pubspec\.yaml$",
    r"CMakeLists\.txt$",
]

# Patterns for files that are purely noise
NOISE_FILE_PATTERNS = [
    r"\.lock$",
    r"\.sum$",
    r"\.pb\.(go|cc|py)$",
    r"\.generated\.",
    r"\.min\.(js|css)$",
    r"CHANGELOG\.md$",
    r"LICENSE$",
]


def is_dependency_file(filepath: str) -> bool:
    """Check if a file is a dependency manifest."""
    basename = filepath.split("/")[-1]
    return any(re.search(pat, basename) for pat in DEPENDENCY_FILES)


def is_noise_file(filepath: str) -> bool:
    """Check if a file is pure noise (auto-generated, lock files, etc.)."""
    basename = filepath.split("/")[-1]
    return any(re.search(pat, basename) for pat in NOISE_FILE_PATTERNS)


def strip_comment_lines(diff_text: str, language: str | None = None) -> str:
    """Remove lines that are pure comment changes from a diff."""
    comment_prefixes = {
        "python": r"^\s*#",
        "javascript": r"^\s*//",
        "typescript": r"^\s*//",
        "go": r"^\s*//",
        "rust": r"^\s*//",
        "java": r"^\s*//",
        "c": r"^\s*//",
        "cpp": r"^\s*//",
        "ruby": r"^\s*#",
        "shell": r"^\s*#",
        "yaml": r"^\s*#",
        "toml": r"^\s*#",
    }

    lines = diff_text.split("\n")
    result = []

    for line in lines:
        if line.startswith("+") and not line.startswith("+++"):
            stripped = line[1:].strip()
            if stripped == "":
                result.append(line)
                continue

            # Check if this is a pure comment addition
            is_comment = False
            for _, prefix in comment_prefixes.items():
                if re.match(prefix, stripped):
                    is_comment = True
                    break

            if not is_comment:
                result.append(line)
        elif line.startswith("-") and not line.startswith("---"):
            stripped = line[1:].strip()
            if stripped == "":
                result.append(line)
                continue

            is_comment = False
            for _, prefix in comment_prefixes.items():
                if re.match(prefix, stripped):
                    is_comment = True
                    break

            if not is_comment:
                result.append(line)
        else:
            result.append(line)

    return "\n".join(result)


def extract_dependency_changes(diff_text: str) -> str:
    """Extract only the dependency-related portions from a multi-file diff.

    Returns the subset of the diff that touches dependency manifest files.
    """
    sections = re.split(r"^(?=diff --git)", diff_text, flags=re.MULTILINE)
    dep_sections = []

    for section in sections:
        match = re.search(r"diff --git a/(\S+) b/(\S+)", section)
        if match:
            filepath = match.group(2)
            if is_dependency_file(filepath):
                dep_sections.append(section.strip())

    return "\n\n".join(dep_sections)


def extract_code_changes(diff_text: str) -> str:
    """Extract only code changes, excluding dependency and noise files."""
    sections = re.split(r"^(?=diff --git)", diff_text, flags=re.MULTILINE)
    code_sections = []

    for section in sections:
        match = re.search(r"diff --git a/(\S+) b/(\S+)", section)
        if match:
            filepath = match.group(2)
            if not is_dependency_file(filepath) and not is_noise_file(filepath):
                code_sections.append(section.strip())

    return "\n\n".join(code_sections)


def get_diff_summary(diff_text: str) -> dict:
    """Get a quick summary of what changed in a diff.

    Returns {files_changed, insertions, deletions, dependency_files, code_files}.
    """
    files = re.findall(r"diff --git a/(\S+) b/(\S+)", diff_text)
    insertions = len(re.findall(r"^\+(?!\+\+)", diff_text, re.MULTILINE))
    deletions = len(re.findall(r"^-(?!---)", diff_text, re.MULTILINE))
    dep_files = [f[1] for f in files if is_dependency_file(f[1])]
    code_files = [f[1] for f in files if not is_dependency_file(f[1]) and not is_noise_file(f[1])]

    return {
        "files_changed": len(files),
        "insertions": insertions,
        "deletions": deletions,
        "dependency_files": dep_files,
        "code_files": code_files,
    }


def chunk_for_llm(diff_text: str, max_chars: int = 8000) -> list[str]:
    """Split a large diff into chunks suitable for LLM context windows.

    Splits on file boundaries to keep each file's diff intact.
    """
    if len(diff_text) <= max_chars:
        return [diff_text]

    sections = re.split(r"^(?=diff --git)", diff_text, flags=re.MULTILINE)
    chunks = []
    current = ""

    for section in sections:
        section = section.strip()
        if not section:
            continue

        if len(current) + len(section) + 2 > max_chars and current:
            chunks.append(current)
            current = section
        else:
            current = current + "\n\n" + section if current else section

    if current:
        chunks.append(current)

    return chunks
