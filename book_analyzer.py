"""
Product-driven book artifact module for structural codebase analysis.

Produces JSON-safe structured artifacts for a product-driven Chinese book
generator. Designed to consume GitRepo module dictionaries and output
deterministic, offline-safe book artifacts.

No external dependencies. No network. No LLM. Pure stdlib.

Output artifacts (in memory):
  book_context.json    – overall book context (repo info, product perspective)
  product_context.json – product-level context (type, goals, capabilities)
  capability_map.json  – capability-to-module mapping
  chapter_01.json..chapter_12.json – 12 structured chapters
  book.json            – complete book assembly
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

# ============================================================
# Default Chinese chapter & section titles (12-chapter book)
# ============================================================

DEFAULT_CHAPTER_TITLES: list[str] = [
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

DEFAULT_SECTION_TITLES: dict[int, list[str]] = {
    1: ["产品要解决的痛点", "目标用户画像", "竞品对比分析", "核心价值主张"],
    2: ["能力全景图", "用户旅程映射", "能力与旅程对齐", "优先级排序方法"],
    3: ["输入适配层设计", "仓库元数据提取", "项目结构自动识别", "输入验证与容错"],
    4: ["模式自动检测机制", "标签对比模式", "提交分块模式", "结构深度分析模式"],
    5: ["模块发现算法", "支配性递归下钻", "关键文件提取策略", "模块间依赖关系"],
    6: ["提示词工程设计", "多维度并行生成", "结果缓存策略", "生成质量控制"],
    7: ["Mermaid 图表渲染", "ECharts 数据可视化", "SVG 离线缓存", "分页与导航设计"],
    8: ["LLM 成本优化", "缓存命中率优化", "增量分析加速", "零依赖离线策略"],
    9: ["大规模仓库适配", "多语言分析支持", "插件化分析管线", "分布式分析设计"],
    10: ["Agent 编排模型", "并行阶段调度", "结果聚合与冲突解决", "质量门禁设计"],
    11: ["插件接口定义", "LLM 提供商适配", "报告模板扩展", "社区贡献指南"],
    12: ["源码分析最佳实践", "技术决策反推产品决策", "重构优先级评估", "持续演进策略"],
}


# ============================================================
# Data-classes (top → bottom)
# ============================================================


@dataclass
class EvidenceCitation:
    """A code-level citation anchoring a claim to source code."""

    file_path: str
    line_range: str = ""  # e.g. "42-58"
    snippet: str = ""  # representative code snippet
    source: str = ""  # git ref or commit hash
    description: str = ""  # human explanation of what this proves

    def to_dict(self) -> dict[str, str]:
        return {
            "file_path": self.file_path,
            "line_range": self.line_range,
            "snippet": self.snippet,
            "source": self.source,
            "description": self.description,
        }


@dataclass
class BookSection:
    """A section within a chapter, with mandatory citations."""

    title: str
    content: str = ""
    citations: list[EvidenceCitation] = field(default_factory=list)
    product_perspective: str = ""  # product-driven commentary
    section_number: str = ""  # e.g. "1.2"

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "content": self.content,
            "citations": [c.to_dict() for c in self.citations],
            "product_perspective": self.product_perspective,
            "section_number": self.section_number,
        }


@dataclass
class BookChapter:
    """A single chapter in the product-driven book."""

    chapter_number: int
    title: str
    sections: list[BookSection] = field(default_factory=list)
    product_context_ref: str = ""  # which product context section applies
    module_refs: list[str] = field(default_factory=list)  # related module names

    def to_dict(self) -> dict[str, Any]:
        return {
            "chapter_number": self.chapter_number,
            "title": self.title,
            "sections": [s.to_dict() for s in self.sections],
            "product_context_ref": self.product_context_ref,
            "module_refs": list(self.module_refs),
        }


@dataclass
class ProductCapability:
    """A product capability mapped to codebase modules."""

    name: str
    description: str = ""
    modules: list[str] = field(default_factory=list)  # module names involved
    priority: str = "medium"  # high / medium / low
    maturity: str = "stable"  # prototype / stable / mature
    key_files: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "modules": list(self.modules),
            "priority": self.priority,
            "maturity": self.maturity,
            "key_files": list(self.key_files),
        }


@dataclass
class ProductContext:
    """Product-level context derived from the codebase analysis."""

    product_type: str = ""  # e.g. "Web Application", "CLI Tool", "Library"
    product_goals: list[str] = field(default_factory=list)
    target_users: list[str] = field(default_factory=list)
    core_differentiators: list[str] = field(default_factory=list)
    capabilities: list[ProductCapability] = field(default_factory=list)
    tech_stack_summary: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "product_type": self.product_type,
            "product_goals": list(self.product_goals),
            "target_users": list(self.target_users),
            "core_differentiators": list(self.core_differentiators),
            "capabilities": [c.to_dict() for c in self.capabilities],
            "tech_stack_summary": dict(self.tech_stack_summary),
        }


@dataclass
class BookContext:
    """Complete book-level context including product perspective."""

    repo_url: str = ""
    repo_name: str = ""
    analysis_mode: str = "structural"
    generated_at: str = ""
    product_context: ProductContext = field(default_factory=ProductContext)
    chapters: list[BookChapter] = field(default_factory=list)
    module_index: dict[str, dict[str, Any]] = field(default_factory=dict)
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "repo_url": self.repo_url,
            "repo_name": self.repo_name,
            "analysis_mode": self.analysis_mode,
            "generated_at": self.generated_at,
            "product_context": self.product_context.to_dict(),
            "chapters": [ch.to_dict() for ch in self.chapters],
            "module_index": dict(self.module_index),
            "meta": dict(self.meta),
        }


# ============================================================
# Mock citation factory (deterministic, offline-safe)
# ============================================================


def _mock_citation(
    module_name: str, file_path: str, description: str = ""
) -> EvidenceCitation:
    """Build a deterministic mock citation for offline testing / scaffolding."""
    return EvidenceCitation(
        file_path=file_path,
        line_range="1-30",
        snippet=f"# [mock] key logic from {module_name}/{file_path}",
        source="HEAD",
        description=description or f"Core implementation in {module_name}",
    )


# ============================================================
# Builder: ProductContext
# ============================================================


def build_product_context(modules: list[dict[str, Any]]) -> ProductContext:
    """Derive a ProductContext from a list of GitRepo module dictionaries."""
    module_names = [m.get("name", "unknown") for m in modules]

    # Infer product type heuristically
    pt = _infer_product_type(module_names)

    capabilities = _build_capabilities_from_modules(modules)

    return ProductContext(
        product_type=pt,
        product_goals=[
            "高效处理 GitHub 仓库的技术分析",
            "生成结构化的中文技术文档",
            "支持多模式分析（演进 / 提交分块 / 深度结构）",
        ],
        target_users=["技术负责人", "代码审查者", "架构师", "开源贡献者"],
        core_differentiators=[
            "离线 HTML 报告，零外部 CDN 依赖",
            "自动检测分析模式（标签 / 提交数）",
            "LLM 辅助深度代码分析，支持 DeepSeek 等提供商",
            "内置 ECharts 图表与 Mermaid 架构图",
        ],
        capabilities=capabilities,
        tech_stack_summary={
            "language": "Python",
            "llm_provider": "DeepSeek (default)",
            "diagrams": "Mermaid + Playwright SVG",
            "charts": "ECharts (inlined)",
            "templates": "Jinja2",
        },
    )


def _infer_product_type(module_names: list[str]) -> str:
    """Simple heuristic to guess product type from module structure."""
    indicators: dict[str, list[str]] = {
        "CLI 工具": ["cli", "main", "argparse", "click", "typer"],
        "Web 应用": ["routes", "views", "templates", "static", "middleware"],
        "库 / SDK": ["api", "client", "sdk", "core", "utils"],
        "数据分析工具": ["analysis", "parser", "pipeline", "report"],
    }
    scores: dict[str, int] = dict.fromkeys(indicators, 0)
    for name in module_names:
        lower = name.lower()
        for ptype, keywords in indicators.items():
            if any(kw in lower for kw in keywords):
                scores[ptype] += 1
    best = max(scores.keys(), key=lambda k: scores[k])
    return best if scores[best] > 0 else "开发者工具"


def _build_capabilities_from_modules(
    modules: list[dict[str, Any]],
) -> list[ProductCapability]:
    """Build ProductCapability list deterministically from module info."""
    capabilities: list[ProductCapability] = []
    module_names = [m.get("name", "") for m in modules]

    cap_defs: list[tuple[str, str, str, str, list[str]]] = [
        (
            "代码仓库管理",
            "克隆、缓存和增量更新 GitHub 仓库",
            "high",
            "stable",
            ["bare repo clone", "blobless fetch", "增量更新", "离线缓存"],
        ),
        (
            "多模式分析",
            "自动检测仓库状态并选择分析策略",
            "high",
            "stable",
            ["标签对比模式", "提交分块模式", "结构深度分析"],
        ),
        (
            "差异分析",
            "版本间代码变更的智能分析与去噪",
            "high",
            "stable",
            ["diff 预处理", "噪声过滤", "依赖变更提取"],
        ),
        (
            "LLM 辅助分析",
            "使用大语言模型生成技术总结与架构图",
            "high",
            "stable",
            ["7 类 LLM 提示词", "DeepSeek 集成", "结果缓存"],
        ),
        (
            "可视化渲染",
            "Mermaid 架构图与 ECharts 图表的离线渲染",
            "medium",
            "stable",
            ["Playwright SVG", "ECharts 内联", "磁盘缓存"],
        ),
        (
            "HTML 报告生成",
            "分页中文技术报告，零外部依赖",
            "high",
            "stable",
            ["Jinja2 模板", "分页支持", "离线可用"],
        ),
        (
            "模块发现",
            "自动识别代码库的模块结构并提取关键文件",
            "medium",
            "stable",
            ["目录分组", "支配性递归下钻", "源文件提取"],
        ),
        (
            "报告库管理",
            "维护所有历史分析报告的索引页面",
            "low",
            "stable",
            ["library.html", "元数据管理", "自动更新"],
        ),
    ]

    for name, desc, priority, maturity, artifacts in cap_defs:
        related = [
            mn
            for mn in module_names
            if any(
                token in mn.lower()
                for token in name.replace(" ", "").lower()
                if len(token) >= 3
            )
        ]
        if not related:
            related = module_names[:2] if module_names else []
        capabilities.append(
            ProductCapability(
                name=name,
                description=desc,
                modules=related,
                priority=priority,
                maturity=maturity,
                key_files=artifacts,
            )
        )

    return capabilities


# ============================================================
# Builder: BookContext (full book assembly)
# ============================================================


def build_book_context(
    repo_url: str = "",
    repo_name: str = "",
    modules: list[dict[str, Any]] | None = None,
    generated_at: str = "",
) -> BookContext:
    """Build a complete BookContext from repo + module data."""
    if modules is None:
        modules = []
    product_context = build_product_context(modules)

    # Build module index for reference
    module_index: dict[str, dict[str, Any]] = {}
    for m in modules:
        module_index[m.get("name", "unknown")] = {
            "file_count": m.get("file_count", 0),
            "total_lines": m.get("total_lines", 0),
            "key_files": m.get("key_files", []),
        }

    # Build 12 chapters
    chapters = _build_all_chapters(modules, product_context)

    return BookContext(
        repo_url=repo_url,
        repo_name=repo_name,
        analysis_mode="structural",
        generated_at=generated_at,
        product_context=product_context,
        chapters=chapters,
        module_index=module_index,
        meta={
            "chapter_count": 12,
            "total_sections": sum(len(ch.sections) for ch in chapters),
            "total_citations": sum(
                sum(len(s.citations) for s in ch.sections) for ch in chapters
            ),
            "module_count": len(modules),
            "version": "book-analyzer-v1",
        },
    )


def _build_all_chapters(
    modules: list[dict[str, Any]], product_context: ProductContext
) -> list[BookChapter]:
    """Build all 12 chapters with Chinese defaults and mock content."""
    chapters: list[BookChapter] = []
    module_names = [m.get("name", "unknown") for m in modules]

    for i, title in enumerate(DEFAULT_CHAPTER_TITLES, 1):
        sections = _build_chapter_sections(
            chapter_num=i,
            chapter_title=title,
            modules=modules,
            product_context=product_context,
        )
        chapters.append(
            BookChapter(
                chapter_number=i,
                title=title,
                sections=sections,
                module_refs=module_names[:5] if module_names else [],
            )
        )

    return chapters


def _build_chapter_sections(
    chapter_num: int,
    chapter_title: str,
    modules: list[dict[str, Any]],
    product_context: ProductContext,
) -> list[BookSection]:
    """Build sections for a single chapter with mandatory citations."""
    section_titles = DEFAULT_SECTION_TITLES.get(chapter_num, ["概述", "详细分析"])
    sections: list[BookSection] = []

    for j, sec_title in enumerate(section_titles, 1):
        section_num = f"{chapter_num}.{j}"
        citations = _generate_deterministic_citations(
            chapter_num, section_num, modules, sec_title
        )
        content = _generate_mock_content(
            chapter_num, section_num, sec_title, modules
        )

        sections.append(
            BookSection(
                title=sec_title,
                content=content,
                citations=citations,
                product_perspective=_product_perspective_for(
                    chapter_num, sec_title
                ),
                section_number=section_num,
            )
        )

    return sections


def _generate_deterministic_citations(
    chapter_num: int,
    section_num: str,
    modules: list[dict[str, Any]],
    _section_title: str,
) -> list[EvidenceCitation]:
    """Generate deterministic mock citations from module data (no LLM)."""
    citations: list[EvidenceCitation] = []
    if not modules:
        return [EvidenceCitation(file_path="N/A", description="无可用模块")]

    # Deterministic: pick modules based on chapter_num to scatter coverage
    start_idx = (chapter_num - 1) % len(modules)
    picked = []
    for offset in range(min(2, len(modules))):
        idx = (start_idx + offset) % len(modules)
        picked.append(modules[idx])

    for mod in picked:
        module_name = mod.get("name", "unknown")
        key_files = mod.get("key_files", [])
        if key_files:
            kf = key_files[chapter_num % len(key_files)]
            file_path = kf.get("path", f"{module_name}/main.py")
            snippet = kf.get("content", "")[:200] or kf.get("imports", "")
        else:
            file_path = f"{module_name}/__init__.py"
            snippet = f"# {module_name} module entry point"

        citations.append(
            EvidenceCitation(
                file_path=file_path,
                line_range=f"{chapter_num * 10}-{chapter_num * 10 + 20}",
                snippet=snippet,
                source="HEAD",
                description=f"第{chapter_num}章引用的 {module_name} 模块代码",
            )
        )

    # Ensure at least one citation per section
    if not citations:
        citations.append(
            EvidenceCitation(
                file_path="README.md",
                line_range="1-10",
                snippet="# Project Overview",
                source="HEAD",
                description="项目入口文档",
            )
        )

    return citations


def _generate_mock_content(
    chapter_num: int,
    _section_num: str,
    section_title: str,
    modules: list[dict[str, Any]],
) -> str:
    """Generate deterministic mock section content (no LLM)."""
    module_names = [m.get("name", "") for m in modules[:3]] if modules else ["core"]
    module_refs = "、".join(module_names) if module_names else "代码库"

    templates: dict[int, str] = {
        1: f"产品定位：分析目标用户群与技术文档生成的痛点。{module_refs} 模块从用户问题出发设计。",
        2: f"能力地图：映射产品能力到用户旅程。{module_refs} 各模块对应不同能力维度。",
        3: f"输入能力：解析仓库 URL、自动 fetch、提取元数据。{module_refs} 实现输入适配层。",
        4: f"模式决策：根据仓库状态自动选择演进/分块/深度分析。{module_refs} 实现智能路由。",
        5: f"源码理解：模块发现、目录下钻、关键文件提取。{module_refs} 提供结构化理解能力。",
        6: f"LLM 生成：提示词工程、并行调用、结果验证。{module_refs} 驱动内容生成管线。",
        7: f"报告生成：Mermaid 图表、ECharts 可视化、SVG 预渲染。{module_refs} 构建可信输出。",
        8: f"成本与速度：LLM 成本优化、缓存策略、增量加速。{module_refs} 保障可用性。",
        9: f"扩展架构：大规模仓库、多语言支持、分布式分析。{module_refs} 面向复杂场景设计。",
        10: f"多 Agent 协作：并行调度、结果聚合、质量门禁。{module_refs} 实现高效协作。",
        11: f"插件化：接口定义、提供商适配、模板扩展。{module_refs} 构建开放生态。",
        12: f"方法论：从源码分析到产品洞察的完整思考框架。{module_refs} 沉淀可复用知识。",
    }

    base = templates.get(
        chapter_num,
        f"本节深入分析 {section_title}。相关模块：{module_refs}。",
    )
    return f"[mock] {base} (第{chapter_num}章, 离线生成, 无 LLM)"


def _product_perspective_for(chapter_num: int, _section_title: str) -> str:
    """Return product-driven perspective commentary for a chapter."""
    perspectives: dict[int, str] = {
        1: "产品定位是整本书的锚点：先回答「为谁解决什么问题」，再展开如何用代码实现。",
        2: "能力地图将产品拆解为用户可感知的功能维度，用户旅程揭示能力之间的时序依赖。",
        3: "输入能力是产品的入口体验——输入容错与自动识别决定用户的第一印象。",
        4: "模式决策体现产品智能：让工具替用户选择最佳分析路径，降低认知负担。",
        5: "源码理解是产品核心能力，模块发现的质量直接决定后续所有分析的深度与准确度。",
        6: "LLM 生成是产品的差异化引擎，提示词质量与并行策略共同决定最终报告的可信度。",
        7: "可信报告是产品交付物：离线可用、图表自包含、分页导航构成一套完整的信息产品。",
        8: "成本与速度是产品可用性的基石——即使功能完美，慢或贵也会让用户离开。",
        9: "扩展架构决定了产品天花板：能否处理 10 万提交的仓库，能否分析多语言项目。",
        10: "多 Agent 协作是对复杂问题的分解策略：分而治之、独立验证、合并输出。",
        11: "插件化是产品的生态杠杆：开放接口让社区贡献分析器、LLM 后端和报告模板。",
        12: "方法论是产品沉淀的可复用知识——从单个项目分析提炼出通用的源码到洞察框架。",
    }
    return perspectives.get(
        chapter_num,
        f"产品视角：第{chapter_num}章的设计决策应服务于终端用户价值。",
    )


# ============================================================
# Artifact builders (return JSON-safe dicts)
# ============================================================


def build_product_context_json(modules: list[dict[str, Any]]) -> dict[str, Any]:
    """Produce product_context.json artifact."""
    return build_product_context(modules).to_dict()


def build_capability_map_json(
    product_context: ProductContext | None = None,
    modules: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Produce capability_map.json artifact.

    Maps each capability to its related modules and key files.
    """
    if product_context is None:
        if modules is None:
            modules = []
        product_context = build_product_context(modules)

    capability_map: dict[str, Any] = {}
    for cap in product_context.capabilities:
        capability_map[cap.name] = {
            "description": cap.description,
            "priority": cap.priority,
            "maturity": cap.maturity,
            "modules": list(cap.modules),
            "key_files": list(cap.key_files),
        }
    return {
        "total_capabilities": len(product_context.capabilities),
        "capabilities": capability_map,
    }


