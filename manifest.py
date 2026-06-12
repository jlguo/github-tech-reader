"""
Change manifest schema, file classification, scoring, and extraction planning.

Provides pre-diff intelligence for the Git analyzer pipeline:
  - classify_file()   – file-type categorization (12+ categories)
  - score_file_change() – deterministic 0..1 relevance scoring with explanations
  - build_manifest()  – full per-interval manifest from git --stat + commit data
  - plan_patch_extraction() – select top-N files for LLM ingestion
  - manifest_cache_key()   – deterministic cache fingerprint

No external dependencies. No vector DB / embeddings. Pure stdlib.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any

# ============================================================
# Classification helpers
# ============================================================

MANIFEST_SCORER_VERSION = "manifest-scorer-v2"

# File-type tag constants (used as values in FileChange.classification)
CLASS_SOURCE = "source"
CLASS_TEST = "test"
CLASS_DOCS = "docs"
CLASS_DEPENDENCY_MANIFEST = "dependency_manifest"
CLASS_LOCKFILE = "lockfile"
CLASS_CONFIG = "config"
CLASS_CI = "ci"
CLASS_MIGRATION = "migration"
CLASS_GENERATED = "generated"
CLASS_VENDOR = "vendor"
CLASS_ASSET = "asset"
CLASS_BUILD = "build"
CLASS_UNKNOWN = "unknown"

# ------------------------------------------------------------------
# Priority-ordered classification rules: first match wins.
# Each rule is (regex, category). Evaluated top-to-bottom.
# ------------------------------------------------------------------
_CLASSIFICATION_RULES: list[tuple[re.Pattern, str]] = [
    # ---- explicit ignores / vendor ----
    (re.compile(r"(^|/)vendor/", re.I), CLASS_VENDOR),
    (re.compile(r"(^|/)node_modules/", re.I), CLASS_VENDOR),
    (re.compile(r"(^|/)third_party/", re.I), CLASS_VENDOR),
    (re.compile(r"(^|/)\.?dist/", re.I), CLASS_VENDOR),
    (re.compile(r"(^|/)bower_components/", re.I), CLASS_VENDOR),

    # ---- generated / auto-generated ----
    (re.compile(r"\.generated\.", re.I), CLASS_GENERATED),
    (re.compile(r"\.pb\.(go|cc|py|java|rb|cs|php|swift)$", re.I), CLASS_GENERATED),
    (re.compile(r"\.pb\.[a-z]+$", re.I), CLASS_GENERATED),
    (re.compile(r"_pb2\.py$", re.I), CLASS_GENERATED),
    (re.compile(r"\.g\.(go|rs)$", re.I), CLASS_GENERATED),
    (re.compile(r"(^|/)gen/", re.I), CLASS_GENERATED),
    (re.compile(r"(^|/)autogen/", re.I), CLASS_GENERATED),
    (re.compile(r"\.gen\.(go|ts|tsx|js|py)$", re.I), CLASS_GENERATED),

    # ---- lockfiles ----
    (re.compile(r"\.lock$", re.I), CLASS_LOCKFILE),
    (re.compile(r"\.sum$", re.I), CLASS_LOCKFILE),
    (re.compile(r"^package-lock\.json$", re.I), CLASS_LOCKFILE),
    (re.compile(r"^yarn\.lock$", re.I), CLASS_LOCKFILE),
    (re.compile(r"^pnpm-lock\.yaml$", re.I), CLASS_LOCKFILE),
    (re.compile(r"^shrinkwrap\.yaml$", re.I), CLASS_LOCKFILE),

    # ---- test files ----
    (re.compile(r"(^|/)(tests?|__tests__|spec|__specs__|testing)/", re.I), CLASS_TEST),
    (re.compile(r"[._-](test|spec|_test|_spec)\.\w+$", re.I), CLASS_TEST),
    (re.compile(r"^test[_-]", re.I), CLASS_TEST),
    (re.compile(r"(^|/)conftest\.py$", re.I), CLASS_TEST),
    (re.compile(r"(^|/)mocks?/", re.I), CLASS_TEST),
    (re.compile(r"(^|/)__mocks__/", re.I), CLASS_TEST),

    # ---- docs ----
    (re.compile(r"\.(md|rst|markdown)$", re.I), CLASS_DOCS),
    (re.compile(r"(^|/)(docs?|documentation|wiki|man|help)/", re.I), CLASS_DOCS),
    (re.compile(r"^(README|CHANGELOG|CONTRIBUTING|CODE_OF_CONDUCT|AUTHORS)($|\.)", re.I), CLASS_DOCS),

    # ---- CI / workflows ----
    (re.compile(r"(^|/)\.github/workflows/", re.I), CLASS_CI),
    (re.compile(r"(^|/)\.gitlab-ci\.ya?ml$", re.I), CLASS_CI),
    (re.compile(r"(^|/)Jenkinsfile", re.I), CLASS_CI),
    (re.compile(r"(^|/)\.circleci/", re.I), CLASS_CI),
    (re.compile(r"(^|/)\.travis\.ya?ml$", re.I), CLASS_CI),
    (re.compile(r"(^|/)azure-pipelines\.ya?ml$", re.I), CLASS_CI),
    (re.compile(r"(^|/)\.drone\.ya?ml$", re.I), CLASS_CI),
    (re.compile(r"(^|/)Dockerfile", re.I), CLASS_CI),
    (re.compile(r"(^|/)docker-compose", re.I), CLASS_CI),
    (re.compile(r"(^|/)\.dockerignore$", re.I), CLASS_CI),

    # ---- migration files ----
    (re.compile(r"(^|/)migrations?/", re.I), CLASS_MIGRATION),
    (re.compile(r"(^|/)alembic/", re.I), CLASS_MIGRATION),
    (re.compile(r"(^|/)flyway/", re.I), CLASS_MIGRATION),
    (re.compile(r"(^|/)db/migrate/", re.I), CLASS_MIGRATION),
    (re.compile(r"(^|/)prisma/migrations/", re.I), CLASS_MIGRATION),
    (re.compile(r"\d{6,}.*\.(sql|py|rb|ts|js)$", re.I), CLASS_MIGRATION),

    # ---- assets / binary / images ----
    (re.compile(r"\.(png|jpe?g|gif|svg|ico|woff2?|ttf|eot|otf|mp[34]|wav|ogg|webm|avi|mov|pdf)$", re.I), CLASS_ASSET),
    (re.compile(r"(^|/)(assets?|images?|fonts?|media|static|public)/", re.I), CLASS_ASSET),
    (re.compile(r"\.(zip|tar|gz|bz2|xz|7z|rar)$", re.I), CLASS_ASSET),

    # ---- dependency manifests ----
    (re.compile(r"(^|/)requirements.*\.(txt|in)$", re.I), CLASS_DEPENDENCY_MANIFEST),
    (re.compile(r"(^|/)Pipfile(\.lock)?$", re.I), CLASS_DEPENDENCY_MANIFEST),
    (re.compile(r"(^|/)pyproject\.toml$", re.I), CLASS_DEPENDENCY_MANIFEST),
    (re.compile(r"(^|/)setup\.(py|cfg)$", re.I), CLASS_DEPENDENCY_MANIFEST),
    (re.compile(r"(^|/)package\.json$", re.I), CLASS_DEPENDENCY_MANIFEST),
    (re.compile(r"^Cargo\.toml$", re.I), CLASS_DEPENDENCY_MANIFEST),
    (re.compile(r"^go\.mod$", re.I), CLASS_DEPENDENCY_MANIFEST),
    (re.compile(r"(^|/)Gemfile$", re.I), CLASS_DEPENDENCY_MANIFEST),
    (re.compile(r"^pom\.xml$", re.I), CLASS_DEPENDENCY_MANIFEST),
    (re.compile(r"^build\.gradle(\.kts)?$", re.I), CLASS_DEPENDENCY_MANIFEST),
    (re.compile(r"\.csproj$", re.I), CLASS_DEPENDENCY_MANIFEST),
    (re.compile(r"^composer\.json$", re.I), CLASS_DEPENDENCY_MANIFEST),
    (re.compile(r"^mix\.exs$", re.I), CLASS_DEPENDENCY_MANIFEST),
    (re.compile(r"^pubspec\.yaml$", re.I), CLASS_DEPENDENCY_MANIFEST),

    # ---- config ----
    (re.compile(r"\.(ya?ml|yaml)\.?(example|template|sample)$", re.I), CLASS_CONFIG),
    (re.compile(r"(^|/)\.env(\..+)?$", re.I), CLASS_CONFIG),
    (re.compile(r"\.ini$", re.I), CLASS_CONFIG),
    (re.compile(r"\.cfg$", re.I), CLASS_CONFIG),
    (re.compile(r"\.conf$", re.I), CLASS_CONFIG),
    (re.compile(r"\.toml$", re.I), CLASS_CONFIG),
    (re.compile(r"(^|/)config(s)?/", re.I), CLASS_CONFIG),
    (re.compile(r"^(tsconfig|jsconfig)\.json$", re.I), CLASS_CONFIG),
    (re.compile(r"^(\.eslintrc|\.prettierrc|\.babelrc|\.stylelintrc)", re.I), CLASS_CONFIG),
    (re.compile(r"^(\.editorconfig|\.gitattributes|\.gitmodules)$", re.I), CLASS_CONFIG),
    (re.compile(r"^\.gitignore$", re.I), CLASS_CONFIG),  # CI/Dockerfile already caught above

    # ---- build ----
    (re.compile(r"(^|/)Makefile$", re.I), CLASS_BUILD),
    (re.compile(r"^CMakeLists\.txt$", re.I), CLASS_BUILD),
    (re.compile(r"\.cmake$", re.I), CLASS_BUILD),
    (re.compile(r"\.mk$", re.I), CLASS_BUILD),
    (re.compile(r"(^|/)(build|cmake|bazel|buck)/", re.I), CLASS_BUILD),
    (re.compile(r"^(BUILD|WORKSPACE)(\.bazel)?$", re.I), CLASS_BUILD),
    (re.compile(r"^(Makefile\.|Rakefile|Gruntfile|gulpfile)"), CLASS_BUILD),
    (re.compile(r"(^|/)(\.)?cmake/", re.I), CLASS_BUILD),

    # ---- source-code extensions (broad catch-all) ----
    (re.compile(r"\.(py|pyx|pxd|pyi)$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(js|jsx|mjs|cjs)$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(ts|tsx|mts|cts)$", re.I), CLASS_SOURCE),
    (re.compile(r"\.go$", re.I), CLASS_SOURCE),
    (re.compile(r"\.rs$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(java|kt|kts|scala|groovy)$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(c|cc|cpp|cxx|h|hpp|hxx)$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(rb|rake|gemspec)$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(swift|m|mm)$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(php|phtml|phps)$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(cs|fs|fsx|vb)$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(lua|t|pl|pm|r|R|jl|ex|exs|erl|hrl|clj|cljs|cljc|edn)$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(dart|nim|zig|odin|cr)$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(svelte|vue|astro|solid|riot)$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(sql|psql|plsql)$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(graphql|gql)$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(proto|thrift|avsc)$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(sh|bash|zsh|fish|ps1|psm1)$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(html?|htm|css|scss|sass|less|styl)$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(json)(?!\.(example|template|sample))$", re.I), CLASS_SOURCE),
    (re.compile(r"\.xml$", re.I), CLASS_SOURCE),
    (re.compile(r"\.(patch|diff)$", re.I), CLASS_SOURCE),
]


def _classify_file_category(path: str) -> str:
    """Classify a file path into one of the stable internal categories."""
    if not path:
        return CLASS_UNKNOWN

    basename = path.split("/")[-1] if "/" in path else path

    for pattern, category in _CLASSIFICATION_RULES:
        if pattern.search(basename) or pattern.search(path):
            return category

    return CLASS_UNKNOWN


def _public_category(category: str) -> str:
    """Map internal categories to compact public labels used by tests/CLI output."""
    if category == CLASS_DEPENDENCY_MANIFEST:
        return "dependency"
    if category == CLASS_LOCKFILE:
        return "lock"
    return category


def classify_file(path: str) -> dict[str, Any]:
    """Return public classification details for a file path.

    The manifest internals use stable CLASS_* constants, while this public helper
    returns a JSON-friendly record with a compact category label, normalized score,
    and topic tags for callers/tests.
    """
    internal_category = _classify_file_category(path)
    file_change = FileChange(
        path=path,
        classification=internal_category,
        is_source=(internal_category == CLASS_SOURCE),
        is_test=(internal_category == CLASS_TEST),
        is_docs=(internal_category == CLASS_DOCS),
        is_dependency=(internal_category == CLASS_DEPENDENCY_MANIFEST),
        is_generated=(internal_category == CLASS_GENERATED),
        lines_changed=50,
    )
    scored = score_file_change(file_change)
    tags: list[str] = []
    if scored.scores.security_relevance >= 0.5:
        tags.append("security")
    if scored.scores.dependency_relevance >= 0.5:
        tags.append("dependency")
    if scored.scores.architecture_relevance >= 0.5:
        tags.append("architecture")
    if scored.scores.performance_relevance >= 0.5:
        tags.append("performance")
    if scored.scores.breaking_change_relevance >= 0.5 or internal_category == CLASS_MIGRATION:
        tags.append("breaking")
    if internal_category == CLASS_TEST:
        tags.append("test")

    return {
        "path": path,
        "category": _public_category(internal_category),
        "classification": internal_category,
        "score": scored.scores.general_importance,
        "tags": tags,
        "scores": scored.scores.to_dict(),
        "score_reasons": scored.score_reasons,
    }


def _file_has_extension(path: str, extensions: frozenset[str]) -> bool:
    """Check whether *path* ends with one of the given extensions (case-insensitive)."""
    lower = path.lower()
    return any(lower.endswith(ext) for ext in extensions)


_SOURCE_EXTS = frozenset({
    ".py", ".pyx", ".pxd", ".pyi", ".js", ".jsx", ".mjs", ".cjs",
    ".ts", ".tsx", ".mts", ".cts", ".go", ".rs", ".java", ".kt",
    ".kts", ".scala", ".groovy", ".c", ".cc", ".cpp", ".cxx", ".h",
    ".hpp", ".hxx", ".rb", ".rake", ".gemspec", ".swift", ".m", ".mm",
    ".php", ".phtml", ".phps", ".cs", ".fs", ".fsx", ".vb", ".lua",
    ".t", ".pl", ".pm", ".r", ".R", ".jl", ".ex", ".exs", ".erl",
    ".hrl", ".clj", ".cljs", ".cljc", ".edn", ".dart", ".nim", ".zig",
    ".odin", ".cr", ".svelte", ".vue", ".astro", ".solid", ".riot",
    ".sql", ".psql", ".plsql", ".graphql", ".gql", ".proto", ".thrift",
    ".avsc", ".sh", ".bash", ".zsh", ".fish", ".ps1", ".psm1",
    ".html", ".htm", ".css", ".scss", ".sass", ".less", ".styl",
})


# ============================================================
# Keyword sets for scoring heuristics
# ============================================================

_ARCHITECTURE_KEYWORDS = frozenset({
    "architect", "abstract", "interface", "trait", "protocol",
    "middleware", "plugin", "extension", "adapter", "facade", "proxy",
    "decorator", "factory", "builder", "strategy", "observer",
    "pipeline", "dispatcher", "resolver", "registry",
    "core", "kernel", "engine", "runtime",
    "schema", "model", "entity", "domain", "aggregate",
    "module", "component", "service", "repository",
})

_PERFORMANCE_KEYWORDS = frozenset({
    "perf", "performance", "benchmark", "bench", "optimize",
    "optim", "cache", "caching", "memoize", "lazy",
    "fast", "slow", "latency", "throughput", "bottleneck",
    "profile", "profiling", "hotpath", "hot_path",
    "pool", "buffer", "reuse", "batch", "stream",
})

_SECURITY_KEYWORDS = frozenset({
    "auth", "authenticate", "authentication", "authorize", "authorization",
    "login", "logout", "session", "token", "jwt", "oauth", "saml",
    "rbac", "acl", "permission", "role", "policy",
    "crypto", "encrypt", "decrypt", "hash", "bcrypt", "scrypt",
    "sanitize", "sanitizer", "escape", "validate", "validation",
    "csrf", "xss", "sqli", "injection", "cors",
    "audit", "auditing", "compliance", "pii",
})

_DEPENDENCY_KEYWORDS = frozenset({
    "dep", "deps", "dependency", "dependencies",
    "upgrade", "bump", "update", "version",
    "import", "require", "include", "module", "package",
})

_BREAKING_KEYWORDS = frozenset({
    "breaking", "break", "broken", "deprecat",
    "remove", "delete", "rename", "migrate",
    "api", "public", "export", "interface",
    "signature", "contract", "compat",
})

# ------------------------------------------------------------------
# Intent classification from commit messages
# ------------------------------------------------------------------
_INTENT_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bfix\b([:\(]|ed)?", re.I), "fix"),
    (re.compile(r"\bfeat\b([:\(]|ure)?", re.I), "feat"),
    (re.compile(r"\brefactor\b", re.I), "refactor"),
    (re.compile(r"\bperf\b", re.I), "perf"),
    (re.compile(r"\b(doc|docu|document|readme|changelog)\b", re.I), "docs"),
    (re.compile(r"\btest\b", re.I), "test"),
    (re.compile(r"\b(style|format|lint)\b", re.I), "style"),
    (re.compile(r"\b(build|ci|cd|deploy|release)\b", re.I), "build"),
    (re.compile(r"\b(chore|cleanup|housekeep|tidy)\b", re.I), "chore"),
    (re.compile(r"\b(revert|rollback)\b", re.I), "revert"),
    (re.compile(r"\b(security|secure|cve|vuln)\b", re.I), "security"),
    (re.compile(r"\b(breaking|break)\b", re.I), "breaking"),
    (re.compile(r"\b(dep|deps|bump|upgrade|update)\b", re.I), "deps"),
]


def _classify_commit_intent(message: str) -> str:
    """Classify the primary intent of a commit message.

    Returns the intent label string (e.g. 'fix', 'feat', 'refactor', etc.).
    """
    if not message:
        return "unknown"
    for pattern, intent in _INTENT_PATTERNS:
        if pattern.search(message):
            return intent
    return "unknown"


# ============================================================
# Data-classes (top → bottom)
# ============================================================


@dataclass
class ScoreBreakdown:
    """Per-file relevance scores, all clamped to [0.0, 1.0]."""

    general_importance: float = 0.0
    architecture_relevance: float = 0.0
    performance_relevance: float = 0.0
    security_relevance: float = 0.0
    dependency_relevance: float = 0.0
    breaking_change_relevance: float = 0.0
    llm_patch_priority: float = 0.0

    def to_dict(self) -> dict[str, float]:
        return {
            "general_importance": self.general_importance,
            "architecture_relevance": self.architecture_relevance,
            "performance_relevance": self.performance_relevance,
            "security_relevance": self.security_relevance,
            "dependency_relevance": self.dependency_relevance,
            "breaking_change_relevance": self.breaking_change_relevance,
            "llm_patch_priority": self.llm_patch_priority,
        }


@dataclass
class FileChange:
    """Single changed-file record with classification, booleans, scores, reasons."""

    path: str
    classification: str = CLASS_UNKNOWN
    is_source: bool = False
    is_test: bool = False
    is_docs: bool = False
    is_dependency: bool = False
    is_generated: bool = False
    is_deleted: bool = False
    is_new: bool = False
    is_binary: bool = False
    insertions: int = 0
    deletions: int = 0
    lines_changed: int = 0
    scores: ScoreBreakdown = field(default_factory=ScoreBreakdown)
    score_reasons: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "classification": self.classification,
            "is_source": self.is_source,
            "is_test": self.is_test,
            "is_docs": self.is_docs,
            "is_dependency": self.is_dependency,
            "is_generated": self.is_generated,
            "is_deleted": self.is_deleted,
            "is_new": self.is_new,
            "is_binary": self.is_binary,
            "insertions": self.insertions,
            "deletions": self.deletions,
            "lines_changed": self.lines_changed,
            "scores": self.scores.to_dict(),
            "score_reasons": self.score_reasons,
        }


@dataclass
class DirectoryRollup:
    """Aggregated stats for a single directory."""

    file_count: int = 0
    insertions: int = 0
    deletions: int = 0
    categories: dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "file_count": self.file_count,
            "insertions": self.insertions,
            "deletions": self.deletions,
            "categories": dict(self.categories),
        }


@dataclass
class IntervalContext:
    """Aggregate interval-level metrics."""

    interval_commits: int = 0
    interval_date_start: str = ""
    interval_date_end: str = ""
    commit_intent_counts: dict[str, int] = field(default_factory=dict)
    directory_rollups: dict[str, DirectoryRollup] = field(default_factory=dict)
    unique_authors: int = 0
    total_files: int = 0
    total_insertions: int = 0
    total_deletions: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "interval_commits": self.interval_commits,
            "interval_date_start": self.interval_date_start,
            "interval_date_end": self.interval_date_end,
                        "commit_intent_counts": dict(self.commit_intent_counts),
            "unique_authors": self.unique_authors,
            "directory_rollups": {
k: v.to_dict() for k, v in self.directory_rollups.items()},
            "total_files": self.total_files,
            "total_insertions": self.total_insertions,
            "total_deletions": self.total_deletions,
        }


@dataclass
class RiskMetrics:
    """Aggregate risk signals."""

    large_deletions_count: int = 0
    config_changes_count: int = 0
    migration_files_count: int = 0
    breaking_keywords_hits: int = 0
    api_surface_changes: int = 0
    dependency_manifest_changes: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "large_deletions_count": self.large_deletions_count,
            "config_changes_count": self.config_changes_count,
            "migration_files_count": self.migration_files_count,
            "breaking_keywords_hits": self.breaking_keywords_hits,
            "api_surface_changes": self.api_surface_changes,
            "dependency_manifest_changes": self.dependency_manifest_changes,
        }


@dataclass
class TopicSignals:
    """High-level topic signal strengths, each 0..1."""

    architecture: float = 0.0
    performance: float = 0.0
    security: float = 0.0
    dependency: float = 0.0
    breaking: float = 0.0
    feature: float = 0.0
    refactor: float = 0.0
    bugfix: float = 0.0

    def to_dict(self) -> dict[str, float]:
        return {
            "architecture": self.architecture,
            "performance": self.performance,
            "security": self.security,
            "dependency": self.dependency,
            "breaking": self.breaking,
            "feature": self.feature,
            "refactor": self.refactor,
            "bugfix": self.bugfix,
        }


@dataclass
class ExtractionPlan:
    """Which files to extract for LLM analysis."""

    files: list[str] = field(default_factory=list)
    total_files: int = 0
    categories: dict[str, int] = field(default_factory=dict)
    coverage: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "files": list(self.files),
            "total_files": self.total_files,
            "categories": dict(self.categories),
            "coverage": self.coverage,
        }


@dataclass
class Manifest:
    """Full change manifest for one iteration interval."""

    repo_url: str = ""
    from_ref: str = ""
    to_ref: str = ""
    from_commit: str = ""
    to_commit: str = ""
    version: str = ""
    date: str = ""
    commit_count: int = 0
    interval: IntervalContext = field(default_factory=IntervalContext)
    commits: list[dict[str, str]] = field(default_factory=list)
    file_changes: list[FileChange] = field(default_factory=list)
    risk_metrics: RiskMetrics = field(default_factory=RiskMetrics)
    topic_signals: TopicSignals = field(default_factory=TopicSignals)
    extraction_plan: ExtractionPlan = field(default_factory=ExtractionPlan)
    cache_metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "repo_url": self.repo_url,
            "from_ref": self.from_ref,
            "to_ref": self.to_ref,
            "from_commit": self.from_commit,
            "to_commit": self.to_commit,
            "version": self.version,
            "date": self.date,
            "commit_count": self.commit_count,
            "interval": self.interval.to_dict(),
            "commits": [dict(c) for c in self.commits],
            "file_changes": [fc.to_dict() for fc in self.file_changes],
            "risk_metrics": self.risk_metrics.to_dict(),
            "topic_signals": self.topic_signals.to_dict(),
            "extraction_plan": self.extraction_plan.to_dict(),
            "cache_metadata": self.cache_metadata,
        }


# ============================================================
# Scoring
# ============================================================


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def _path_keyword_score(path: str, keywords: frozenset[str]) -> float:
    """Score a path against a keyword set. 0..1 based on match density."""
    lower = path.lower()
    segments = lower.replace("/", " ").replace("_", " ").replace("-", " ").replace(".", " ").split()
    hits = sum(1 for kw in keywords for seg in segments if kw in seg)
    density = hits / max(len(segments), 1)
    return _clamp(density * 3.0)  # scale up but cap at 1.0


def score_file_change(file_change: FileChange, interval_context: IntervalContext | None = None) -> FileChange:
    """Score a single `FileChange` with deterministic 0..1 relevance values.

    Mutates and returns the same `FileChange` with `.scores` and `.score_reasons` populated.
    The scoring uses only the file's own properties + optional interval-level context
    (for magnitude normalization). No randomness, no IO.
    """
    fc = file_change
    reasons: dict[str, str] = {}

    # ---- normalised change magnitude (0..1) ----
    total_lines = max(fc.lines_changed, 0)
    if interval_context and interval_context.total_files > 0:
        avg_lines = max(interval_context.total_insertions + interval_context.total_deletions, 1) / interval_context.total_files
    else:
        avg_lines = 50.0  # sensible default

    norm_magnitude = _clamp(total_lines / max(avg_lines * 5, 1))

    # ---- general importance (combination of classification + magnitude) ----
    class_weights = {
        CLASS_SOURCE: 0.8,
        CLASS_CONFIG: 0.7,
        CLASS_DEPENDENCY_MANIFEST: 0.7,
        CLASS_MIGRATION: 0.6,
        CLASS_CI: 0.5,
        CLASS_BUILD: 0.5,
        CLASS_TEST: 0.4,
        CLASS_DOCS: 0.3,
        CLASS_ASSET: 0.1,
        CLASS_GENERATED: 0.05,
        CLASS_VENDOR: 0.0,
        CLASS_LOCKFILE: 0.0,
        CLASS_UNKNOWN: 0.3,
    }
    base_weight = class_weights.get(fc.classification, 0.3)

    # New files get a slight boost; deleted files get a different treatment.
    if fc.is_new:
        base_weight = min(base_weight + 0.15, 1.0)
    if fc.is_deleted:
        base_weight = max(base_weight * 0.5, 0.05)

    general = _clamp(base_weight * 0.6 + norm_magnitude * 0.4)
    reasons["general_importance"] = (
        f"classification={fc.classification} base={base_weight:.2f} "
        f"magnitude={norm_magnitude:.2f} lines={fc.lines_changed}"
    )

    # ---- architecture relevance ----
    arch_kw = _path_keyword_score(fc.path, _ARCHITECTURE_KEYWORDS)
    arch_from_class = 1.0 if fc.classification in (CLASS_SOURCE, CLASS_CONFIG, CLASS_DEPENDENCY_MANIFEST) else 0.4
    arch = _clamp(arch_kw * 0.6 + arch_from_class * 0.3 + norm_magnitude * 0.1)
    reasons["architecture_relevance"] = (
        f"keywords={arch_kw:.2f} class_factor={arch_from_class:.2f} magnitude={norm_magnitude:.2f}"
    )

    # ---- performance relevance ----
    perf_kw = _path_keyword_score(fc.path, _PERFORMANCE_KEYWORDS)
    perf_from_class = 0.6 if fc.classification == CLASS_SOURCE else 0.2
    perf = _clamp(perf_kw * 0.7 + perf_from_class * 0.2 + norm_magnitude * 0.1)
    reasons["performance_relevance"] = (
        f"keywords={perf_kw:.2f} class_factor={perf_from_class:.2f} magnitude={norm_magnitude:.2f}"
    )

    # ---- security relevance ----
    sec_kw = _path_keyword_score(fc.path, _SECURITY_KEYWORDS)
    sec_from_class = 0.5 if fc.classification in (CLASS_SOURCE, CLASS_CONFIG) else 0.1
    sec = _clamp(sec_kw * 0.8 + sec_from_class * 0.2)
    reasons["security_relevance"] = (
        f"keywords={sec_kw:.2f} class_factor={sec_from_class:.2f}"
    )

    # ---- dependency relevance ----
    dep_kw = _path_keyword_score(fc.path, _DEPENDENCY_KEYWORDS)
    dep_from_class = 1.0 if fc.classification == CLASS_DEPENDENCY_MANIFEST else 0.0
    dep = _clamp(dep_kw * 0.3 + dep_from_class * 0.7)
    reasons["dependency_relevance"] = (
        f"keywords={dep_kw:.2f} class_factor={dep_from_class:.2f}"
    )

    # ---- breaking-change relevance ----
    brk_kw = _path_keyword_score(fc.path, _BREAKING_KEYWORDS)
    brk_from_change = 0.4 if fc.is_deleted else 0.0
    brk_from_class = 0.6 if fc.classification in (CLASS_SOURCE, CLASS_CONFIG, CLASS_DEPENDENCY_MANIFEST) else 0.2
    brk = _clamp(brk_kw * 0.5 + brk_from_change * 0.2 + brk_from_class * 0.2 + norm_magnitude * 0.1)
    reasons["breaking_change_relevance"] = (
        f"keywords={brk_kw:.2f} deleted={fc.is_deleted} class_factor={brk_from_class:.2f}"
    )

    # ---- llm_patch_priority (composite) ----
    llm_prio = (
        general * 0.25
        + arch * 0.20
        + perf * 0.15
        + sec * 0.10
        + dep * 0.15
        + brk * 0.15
    )
    llm_prio = _clamp(llm_prio)
    reasons["llm_patch_priority"] = (
        f"general={general:.2f} arch={arch:.2f} perf={perf:.2f} "
        f"sec={sec:.2f} dep={dep:.2f} brk={brk:.2f}"
    )

    fc.scores = ScoreBreakdown(
        general_importance=round(general, 4),
        architecture_relevance=round(arch, 4),
        performance_relevance=round(perf, 4),
        security_relevance=round(sec, 4),
        dependency_relevance=round(dep, 4),
        breaking_change_relevance=round(brk, 4),
        llm_patch_priority=round(llm_prio, 4),
    )
    fc.score_reasons = reasons
    return fc


# ============================================================
# git --stat parser
# ============================================================

# Matches lines like:
#   src/main.py          |  12 +++--
#   path/with spaces.c   |  0
#   some/file.py         | Bin 0 -> 1234 bytes
#   old/path => new/path |  5 ++
_STAT_LINE_RE = re.compile(
    r"""
    ^\s*
    (?P<old_path>[^|]+?)?                    # old path (before =>)
    (?:\s*=>\s*(?P<new_path>[^|]+?))?       # optional => new_path
    \s*\|\s*
    (?:(?P<binary>Bin\s+\d+.*)|              # binary indicator
       (?P<changes>\d+)(?:\s+(?P<bar>[+-]+)?)?)  # numeric changes
    """, re.VERBOSE,
)

_RENAME_RE = re.compile(r"^(.*)\{(.+)\s*=>\s*(.+)\}(.*)$")


def _parse_stat_line(line: str) -> dict[str, Any] | None:
    """Parse one line from `git diff --stat` output.

    Returns a dict with path, insertions, deletions, is_binary, is_rename,
    old_path, or None if the line cannot be parsed.
    """
    line = line.strip()
    if not line:
        return None

    m = _STAT_LINE_RE.match(line)
    if not m:
        return None

    old_path_raw = (m.group("old_path") or "").strip()
    new_path_raw = (m.group("new_path") or "").strip()
    changes_str = (m.group("changes") or "0").strip()
    bar = (m.group("bar") or "").strip()
    binary = m.group("binary")

    # Determine final path
    is_rename = bool(new_path_raw)
    if is_rename:
        path = new_path_raw
    else:
        path = old_path_raw

    if binary:
        return {
            "path": path,
            "old_path": old_path_raw,
            "insertions": 0,
            "deletions": 0,
            "is_binary": True,
            "is_rename": is_rename,
        }

    total = int(changes_str)
    plus = bar.count("+")
    minus = bar.count("-")

    # When bar has no +/-, fall back to simple heuristic
    if plus == 0 and minus == 0 and total > 0:
        plus = total // 2
        minus = total - plus

    return {
        "path": path,
        "old_path": old_path_raw,
        "insertions": plus,
        "deletions": minus,
        "is_binary": False,
        "is_rename": is_rename,
    }


def _parse_diff_stat(stat_text: str) -> list[dict[str, Any]]:
    """Parse multi-line `git diff --stat` output into a list of per-file records."""
    entries: list[dict[str, Any]] = []
    for raw_line in stat_text.splitlines():
        entry = _parse_stat_line(raw_line)
        if entry is not None:
            entries.append(entry)
    return entries


# ============================================================
# Directory rollup helpers
# ============================================================


def _dir_key(path: str, depth: int = 2) -> str:
    """Extract the first *depth* directory segments as a grouping key."""
    parts = [p for p in path.split("/") if p and not p.startswith(".")]
    return "/".join(parts[:depth]) if parts else "(root)"


def _build_directory_rollups(file_changes: list[FileChange]) -> dict[str, DirectoryRollup]:
    """Aggregate file changes into per-directory rollups."""
    rollups: dict[str, DirectoryRollup] = {}
    for fc in file_changes:
        key = _dir_key(fc.path)
        if key not in rollups:
            rollups[key] = DirectoryRollup()
        ru = rollups[key]
        ru.file_count += 1
        ru.insertions += fc.insertions
        ru.deletions += fc.deletions
        ru.categories[fc.classification] = ru.categories.get(fc.classification, 0) + 1
    return rollups


# ============================================================
# build_manifest
# ============================================================


def build_manifest(
    repo_url: str,
    from_ref: str,
    to_ref: str,
    from_commit: str,
    to_commit: str,
    version: str,
    date: str,
    commit_count: int,
    commits: list[dict[str, str]],
    file_stats: str,
    max_files: int = 30,
    file_statuses: list[dict[str, str]] | None = None,
) -> Manifest:
    """Build a full `Manifest` from git stat output and commit metadata.

    Parameters
    ----------
    repo_url : str
        GitHub repo URL.
    from_ref / to_ref : str
        Tag- or branch-names defining the interval boundaries.
    from_commit / to_commit : str
        Full commit hashes.
    version : str
        Version label (e.g. "v1.2.3").
    date : str
        ISO-format date string.
    commit_count : int
        Number of commits in the interval.
    commits : list[dict]
        Each dict has {"hash", "date", "author", "message"}.
    file_stats : str
        Raw output of ``git diff --stat from_commit...to_commit``.
    """
    # ---- parse stat entries ----
    stat_entries = _parse_diff_stat(file_stats)
    status_by_path = {item.get("path", ""): item.get("status", "") for item in (file_statuses or [])}

    # ---- build FileChange objects ----
    file_changes: list[FileChange] = []
    for entry in stat_entries:
        path = entry["path"]
        classification = _classify_file_category(path)
        fc = FileChange(
            path=path,
            classification=classification,
            is_source=(classification == CLASS_SOURCE),
            is_test=(classification == CLASS_TEST),
            is_docs=(classification == CLASS_DOCS),
            is_dependency=(classification == CLASS_DEPENDENCY_MANIFEST),
            is_generated=(classification == CLASS_GENERATED),
            is_deleted=status_by_path.get(path, "") == "D",
            is_new=status_by_path.get(path, "") in ("A", "C"),
            is_binary=entry["is_binary"],
            insertions=entry["insertions"],
            deletions=entry["deletions"],
            lines_changed=entry["insertions"] + entry["deletions"],
        )
        file_changes.append(fc)

    # ---- build interval context ----
    commit_intent_counts: dict[str, int] = {}
    for c in commits:
        intent = _classify_commit_intent(c.get("message", ""))
        commit_intent_counts[intent] = commit_intent_counts.get(intent, 0) + 1

    total_insertions = sum(fc.insertions for fc in file_changes)
    total_deletions = sum(fc.deletions for fc in file_changes)

    # Determine date range from commits
    dates = sorted(c.get("date", "") for c in commits if c.get("date"))
    date_start = dates[0] if dates else date
    date_end = dates[-1] if dates else date

    # Directory rollups (before scoring, so we have rough context)
    dir_rollups = _build_directory_rollups(file_changes)

    interval = IntervalContext(
        interval_commits=commit_count,
        interval_date_start=date_start,
        interval_date_end=date_end,
        commit_intent_counts=commit_intent_counts,
        directory_rollups=dir_rollups,
        unique_authors=len({c.get("author", "") for c in commits if c.get("author")}),
        total_files=len(file_changes),
        total_insertions=total_insertions,
        total_deletions=total_deletions,
    )

    # ---- score each file change ----
    for fc in file_changes:
        score_file_change(fc, interval)

    # ---- risk metrics ----
    large_deletions_count = sum(1 for fc in file_changes if fc.deletions > 200)
    config_changes_count = sum(1 for fc in file_changes if fc.classification == CLASS_CONFIG)
    migration_files_count = sum(1 for fc in file_changes if fc.classification == CLASS_MIGRATION)
    breaking_keywords_hits = sum(
        1 for c in commits
        if _BREAKING_KEYWORDS.intersection(
            kw for kw in _BREAKING_KEYWORDS if kw in c.get("message", "").lower()
        )
    )
    api_surface_changes = sum(
        1 for fc in file_changes
        if fc.classification == CLASS_SOURCE and (
            "api" in fc.path.lower()
            or "route" in fc.path.lower()
            or "endpoint" in fc.path.lower()
            or "handler" in fc.path.lower()
            or "controller" in fc.path.lower()
        )
    )
    dep_manifest_changes = sum(
        1 for fc in file_changes if fc.classification == CLASS_DEPENDENCY_MANIFEST
    )

    risk = RiskMetrics(
        large_deletions_count=large_deletions_count,
        config_changes_count=config_changes_count,
        migration_files_count=migration_files_count,
        breaking_keywords_hits=breaking_keywords_hits,
        api_surface_changes=api_surface_changes,
        dependency_manifest_changes=dep_manifest_changes,
    )

    # ---- topic signals ----
    source_changes = [fc for fc in file_changes if fc.classification == CLASS_SOURCE]
    n = max(len(source_changes), 1)

    topic = TopicSignals(
        architecture=_clamp(sum(fc.scores.architecture_relevance for fc in source_changes) / n * 2.0),
        performance=_clamp(sum(fc.scores.performance_relevance for fc in source_changes) / n * 2.0),
        security=_clamp(sum(fc.scores.security_relevance for fc in source_changes) / n * 2.0),
        dependency=_clamp(
            (sum(fc.scores.dependency_relevance for fc in file_changes) / max(len(file_changes), 1)) * 2.0
        ),
        breaking=_clamp(
            sum(fc.scores.breaking_change_relevance for fc in source_changes) / n * 2.0
        ),
        feature=_clamp(
            commit_intent_counts.get("feat", 0) / max(commit_count, 1) * 5.0
        ),
        refactor=_clamp(
            commit_intent_counts.get("refactor", 0) / max(commit_count, 1) * 5.0
        ),
        bugfix=_clamp(
            commit_intent_counts.get("fix", 0) / max(commit_count, 1) * 5.0
        ),
    )

    # ---- extraction plan ----
    extraction = plan_patch_extraction(file_changes, max_files=max_files)

    # ---- cache metadata ----
    cache_key = manifest_cache_key(repo_url, from_commit, to_commit)

    return Manifest(
        repo_url=repo_url,
        from_ref=from_ref,
        to_ref=to_ref,
        from_commit=from_commit,
        to_commit=to_commit,
        version=version,
        date=date,
        commit_count=commit_count,
        interval=interval,
        commits=list(commits),
        file_changes=file_changes,
        risk_metrics=risk,
        topic_signals=topic,
        extraction_plan=extraction,
        cache_metadata={
            "cache_key": cache_key,
            "config_hash": "v1",
            "generated_at": date,
            "scorer_version": "1.0",
        },
    )


# ============================================================
# plan_patch_extraction
# ============================================================


def plan_patch_extraction(
    manifests_or_changes: list[FileChange] | Manifest,
    max_files: int = 30,
) -> ExtractionPlan:
    """Plan which files to extract for LLM analysis, sorted by priority.

    Accepts either a `Manifest` (uses ``.file_changes``) or a raw list of
    `FileChange` objects (e.g. for in-progress scoring).

    Always includes dependency manifests and excludes generated/vendor files
    unless they have exceptionally high scores.
    """
    if isinstance(manifests_or_changes, Manifest):
        file_changes = list(manifests_or_changes.file_changes)
    else:
        file_changes = list(manifests_or_changes)

    # Filter out vendor, generated, and lockfiles (zero-value for LLM)
    filtered = [
        fc for fc in file_changes
        if fc.classification not in (CLASS_VENDOR, CLASS_GENERATED, CLASS_LOCKFILE)
        and fc.lines_changed > 0
    ]

    # Always include dependency manifests
    dep_files = [fc for fc in filtered if fc.classification == CLASS_DEPENDENCY_MANIFEST]
    non_dep = [fc for fc in filtered if fc.classification != CLASS_DEPENDENCY_MANIFEST]

    # Sort by llm_patch_priority descending
    dep_files.sort(key=lambda fc: fc.scores.llm_patch_priority, reverse=True)
    non_dep.sort(key=lambda fc: fc.scores.llm_patch_priority, reverse=True)

    # Combine: dep files first (they're small but high-signal), then top priority
    selected = dep_files[:3] + non_dep[:max(0, max_files - len(dep_files[:3]))]
    selected = selected[:max_files]

    selected_paths = [fc.path for fc in selected]
    cat_counts: dict[str, int] = {}
    for fc in selected:
        cat_counts[fc.classification] = cat_counts.get(fc.classification, 0) + 1

    coverage = len(selected) / max(len(filtered), 1)

    return ExtractionPlan(
        files=selected_paths,
        total_files=len(selected),
        categories=cat_counts,
        coverage=round(coverage, 4),
    )


# ============================================================
# manifest_cache_key
# ============================================================


def manifest_cache_key(
    repo_url: str,
    from_commit: str,
    to_commit: str,
    config_hash: str = "v1",
) -> str:
    """Deterministic cache key for a manifest.

    Based on SHA-256 of the concatenated inputs.
    """
    raw = f"{repo_url}|{from_commit}|{to_commit}|{config_hash}"
    return hashlib.sha256(raw.encode()).hexdigest()
