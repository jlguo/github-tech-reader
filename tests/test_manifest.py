from __future__ import annotations

import json

from manifest import build_manifest, classify_file, manifest_cache_key, plan_patch_extraction


def _sample_commits() -> list[dict[str, str]]:
    return [
        {"hash": "1", "date": "2026-01-01", "author": "A", "message": "feat(auth): add token refresh"},
        {"hash": "2", "date": "2026-01-02", "author": "B", "message": "perf(cache): batch repo scans"},
        {"hash": "3", "date": "2026-01-03", "author": "A", "message": "BREAKING CHANGE: migrate user schema"},
    ]


def _sample_stat() -> str:
    return """
 src/auth/session_manager.py       | 180 +++++++++++++++---
 src/cache/repo_cache.py           |  72 +++++--
 requirements.txt                  |   8 +-
 migrations/20260101_add_users.sql |  36 ++++
 tests/test_auth.py                |  44 ++++
 README.md                         |  30 +++
 yarn.lock                         | 400 ++++++++++++++++++++++++++++++++
 api.pb.go                         | 200 +++++++++++++++++
 8 files changed, 930 insertions(+), 40 deletions(-)
"""


def test_classify_file_returns_public_record_for_security_source() -> None:
    result = classify_file("src/auth/session_manager.py")

    assert result["path"] == "src/auth/session_manager.py"
    assert result["category"] == "source"
    assert result["classification"] == "source"
    assert result["score"] > 0.5
    assert "security" in result["tags"]
    assert result["scores"]["security_relevance"] >= 0.5


def test_classify_file_marks_low_value_noise_categories() -> None:
    examples = {
        "README.md": "docs",
        "yarn.lock": "lock",
        "api.pb.go": "generated",
        "vendor/pkg/file.go": "vendor",
    }

    for path, expected_category in examples.items():
        result = classify_file(path)
        assert result["category"] == expected_category
        assert result["score"] < 0.5


def test_classify_file_marks_dependency_and_migration_files() -> None:
    dependency = classify_file("requirements.txt")
    migration = classify_file("migrations/20260101_add_users.sql")

    assert dependency["category"] == "dependency"
    assert dependency["scores"]["dependency_relevance"] >= 0.7
    assert "dependency" in dependency["tags"]
    assert migration["classification"] == "migration"
    assert "breaking" in migration["tags"]


def test_build_manifest_produces_rich_json_safe_schema() -> None:
    manifest = build_manifest(
        repo_url="https://github.com/acme/project",
        from_ref="v1.0.0",
        to_ref="v1.1.0",
        from_commit="abc123",
        to_commit="def456",
        version="v1.1.0",
        date="2026-01-03",
        commit_count=3,
        commits=_sample_commits(),
        file_stats=_sample_stat(),
    )
    data = manifest.to_dict()

    json.dumps(data)
    assert data["repo_url"] == "https://github.com/acme/project"
    assert data["from_commit"] == "abc123"
    assert data["to_commit"] == "def456"
    assert data["interval"]["interval_commits"] == 3
    assert len(data["file_changes"]) == 8
    assert "src/auth/session_manager.py" in {item["path"] for item in data["file_changes"]}
    assert data["risk_metrics"]["migration_files_count"] >= 1
    assert data["risk_metrics"]["dependency_manifest_changes"] >= 1
    assert data["topic_signals"]["security"] > 0
    assert data["topic_signals"]["dependency"] > 0
    assert data["cache_metadata"]["cache_key"]


def test_directory_rollups_group_changed_files() -> None:
    manifest = build_manifest(
        repo_url="https://github.com/acme/project",
        from_ref="v1.0.0",
        to_ref="v1.1.0",
        from_commit="abc123",
        to_commit="def456",
        version="v1.1.0",
        date="2026-01-03",
        commit_count=3,
        commits=_sample_commits(),
        file_stats=_sample_stat(),
    )
    rollups = manifest.to_dict()["interval"]["directory_rollups"]

    assert "src/auth" in rollups
    assert rollups["src/auth"]["file_count"] == 1
    assert rollups["src/auth"]["insertions"] > 0


def test_plan_patch_extraction_skips_noise_and_prioritizes_dependencies_and_security() -> None:
    manifest = build_manifest(
        repo_url="https://github.com/acme/project",
        from_ref="v1.0.0",
        to_ref="v1.1.0",
        from_commit="abc123",
        to_commit="def456",
        version="v1.1.0",
        date="2026-01-03",
        commit_count=3,
        commits=_sample_commits(),
        file_stats=_sample_stat(),
    )
    plan = plan_patch_extraction(manifest, max_files=4).to_dict()

    assert plan["total_files"] <= 4
    assert "requirements.txt" in plan["files"]
    assert "src/auth/session_manager.py" in plan["files"]
    assert "yarn.lock" not in plan["files"]
    assert "api.pb.go" not in plan["files"]


def test_manifest_cache_key_is_deterministic_and_config_sensitive() -> None:
    base = manifest_cache_key("repo", "abc", "def")

    assert base == manifest_cache_key("repo", "abc", "def")
    assert base != manifest_cache_key("repo", "abc", "xyz")
    assert base != manifest_cache_key("repo", "abc", "def", config_hash="v2")
    assert len(base) == 64


def test_build_manifest_respects_file_statuses_for_new_and_deleted() -> None:
    manifest = build_manifest(
        repo_url="repo",
        from_ref="a",
        to_ref="b",
        from_commit="abc",
        to_commit="def",
        version="b",
        date="2026-01-01",
        commit_count=1,
        commits=[{"hash": "h", "date": "2026-01-01", "author": "A", "message": "feat: add new module"}],
        file_stats=" src/new_module.py | 50 +++++\n src/old_module.py | 40 -----\n 2 files changed, 50 insertions(+), 40 deletions(-)",
        file_statuses=[
            {"status": "A", "path": "src/new_module.py"},
            {"status": "D", "path": "src/old_module.py"},
        ],
    )
    data = manifest.to_dict()
    new_entry = next(item for item in data["file_changes"] if item["path"] == "src/new_module.py")
    deleted_entry = next(item for item in data["file_changes"] if item["path"] == "src/old_module.py")
    assert new_entry["is_new"] is True
    assert deleted_entry["is_deleted"] is True
    assert deleted_entry["scores"]["breaking_change_relevance"] > 0


def test_plan_patch_extraction_sorts_dependency_files_by_priority() -> None:
    manifest = build_manifest(
        repo_url="repo",
        from_ref="a",
        to_ref="b",
        from_commit="abc",
        to_commit="def",
        version="b",
        date="2026-01-01",
        commit_count=1,
        commits=[{"hash": "h", "date": "2026-01-01", "author": "A", "message": "chore: bump deps"}],
        file_stats=""" requirements.txt | 2 +-
 go.mod            | 4 ++--
 package.json      | 6 +++---
 src/main.py       | 10 +++++
 4 files changed, 12 insertions(+), 6 deletions(-)""",
        max_files=3,
    )
    plan = manifest.extraction_plan.to_dict()
    assert plan["total_files"] <= 3
    assert plan["files"][0] in ("requirements.txt", "go.mod", "package.json")
