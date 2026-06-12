from __future__ import annotations

import json
import tempfile
from pathlib import Path

from book_analyzer import (
    DEFAULT_CHAPTER_TITLES,
    DEFAULT_SECTION_TITLES,
    BookChapter,
    BookSection,
    EvidenceCitation,
    ProductCapability,
    ProductContext,
    _mock_citation,
    build_agent_plan_json,
    build_all_artifacts,
    build_book_context,
    build_book_json,
    build_book_report,
    build_capability_map_json,
    build_chapter_json,
    build_external_context_json,
    build_product_context,
    build_product_context_json,
    check_citations,
    check_style,
)

# ---------------------------------------------------------------------------
# Helper: mock module fixtures similar to what GitRepo.discover_modules() returns
# ---------------------------------------------------------------------------

def _mock_modules() -> list[dict]:
    return [
        {
            "name": "main",
            "file_count": 5,
            "total_lines": 1200,
            "key_files": [
                {
                    "path": "main.py",
                    "lines": 350,
                    "imports": "import os\nimport sys\nfrom git_utils import GitRepo",
                    "content": "def main():\n    parser = argparse.ArgumentParser()\n    ...",
                },
                {
                    "path": "git_utils.py",
                    "lines": 500,
                    "imports": "import subprocess\nfrom pathlib import Path",
                    "content": "class GitRepo:\n    def __init__(self, url):\n        ...",
                },
            ],
        },
        {
            "name": "diff_preprocessor",
            "file_count": 3,
            "total_lines": 800,
            "key_files": [
                {
                    "path": "diff_preprocessor.py",
                    "lines": 400,
                    "imports": "import re\nfrom dataclasses import dataclass",
                    "content": "def filter_noise(diff: str) -> str:\n    ...",
                },
            ],
        },
        {
            "name": "html_generator",
            "file_count": 4,
            "total_lines": 1500,
            "key_files": [
                {
                    "path": "html_generator.py",
                    "lines": 600,
                    "imports": "from jinja2 import Template",
                    "content": "def generate_html(data: dict) -> str:\n    ...",
                },
            ],
        },
        {
            "name": "svg_renderer",
            "file_count": 2,
            "total_lines": 300,
            "key_files": [
                {
                    "path": "svg_renderer.py",
                    "lines": 250,
                    "imports": "from playwright.sync_api import sync_playwright",
                    "content": "def render_mermaid(code: str) -> str:\n    ...",
                },
            ],
        },
    ]


# ---------------------------------------------------------------------------
# EvidenceCitation
# ---------------------------------------------------------------------------


def test_evidence_citation_to_dict_produces_json_serializable() -> None:
    c = EvidenceCitation(
        file_path="src/main.py",
        line_range="42-58",
        snippet="def main(): ...",
        source="abc123",
        description="Entry point",
    )
    d = c.to_dict()
    json.dumps(d)  # must not raise
    assert d["file_path"] == "src/main.py"
    assert d["line_range"] == "42-58"
    assert d["source"] == "abc123"


def test_evidence_citation_defaults_are_empty_strings() -> None:
    c = EvidenceCitation(file_path="README.md")
    d = c.to_dict()
    assert d["line_range"] == ""
    assert d["snippet"] == ""
    assert d["source"] == ""
    assert d["description"] == ""


def test_mock_citation_produces_valid_record() -> None:
    c = _mock_citation("core", "core/handler.py", "Handles requests")
    d = c.to_dict()
    json.dumps(d)
    assert d["file_path"] == "core/handler.py"
    assert "mock" in d["snippet"]
    assert d["source"] == "HEAD"
    assert d["description"] == "Handles requests"


# ---------------------------------------------------------------------------
# BookSection
# ---------------------------------------------------------------------------


def test_book_section_to_dict_includes_citations() -> None:
    s = BookSection(
        title="测试节标题",
        content="这是测试内容。",
        citations=[EvidenceCitation(file_path="test.py")],
        product_perspective="产品视角分析",
        section_number="3.2",
    )
    d = s.to_dict()
    json.dumps(d)
    assert d["title"] == "测试节标题"
    assert d["section_number"] == "3.2"
    assert d["product_perspective"] == "产品视角分析"
    assert len(d["citations"]) == 1
    assert d["citations"][0]["file_path"] == "test.py"