def build_book_json(modules: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Produce book.json artifact — complete book assembly."""
    context = build_book_context(
        repo_url="https://github.com/example/repo",
        repo_name="example-repo",
        modules=modules or [],
        generated_at="2026-01-01T00:00:00Z",
    )
    return context.to_dict()


def build_chapter_json(
    chapter_num: int,
    modules: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """Produce chapter_NN.json artifact for a single chapter (1-indexed, 1..12)."""
    if chapter_num < 1 or chapter_num > 12:
        return None
    if modules is None:
        modules = []

    product_context = build_product_context(modules)
    chapter_title = DEFAULT_CHAPTER_TITLES[chapter_num - 1]
    sections = _build_chapter_sections(
        chapter_num, chapter_title, modules, product_context
    )
    chapter = BookChapter(
        chapter_number=chapter_num,
        title=chapter_title,
        sections=sections,
        module_refs=[m.get("name", "unknown") for m in modules[:5]],
    )
    return chapter.to_dict()


# ============================================================
# Checker / validator functions
# ============================================================


def check_citations(
    chapter: dict[str, Any] | BookChapter,
) -> list[dict[str, str]]:
    """Check a chapter for missing or empty citations. Returns issues."""
    issues: list[dict[str, str]] = []

    if isinstance(chapter, BookChapter):
        chapter_dict = chapter.to_dict()
    else:
        chapter_dict = chapter

    sections = chapter_dict.get("sections", [])
    for s in sections:
        citations = s.get("citations", [])
        if not citations:
            issues.append({
                "section": s.get("section_number", "?"),
                "title": s.get("title", "?"),
                "issue": "missing_citation",
                "detail": "章节缺少代码引用",
            })
        else:
            for c in citations:
                if not c.get("file_path") or c["file_path"] == "N/A":
                    issues.append({
                        "section": s.get("section_number", "?"),
                        "title": s.get("title", "?"),
                        "issue": "empty_file_path",
                        "detail": "引用的文件路径为空",
                    })

    return issues


def check_style(chapter: dict[str, Any] | BookChapter) -> list[dict[str, str]]:
    """Check a chapter for style issues (missing titles, empty content, etc.)."""
    issues: list[dict[str, str]] = []

    if isinstance(chapter, BookChapter):
        chapter_dict = chapter.to_dict()
    else:
        chapter_dict = chapter

    if not chapter_dict.get("title"):
        issues.append({
            "chapter": str(chapter_dict.get("chapter_number", "?")),
            "issue": "missing_chapter_title",
            "detail": "章节缺少标题",
        })

    sections = chapter_dict.get("sections", [])
    for s in sections:
        if not s.get("title"):
            issues.append({
                "section": s.get("section_number", "?"),
                "issue": "missing_section_title",
                "detail": "节缺少标题",
            })
        if not s.get("content"):
            issues.append({
                "section": s.get("section_number", "?"),
                "title": s.get("title", "?"),
                "issue": "empty_content",
                "detail": "节内容为空",
            })
        if not s.get("product_perspective"):
            issues.append({
                "section": s.get("section_number", "?"),
                "title": s.get("title", "?"),
                "issue": "missing_product_perspective",
                "detail": "缺少产品视角分析",
            })

    return issues


# ============================================================
# Convenience: build all artifacts at once
# ============================================================


def build_all_artifacts(
    repo_url: str = "https://github.com/example/repo",
    repo_name: str = "example-repo",
    modules: list[dict[str, Any]] | None = None,
    generated_at: str = "2026-01-01T00:00:00Z",
) -> dict[str, dict[str, Any]]:
    """Produce the complete artifact set as JSON-safe dicts.

    Returns a dict keyed by artifact name:
      "book_context", "product_context", "capability_map",
      "chapter_01".."chapter_12", "book"
    """
    if modules is None:
        modules = []
    product_context = build_product_context(modules)

    artifacts: dict[str, dict[str, Any]] = {
        "product_context": product_context.to_dict(),
        "capability_map": build_capability_map_json(
            product_context, modules
        ),
    }

    book_context = build_book_context(
        repo_url=repo_url,
        repo_name=repo_name,
        modules=modules,
        generated_at=generated_at,
    )
    artifacts["book_context"] = book_context.to_dict()

    # Build individual chapters
    for i in range(1, 13):
        ch = build_chapter_json(i, modules)
        if ch:
            artifacts[f"chapter_{i:02d}"] = ch

    artifacts["book"] = build_book_json(modules)

    # Phase 4/5 scaffolding: external enrichment + multi-agent plan
    repo_info_minimal = {"name": repo_name, "url": repo_url}
    artifacts["external_context"] = build_external_context_json(repo_info_minimal)
    artifacts["agent_plan"] = build_agent_plan_json()

    return artifacts


# ============================================================
# Phase 4: External enrichment context (offline scaffolding)
# ============================================================


def build_external_context_json(
    repo_info: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Produce external_context.json — planned external enrichment sources.

    This artifact declares source types and access patterns for future
    network/API enrichment phases. All content is placeholder/offline-safe;
    no external calls are made.
    """
    if repo_info is None:
        repo_info = {}
    repo_name = repo_info.get("name", "unknown")
    repo_url = repo_info.get("url", "")

    sources: list[dict[str, Any]] = [
        {
            "type": "repo_readme",
            "label": "仓库 README 文档",
            "status": "planned",
            "description": "提取项目自述文件中的产品描述、使用指南与架构说明。",
            "planned_location": f"{repo_url}/blob/main/README.md" if repo_url else "README.md",
            "extraction_method": "git show HEAD:README.md",
            "product_relevance": "产品定位与用户问题（第 1 章）",
        },
        {
            "type": "github_issues",
            "label": "GitHub Issues",
            "status": "planned",
            "description": "分析 Issue 标题与标签，提取用户反馈热点、功能请求与 bug 分布。",
            "planned_location": f"{repo_url}/issues" if repo_url else "GitHub Issues API",
            "extraction_method": "GitHub REST API / GraphQL",
            "product_relevance": "用户旅程与能力地图（第 2 章）",
        },
        {
            "type": "github_prs",
            "label": "GitHub Pull Requests",
            "status": "planned",
            "description": "提取 PR 标题、描述与评审讨论，追溯关键架构决策的演化路径。",
            "planned_location": f"{repo_url}/pulls" if repo_url else "GitHub PRs API",
            "extraction_method": "GitHub REST API / GraphQL",
            "product_relevance": "分析模式决策与架构扩展（第 4、9 章）",
        },
        {
            "type": "github_releases",
            "label": "GitHub Releases",
            "status": "planned",
            "description": "提取版本发布说明，追踪功能迭代节奏与 breaking changes。",
            "planned_location": f"{repo_url}/releases" if repo_url else "GitHub Releases API",
            "extraction_method": "GitHub REST API",
            "product_relevance": "演进与展望（第 12 章）",
        },
        {
            "type": "commit_history",
            "label": "提交历史语义分析",
            "status": "planned",
            "description": "对提交消息进行语义聚类，识别高频变更领域与团队工作节奏。",
            "planned_location": "git log --reverse",
            "extraction_method": "git log + LLM 聚类",
            "product_relevance": "成本与速度设计、方法论（第 8、12 章）",
        },
        {
            "type": "official_docs",
            "label": "官方技术文档",
            "status": "planned",
            "description": "抓取项目官方网站或 Wiki 中的架构文档与 API 参考。",
            "planned_location": "项目官网 / GitHub Wiki",
            "extraction_method": "HTTP fetch + HTML-to-text",
            "product_relevance": "技术栈分析与最佳实践（第 2、11 章）",
        },
    ]

    return {
        "version": "external-context-v1",
        "status": "scaffold — offline placeholder, no enrichment performed",
        "repo": repo_name,
        "enrichment_phases": {
            "phase_4_external_fetch": "planned",
            "phase_5_multi_agent": "planned",
        },
        "sources": sources,
        "metadata": {
            "source_count": len(sources),
            "completed_sources": 0,
            "planned_sources": len(sources),
            "notes": "所有外部数据源均为计划状态，当前仅输出占位结构。"
            " 实际数据抓取将在 Phase 4 中通过 Agent 编排实现。",
        },
    }


# ============================================================
# Phase 5: Multi-agent orchestration plan (offline scaffolding)
# ============================================================


def build_agent_plan_json() -> dict[str, Any]:
    """Produce agent_plan.json — multi-agent book generation orchestration plan.

    Defines agent roles, responsibilities, artifact boundaries, and
    coordination topology. All content is scaffolding/offline-safe.
    """
    agents: list[dict[str, Any]] = [
        {
            "role": "coordinator",
            "name": "Coordinator",
            "description": "总协调 Agent：解析输入参数，管理全局状态，分发子任务，聚合结果。",
            "responsibilities": [
                "接收 repo_url 与 repo_info",
                "触发模块发现与外部上下文收集",
                "调度子 Agent 按 DAG 拓扑执行",
                "校验各阶段输出质量（引用完整性、JSON Schema）",
                "合成最终 book.json 并写入磁盘",
            ],
            "inputs": ["repo_info", "cli_args"],
            "outputs": ["book_manifest.json", "book.json", "quality_report.json"],
            "artifact_boundary": "全局状态持有者，不直接生成内容",
        },
        {
            "role": "source_agent",
            "name": "Source-Agent",
            "description": "源码分析 Agent：深度理解代码库结构与实现细节。",
            "responsibilities": [
                "执行模块发现与支配性递归下钻",
                "提取关键文件内容（前 300 行）",
                "分析模块间依赖关系",
                "生成能力到模块的映射数据",
            ],
            "inputs": ["repo (GitRepo)", "discover_modules()"],
            "outputs": ["product_context.json", "capability_map.json", "module_index"],
            "artifact_boundary": "只读源码，不访问网络",
        },
        {
            "role": "product_agent",
            "name": "Product-Agent",
            "description": "产品分析 Agent：从代码推断产品能力、用户旅程与设计权衡。",
            "responsibilities": [
                "基于模块结构推导产品能力分类",
                "映射技术决策到产品权衡",
                "撰写产品视角注释（product_perspective 字段）",
                "生成前两章内容（产品定位、能力地图）",
            ],
            "inputs": ["product_context.json", "capability_map.json", "external_context.json"],
            "outputs": ["chapter_01.json", "chapter_02.json"],
            "artifact_boundary": "产品层分析，不直接操作源码",
        },
        {
            "role": "arch_agent",
            "name": "Arch-Agent",
            "description": "架构分析 Agent：分析技术架构、实现模式与质量属性。",
            "responsibilities": [
                "分析输入/分析/生成/报告的管线架构",
                "评估性能、成本、扩展性等质量属性",
                "生成第 3-9 章（输入能力到扩展架构）",
                "引用具体源码文件作为证据",
            ],
            "inputs": ["module_index", "source_agent 输出", "external_context.json"],
            "outputs": [f"chapter_{i:02d}.json" for i in range(3, 10)],
            "artifact_boundary": "技术架构层分析",
        },
        {
            "role": "review_agent",
            "name": "Review-Agent",
            "description": "审校 Agent：验证内容完整性、引用准确性与风格一致性。",
            "responsibilities": [
                "执行 check_citations 验证每节引用",
                "执行 check_style 验证标题、内容、产品视角",
                "检查跨章节术语一致性",
                "生成第 10-12 章（Agent 协作、插件化、方法论）",
                "产出 quality_report.json",
            ],
            "inputs": ["全部 12 章 JSON", "style_rules", "citation_rules"],
            "outputs": ["chapter_10.json", "chapter_11.json", "chapter_12.json", "quality_report.json"],
            "artifact_boundary": "审校与收尾，可触发重新生成",
        },
    ]

    dag: list[dict[str, Any]] = [
        {
            "stage": 1,
            "label": "环境准备",
            "agent": "coordinator",
            "actions": ["解析 CLI 参数", "克隆/更新仓库", "创建输出目录"],
            "parallel": False,
            "depends_on": [],
        },
        {
            "stage": 2,
            "label": "并行数据采集",
            "agent": "coordinator",
            "actions": ["调度 Source-Agent 执行模块发现", "收集 repo_info 元数据"],
            "parallel": True,
            "depends_on": [1],
        },
        {
            "stage": 3,
            "label": "外部上下文收集",
            "agent": "source_agent",
            "actions": ["抓取 README", "获取 Issues/PRs/Releases 摘要"],
            "parallel": True,
            "depends_on": [2],
        },
        {
            "stage": 4,
            "label": "产品层分析",
            "agent": "product_agent",
            "actions": ["构建产品能力地图", "撰写第 1-2 章"],
            "parallel": False,
            "depends_on": [3],
        },
        {
            "stage": 5,
            "label": "架构层深度分析",
            "agent": "arch_agent",
            "actions": ["分析输入→报告完整管线", "撰写第 3-9 章"],
            "parallel": False,
            "depends_on": [4],
        },
        {
            "stage": 6,
            "label": "审校与收尾",
            "agent": "review_agent",
            "actions": ["执行质量检查", "撰写第 10-12 章", "合成 book.json"],
            "parallel": False,
            "depends_on": [5],
        },
        {
            "stage": 7,
            "label": "交付",
            "agent": "coordinator",
            "actions": ["写入所有 JSON 文件", "生成 book_manifest.json", "输出报告路径"],
            "parallel": False,
            "depends_on": [6],
        },
    ]

    return {
        "version": "agent-plan-v1",
        "status": "scaffold — multi-agent orchestration plan, offline placeholder",
        "orchestration_model": "DAG (有向无环图)",
        "total_agents": len(agents),
        "total_stages": len(dag),
        "parallel_stages": sum(1 for s in dag if s["parallel"]),
        "agents": agents,
        "dag": dag,
        "metadata": {
            "notes": "当前为离线占位结构。实际多 Agent 编排将通过 "
            "Agent SDK / 并行子进程 / 消息队列实现。",
            "quality_gates": [
                "每章至少一个 EvidenceCitation",
                "每节必须有 product_perspective",
                "JSON Schema 校验通过",
                "跨章节术语一致性检查",
            ],
        },
    }


def build_book_report(
    repo: Any = None,
    repo_info: dict[str, Any] | None = None,
    llm_parser: Any = None,
    use_llm: bool = False,
    output_dir: str = "",
    section: str | None = None,
    workers: int = 1,
    no_cache: bool = False,
    cache_dir: str = "",
    **kwargs: Any,
) -> dict[str, Any]:
    """Write JSON book artifacts to disk. Called from main.py --book mode.

    Accepts the full CLI parameter set for compatibility, but operates
    entirely offline — no LLM calls, no network. Uses repo.discover_modules()
    when a repo object is provided; falls back to empty modules otherwise.
    """
    now_utc = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")

    # Resolve repo info
    if repo_info is None:
        repo_info = {}
    repo_url = repo_info.get("url", "")
    repo_name = repo_info.get("name", repo_url.split("/")[-1] if repo_url else "unknown")

    # Discover modules from repo (safely)
    modules: list[dict[str, Any]] = []
    if repo is not None and hasattr(repo, "discover_modules"):
        try:
            modules = repo.discover_modules()
        except (OSError, RuntimeError):
            modules = []

    # Build all artifacts in memory
    artifacts = build_all_artifacts(
        repo_url=repo_url,
        repo_name=repo_name,
        modules=modules,
        generated_at=now_utc,
    )

    # Write JSON files to output_dir
    artifact_names = {
        "book_context": "book_context.json",
        "product_context": "product_context.json",
        "capability_map": "capability_map.json",
        "book": "book.json",
        "external_context": "external_context.json",
        "agent_plan": "agent_plan.json",
    }
    for i in range(1, 13):
        artifact_names[f"chapter_{i:02d}"] = f"chapter_{i:02d}.json"

    written: list[str] = []
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        for key, filename in artifact_names.items():
            data = artifacts.get(key)
            if data is None:
                continue
            filepath = os.path.join(output_dir, filename)
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            written.append(filename)

    # Write book_manifest.json
    manifest: dict[str, Any] = {
        "mode": "book",
        "status": "complete",
        "repo": repo_info,
        "analysis_time": now_utc,
        "section_filter": section,
        "output_dir": output_dir,
        "artifact_count": len(written),
        "module_count": len(modules),
        "offline_mode": not use_llm,
    }
    if output_dir:
        manifest_path = os.path.join(output_dir, "book_manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
        written.append("book_manifest.json")

    return {
        "mode": "book",
        "status": "complete",
        "output_dir": output_dir,
        "artifacts": written,
        "repo": repo_info,
        "section_filter": section,
    }