def test_book_section_empty_citations_is_list() -> None:
    s = BookSection(title="空节", content="...")
    d = s.to_dict()
    assert d["citations"] == []
    assert d["product_perspective"] == ""


# ---------------------------------------------------------------------------
# BookChapter
# ---------------------------------------------------------------------------


def test_book_chapter_to_dict_includes_sections() -> None:
    ch = BookChapter(
        chapter_number=1,
        title="项目概述",
        sections=[
            BookSection(title="项目背景", content="...", section_number="1.1"),
            BookSection(title="产品定位", content="...", section_number="1.2"),
        ],
        module_refs=["main", "git_utils"],
    )
    d = ch.to_dict()
    json.dumps(d)
    assert d["chapter_number"] == 1
    assert d["title"] == "项目概述"
    assert len(d["sections"]) == 2
    assert d["module_refs"] == ["main", "git_utils"]


# ---------------------------------------------------------------------------
# ProductCapability / ProductContext
# ---------------------------------------------------------------------------


def test_product_capability_to_dict() -> None:
    cap = ProductCapability(
        name="代码仓库管理",
        description="管理 GitHub 仓库的克隆与缓存",
        modules=["git_utils"],
        priority="high",
        maturity="stable",
        key_files=["git_utils.py"],
    )
    d = cap.to_dict()
    json.dumps(d)
    assert d["name"] == "代码仓库管理"
    assert d["priority"] == "high"
    assert d["maturity"] == "stable"


def test_product_context_defaults_are_empty_containers() -> None:
    ctx = ProductContext()
    d = ctx.to_dict()
    json.dumps(d)
    assert d["product_type"] == ""
    assert d["product_goals"] == []
    assert d["capabilities"] == []


def test_build_product_context_returns_chinese_labels() -> None:
    ctx = build_product_context(_mock_modules())
    d = ctx.to_dict()
    json.dumps(d)
    assert d["product_type"] != ""
    assert len(d["product_goals"]) >= 1
    assert d["product_goals"][0]  # non-empty Chinese string
    assert len(d["tech_stack_summary"]) >= 1


def test_build_product_context_json_equivalent() -> None:
    ctx = build_product_context(_mock_modules())
    json_dict = build_product_context_json(_mock_modules())
    assert ctx.to_dict() == json_dict


# ---------------------------------------------------------------------------
# Capability map
# ---------------------------------------------------------------------------


def test_build_capability_map_json_has_expected_structure() -> None:
    cap_map = build_capability_map_json(modules=_mock_modules())
    json.dumps(cap_map)
    assert "total_capabilities" in cap_map
    assert cap_map["total_capabilities"] == 8
    capabilities = cap_map["capabilities"]
    assert "代码仓库管理" in capabilities
    assert "description" in capabilities["代码仓库管理"]
    assert "modules" in capabilities["代码仓库管理"]


def test_build_capability_map_json_accepts_product_context_directly() -> None:
    pc = build_product_context(_mock_modules())
    cap_map = build_capability_map_json(product_context=pc)
    assert cap_map["total_capabilities"] == 8


# ---------------------------------------------------------------------------
# Chapter JSON (12 chapters, Chinese titles)
# ---------------------------------------------------------------------------


def test_build_chapter_json_returns_valid_structure() -> None:
    modules = _mock_modules()
    ch = build_chapter_json(1, modules)
    assert ch is not None
    json.dumps(ch)
    assert ch["chapter_number"] == 1
    assert ch["title"] == DEFAULT_CHAPTER_TITLES[0]
    assert ch["title"] == "产品定位与用户问题"
    assert len(ch["sections"]) == len(DEFAULT_SECTION_TITLES[1])
    # Every section must have at least one citation
    for sec in ch["sections"]:
        assert len(sec["citations"]) >= 1, f"章节 {sec['section_number']} 缺少引用"


def test_all_twelve_chapters_have_chinese_titles() -> None:
    modules = _mock_modules()
    for i in range(1, 13):
        ch = build_chapter_json(i, modules)
        assert ch is not None, f"第{i}章为空"
        assert ch["title"] == DEFAULT_CHAPTER_TITLES[i - 1]
        # Verify title is Chinese (contains CJK characters)
        assert any("\u4e00" <= c <= "\u9fff" for c in ch["title"]), (
            f"第{i}章标题非中文: {ch['title']}"
        )


_EXPECTED_PRODUCT_CHAPTERS = [
    "产品定位与用户问题",
    "产品能力地图与用户旅程",
    "输入与项目理解能力",
    "分析模式决策能力",
    "源码结构理解能力",
    "LLM 内容生成能力",
    "可信报告生成能力",
    "成本、速度与可用性设计",
    "面向复杂项目的扩展架构",
    "多 Agent 协作生成一本书",
    "插件化与生态入口设计",
    "从源码到产品洞察的方法论",
]


def test_chapter_titles_match_product_driven_schema() -> None:
    assert DEFAULT_CHAPTER_TITLES == _EXPECTED_PRODUCT_CHAPTERS
    product_signals = ["产品", "用户", "能力", "输入", "分析", "决策",
                       "生成", "报告", "成本", "Agent", "插件", "洞察", "方法论", "扩展"]
    for i, title in enumerate(DEFAULT_CHAPTER_TITLES, 1):
        matched = [kw for kw in product_signals if kw in title]
        assert matched, f"第{i}章标题缺少产品关键词: {title}"


def test_all_twelve_chapters_have_sections_with_citations() -> None:
    modules = _mock_modules()
    for i in range(1, 13):
        ch = build_chapter_json(i, modules)
        assert ch is not None
        assert len(ch["sections"]) >= 1, f"第{i}章没有节"
        sec_numbers: set[str] = set()
        for sec in ch["sections"]:
            # At least one citation per section
            assert len(sec["citations"]) >= 1, (
                f"第{i}章 {sec.get('section_number')} 缺少引用"
            )
            # Section number must be unique within chapter
            sn = sec.get("section_number", "")
            assert sn not in sec_numbers, f"重复的节号 {sn} 在第{i}章"
            sec_numbers.add(sn)
            # Must have product perspective
            assert sec.get("product_perspective"), (
                f"第{i}章 {sec.get('section_number')} 缺少产品视角"
            )
            # Section title must be Chinese or contain Chinese
            assert "\u4e00" <= sec["title"][0] <= "\u9fff" or any(
                "\u4e00" <= c <= "\u9fff" for c in sec["title"]
            ), f"第{i}章节标题 {sec['title']} 非中文"


def test_build_chapter_json_out_of_range_returns_none() -> None:
    assert build_chapter_json(0) is None
    assert build_chapter_json(13) is None
    assert build_chapter_json(-1) is None


def test_chapter_json_with_no_modules_still_has_citations() -> None:
    ch = build_chapter_json(5, [])
    assert ch is not None
    for sec in ch["sections"]:
        assert len(sec["citations"]) >= 1


# ---------------------------------------------------------------------------
# BookContext (full assembly)
# ---------------------------------------------------------------------------


def test_build_book_context_produces_json_safe_schema() -> None:
    ctx = build_book_context(
        repo_url="https://github.com/acme/test",
        repo_name="acme-test",
        modules=_mock_modules(),
        generated_at="2026-06-01T00:00:00Z",
    )
    d = ctx.to_dict()
    json.dumps(d)
    assert d["repo_url"] == "https://github.com/acme/test"
    assert d["repo_name"] == "acme-test"
    assert d["analysis_mode"] == "structural"
    assert d["generated_at"] == "2026-06-01T00:00:00Z"


def test_build_book_context_has_twelve_chapters() -> None:
    ctx = build_book_context(modules=_mock_modules())
    d = ctx.to_dict()
    chapters = d["chapters"]
    assert len(chapters) == 12
    for i, ch in enumerate(chapters, 1):
        assert ch["chapter_number"] == i
        assert ch["title"] == DEFAULT_CHAPTER_TITLES[i - 1]


def test_build_book_context_module_index_is_populated() -> None:
    ctx = build_book_context(modules=_mock_modules())
    d = ctx.to_dict()
    idx = d["module_index"]
    assert "main" in idx
    assert idx["main"]["file_count"] == 5
    assert idx["main"]["total_lines"] == 1200


def test_build_book_context_meta_counts_are_correct() -> None:
    ctx = build_book_context(modules=_mock_modules())
    d = ctx.to_dict()
    meta = d["meta"]
    assert meta["chapter_count"] == 12
    assert meta["module_count"] == 4
    # total_sections = sum of section counts for all 12 chapters
    expected_sections = sum(
        len(DEFAULT_SECTION_TITLES.get(i, [])) for i in range(1, 13)
    )
    assert meta["total_sections"] == expected_sections
    assert meta["total_citations"] >= 12  # at least one per chapter


# ---------------------------------------------------------------------------
# Checker functions
# ---------------------------------------------------------------------------


def test_check_citations_catches_missing_citations() -> None:
    ch = BookChapter(
        chapter_number=1,
        title="项目概述",
        sections=[
            BookSection(
                title="无引用的节",
                content="...",
                citations=[],
                section_number="1.1",
            ),
        ],
    )
    issues = check_citations(ch)
    assert len(issues) >= 1
    assert any("missing_citation" in i["issue"] for i in issues)


def test_check_citations_catches_empty_file_path() -> None:
    ch = BookChapter(
        chapter_number=2,
        title="技术架构",
        sections=[
            BookSection(
                title="坏引用",
                content="...",
                citations=[EvidenceCitation(file_path="N/A")],
                section_number="2.1",
            ),
        ],
    )
    issues = check_citations(ch)
    assert len(issues) >= 1
    assert any("empty_file_path" in i["issue"] for i in issues)


def test_check_citations_passes_clean_chapter() -> None:
    ch = build_chapter_json(1, _mock_modules())
    assert ch is not None
    issues = check_citations(ch)
    assert len(issues) == 0, f"意外发现引文问题: {issues}"


def test_check_citations_accepts_book_chapter_object() -> None:
    bc = BookChapter(
        chapter_number=1,
        title="项目概述",
        sections=[
            BookSection(
                title="背景",
                citations=[EvidenceCitation(file_path="test.py")],
                section_number="1.1",
            ),
        ],
    )
    issues = check_citations(bc)
    assert len(issues) == 0


def test_check_style_catches_missing_title() -> None:
    ch = BookChapter(chapter_number=1, title="")
    issues = check_style(ch)
    assert any("missing_chapter_title" in i["issue"] for i in issues)


def test_check_style_catches_empty_content() -> None:
    ch = BookChapter(
        chapter_number=1,
        title="项目概述",
        sections=[
            BookSection(title="空内容", content="", section_number="1.1"),
        ],
    )
    issues = check_style(ch)
    assert any("empty_content" in i["issue"] for i in issues)


def test_check_style_catches_missing_product_perspective() -> None:
    ch = BookChapter(
        chapter_number=1,
        title="项目概述",
        sections=[
            BookSection(
                title="无产品视角",
                content="...",
                product_perspective="",
                section_number="1.1",
            ),
        ],
    )
    issues = check_style(ch)
    assert any("missing_product_perspective" in i["issue"] for i in issues)


def test_check_style_passes_well_formed_chapter() -> None:
    ch = build_chapter_json(3, _mock_modules())
    assert ch is not None
    issues = check_style(ch)
    assert len(issues) == 0, f"意外发现样式问题: {issues}"


def test_check_style_accepts_book_chapter_object() -> None:
    bc = BookChapter(
        chapter_number=1,
        title="项目概述",
        sections=[
            BookSection(
                title="背景",
                content="...",
                product_perspective="...",
                section_number="1.1",
            ),
        ],
    )
    issues = check_style(bc)
    assert len(issues) == 0


# ---------------------------------------------------------------------------
# build_all_artifacts integration
# ---------------------------------------------------------------------------


def test_build_all_artifacts_contains_all_keys() -> None:
    artifacts = build_all_artifacts(modules=_mock_modules())
    expected_keys = {"book_context", "product_context", "capability_map",
                     "book", "external_context", "agent_plan"} | {
        f"chapter_{i:02d}" for i in range(1, 13)
    }
    assert set(artifacts.keys()) == expected_keys


def test_build_all_artifacts_is_fully_json_serializable() -> None:
    artifacts = build_all_artifacts(modules=_mock_modules())
    serialized = json.dumps(artifacts)
    assert len(serialized) > 1000  # substantial output


def test_build_book_json_includes_all_chapters() -> None:
    book = build_book_json(_mock_modules())
    json.dumps(book)
    assert len(book["chapters"]) == 12
    assert book["product_context"]["capabilities"]


def test_build_book_json_empty_modules_is_valid() -> None:
    book = build_book_json([])
    json.dumps(book)
    assert len(book["chapters"]) == 12
    # Chapters must still have at least one section each
    for ch in book["chapters"]:
        assert len(ch["sections"]) >= 1


# ---------------------------------------------------------------------------
# DEFAULT_* constants
# ---------------------------------------------------------------------------


def test_default_chapter_titles_are_twelve_chinese() -> None:
    assert len(DEFAULT_CHAPTER_TITLES) == 12
    for title in DEFAULT_CHAPTER_TITLES:
        assert any("\u4e00" <= c <= "\u9fff" for c in title), f"非中文标题: {title}"


def test_default_section_titles_cover_all_twelve() -> None:
    for i in range(1, 13):
        assert i in DEFAULT_SECTION_TITLES, f"第{i}章缺少默认节标题"
        assert len(DEFAULT_SECTION_TITLES[i]) >= 2, f"第{i}章节标题不足"


def test_default_section_titles_are_chinese() -> None:
    for chapter_num, titles in DEFAULT_SECTION_TITLES.items():
        for title in titles:
            assert any("\u4e00" <= c <= "\u9fff" for c in title), (
                f"非中文节标题 第{chapter_num}章: {title}"
            )


# ---------------------------------------------------------------------------
# build_book_report (CLI integration)
# ---------------------------------------------------------------------------

_EXPECTED_FILES = (
    {"book_context.json", "product_context.json", "capability_map.json",
     "book.json", "book_manifest.json",
     "external_context.json", "agent_plan.json"}
    | {f"chapter_{i:02d}.json" for i in range(1, 13)}
)


def test_build_book_report_writes_all_files() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        result = build_book_report(
            repo_info={"name": "test/repo", "url": "https://github.com/test/repo"},
            output_dir=tmpdir,
        )
        written = set(Path(tmpdir).glob("*.json"))
        filenames = {p.name for p in written}
        assert filenames == _EXPECTED_FILES


def test_build_book_report_returns_correct_metadata() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        result = build_book_report(
            repo_info={"name": "test/repo", "url": "https://github.com/test/repo"},
            output_dir=tmpdir,
            section="产品定位",
        )
        assert result["mode"] == "book"
        assert result["status"] == "complete"
        assert result["output_dir"] == tmpdir
        assert result["section_filter"] == "产品定位"
        assert result["repo"]["name"] == "test/repo"
        assert len(result["artifacts"]) == 19  # 18 artifacts + manifest


def test_build_book_report_files_are_valid_json() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        build_book_report(
            repo_info={"name": "test/repo"},
            output_dir=tmpdir,
        )
        for json_file in Path(tmpdir).glob("*.json"):
            with open(json_file, encoding="utf-8") as f:
                data = json.load(f)
            assert isinstance(data, dict), f"{json_file.name} not a JSON object"


def test_build_book_report_manifest_is_written() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        build_book_report(
            repo_info={"name": "test/repo"},
            output_dir=tmpdir,
        )
        manifest_path = Path(tmpdir) / "book_manifest.json"
        assert manifest_path.exists()
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert manifest["mode"] == "book"
        assert manifest["status"] == "complete"
        assert "repo" in manifest


def test_build_book_report_section_filter_recorded() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        build_book_report(
            repo_info={"name": "test/repo"},
            output_dir=tmpdir,
            section="LLM 内容生成",
        )
        manifest = json.loads(
            (Path(tmpdir) / "book_manifest.json").read_text(encoding="utf-8")
        )
        assert manifest["section_filter"] == "LLM 内容生成"


def test_build_book_report_no_repo_no_modules() -> None:
    result = build_book_report(repo_info={"name": "bare"}, output_dir="")
    assert result["status"] == "complete"
    assert "output_dir" in result


def test_build_book_report_handles_none_repo_gracefully() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        result = build_book_report(
            repo=None,
            repo_info={"name": "orphan"},
            output_dir=tmpdir,
        )
        assert result["status"] == "complete"
        files = {p.name for p in Path(tmpdir).glob("*.json")}
        assert "book_manifest.json" in files
        # Even without modules, all chapters should be written
        for i in range(1, 13):
            assert f"chapter_{i:02d}.json" in files


def test_build_book_report_chapter_files_have_citations() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        build_book_report(
            repo_info={"name": "test/repo"},
            output_dir=tmpdir,
        )
        for i in range(1, 13):
            ch_path = Path(tmpdir) / f"chapter_{i:02d}.json"
            ch = json.loads(ch_path.read_text(encoding="utf-8"))
            for sec in ch["sections"]:
                assert len(sec["citations"]) >= 1, (
                    f"Chapter {i}, section {sec.get('section_number')} missing citations"
                )


def test_build_book_report_offline_mode_no_llm_used() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        build_book_report(
            repo_info={"name": "test/repo"},
            output_dir=tmpdir,
            use_llm=False,
        )
        manifest = json.loads(
            (Path(tmpdir) / "book_manifest.json").read_text(encoding="utf-8")
        )
        assert manifest["offline_mode"] is True


def test_build_book_report_accepts_extra_kwargs() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        result = build_book_report(
            repo_info={"name": "test/repo"},
            output_dir=tmpdir,
            workers=4,
            no_cache=True,
            cache_dir="/tmp/cache",
            extra_future_param=42,
        )
        assert result["status"] == "complete"


# ---------------------------------------------------------------------------
# Phase 4: External enrichment context
# ---------------------------------------------------------------------------


def test_build_external_context_json_has_sources() -> None:
    ec = build_external_context_json({"name": "test/repo", "url": "https://github.com/test/repo"})
    json.dumps(ec)
    assert ec["status"].startswith("scaffold")
    assert len(ec["sources"]) == 6
    assert any(s["type"] == "github_issues" for s in ec["sources"])
    assert any(s["type"] == "github_prs" for s in ec["sources"])
    assert any(s["type"] == "commit_history" for s in ec["sources"])


def test_build_external_context_json_all_sources_planned() -> None:
    ec = build_external_context_json()
    for s in ec["sources"]:
        assert s["status"] == "planned", f"{s['type']} should be planned, got {s['status']}"


def test_build_external_context_json_handles_none_repo_info() -> None:
    ec = build_external_context_json(None)
    json.dumps(ec)
    assert ec["repo"] == "unknown"
    assert len(ec["sources"]) >= 1


def test_external_context_json_written_by_build_book_report() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        build_book_report(
            repo_info={"name": "test/repo", "url": "https://github.com/test/repo"},
            output_dir=tmpdir,
        )
        ec_path = Path(tmpdir) / "external_context.json"
        assert ec_path.exists()
        ec = json.loads(ec_path.read_text(encoding="utf-8"))
        assert ec["version"] == "external-context-v1"
        assert ec["enrichment_phases"]["phase_4_external_fetch"] == "planned"
        assert ec["metadata"]["completed_sources"] == 0


# ---------------------------------------------------------------------------
# Phase 5: Multi-agent orchestration plan
# ---------------------------------------------------------------------------


def test_build_agent_plan_json_has_five_agents() -> None:
    ap = build_agent_plan_json()
    json.dumps(ap)
    assert ap["status"].startswith("scaffold")
    assert ap["total_agents"] == 5
    roles = {a["role"] for a in ap["agents"]}
    assert roles == {"coordinator", "source_agent", "product_agent", "arch_agent", "review_agent"}


def test_build_agent_plan_json_dag_is_valid() -> None:
    ap = build_agent_plan_json()
    dag = ap["dag"]
    assert ap["total_stages"] == 7
    assert ap["parallel_stages"] >= 2
    stage_ids = {s["stage"] for s in dag}
    assert stage_ids == set(range(1, 8))
    # Every stage (except 1) must depend on an existing stage
    for s in dag:
        for dep in s["depends_on"]:
            assert dep in stage_ids, f"Stage {s['stage']} depends on missing stage {dep}"


def test_build_agent_plan_json_agents_have_artifact_boundaries() -> None:
    ap = build_agent_plan_json()
    for agent in ap["agents"]:
        assert agent["artifact_boundary"], f"{agent['role']} missing artifact_boundary"
        assert agent["inputs"], f"{agent['role']} missing inputs"
        assert agent["outputs"], f"{agent['role']} missing outputs"


def test_build_agent_plan_json_quality_gates_defined() -> None:
    ap = build_agent_plan_json()
    gates = ap["metadata"]["quality_gates"]
    assert len(gates) >= 2
    assert any("citation" in g.lower() or "EvidenceCitation" in g for g in gates)
    assert any("product_perspective" in g for g in gates)


def test_agent_plan_json_written_by_build_book_report() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        build_book_report(
            repo_info={"name": "test/repo"},
            output_dir=tmpdir,
        )
        ap_path = Path(tmpdir) / "agent_plan.json"
        assert ap_path.exists()
        ap = json.loads(ap_path.read_text(encoding="utf-8"))
        assert ap["version"] == "agent-plan-v1"
        assert ap["orchestration_model"] == "DAG (有向无环图)"
