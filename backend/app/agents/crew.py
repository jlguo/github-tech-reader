from __future__ import annotations

import os
import re
import asyncio
import time
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

_BOOK_CSS = (
    "body{background:#f5f0e8;color:#2c1a0e;"
    "font-family:'Source Serif 4',Georgia,serif;max-width:800px;margin:0 auto;"
    "padding:2rem;line-height:1.8}h1,h2{font-family:'Playfair Display',serif;"
    "color:#5c3d1e}pre{background:#ede5d4;padding:1rem;border-radius:8px}"
    "code{font-family:monospace}a{color:#c17f3a}"
    ".toc{background:#fffdf7;padding:1.5rem 1.5rem 1.5rem 2.2rem;border-radius:12px;margin:2rem 0}"
    ".toc ul,.toc ol{list-style:none;padding-left:1.4em;margin:0;border-left:1px solid #e0d8c8}"
    ".toc li{padding-left:.6em;position:relative}"
    ".toc li:last-child>.toc-sub{border-left:none}"
    ".toc a{display:inline-block;padding:.15rem 0;text-decoration:none;color:#c17f3a;transition:color .15s}"
    ".toc a:hover{color:#8b5a2b}"
    ".toc>.toc-item>a{font-weight:600;color:#5c3d1e;font-size:1.05em}"
    ".footer{text-align:center;color:#7a6248;margin-top:3rem;font-size:.85em}"
)

os.environ.setdefault("OPENAI_API_KEY", settings.llm_api_key)
os.environ.setdefault("OPENAI_BASE_URL", settings.llm_base_url_normalized)

try:
    from crewai import Agent, Task, Crew, Process
    _crewai_available = True
except ImportError:
    _crewai_available = False

llm = f"openai/{settings.llm_model}"

_LANG_INSTRUCTION = (
    "IMPORTANT: All output MUST be in Simplified Chinese (zh-CN). "
    "Chapter titles, descriptions, content — everything in Chinese. "
    "Only keep code identifiers, class names, and function names in their original language."
) if settings.book_language == "zh" else ""

_llm_lock = asyncio.Lock()
_llm_last_request: float = 0
_chapter_sem: asyncio.Semaphore | None = None

_RATE_LIMIT_CODES = {429}
_RATE_LIMIT_KEYWORDS = ("rate_limit", "rate limit", "too many requests", "quota exceeded")

# Truncation limits for repository content
README_TRUNCATION = 6000  # Max chars to include from the README
FILE_CONTENT_TRUNCATION = 3000  # Max chars per file in the repository snapshot
TOP_FILES_LIMIT = 60  # Max files included in the repository snapshot
CHAPTER_TEXT_TRUNCATION = 30000  # Max chars for chapter text sent to the editor


def _get_chapter_sem() -> asyncio.Semaphore:
    global _chapter_sem
    if _chapter_sem is None:
        _chapter_sem = asyncio.Semaphore(settings.llm_max_parallel_chapters)
    return _chapter_sem


async def _acquire_request_slot():
    global _llm_last_request
    async with _llm_lock:
        now = time.monotonic()
        elapsed = now - _llm_last_request
        if elapsed < settings.llm_request_delay_seconds:
            await asyncio.sleep(settings.llm_request_delay_seconds - elapsed)
        _llm_last_request = time.monotonic()


def _is_rate_limit_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    if any(kw in msg for kw in _RATE_LIMIT_KEYWORDS):
        return True
    code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    return code in _RATE_LIMIT_CODES


async def _kickoff_with_retry(crew: Crew) -> str:
    last_err = None
    for attempt in range(settings.llm_max_retries):
        try:
            await _acquire_request_slot()
            return str(await crew.kickoff_async())
        except Exception as e:
            last_err = e
            if _is_rate_limit_error(e):
                if attempt == 0:
                    await asyncio.sleep(settings.llm_rate_limit_wait_seconds)
                    continue
                raise
            if attempt < settings.llm_max_retries - 1:
                delay = 2 ** attempt
                await asyncio.sleep(delay)
    raise last_err


def _ensure_crewai():
    if not _crewai_available:
        raise RuntimeError("crewai not installed")


def _make_agent(role: str, goal: str, backstory: str) -> Agent:
    _ensure_crewai()
    return Agent(
        role=role, goal=goal, backstory=backstory,
        verbose=True, allow_delegation=False, llm=llm,
    )


def _count_words(text: str) -> int:
    return len(re.findall(r"\w+", text))


def _determine_chapter_count(repo_info: dict, files: dict[str, str]) -> int:
    file_count = len(files)
    if file_count < 30: return 4
    elif file_count < 80: return 8
    elif file_count < 200: return 12
    return min(settings.book_max_chapters, 16)


def _build_textual_snapshot(readme, files, issues) -> str:
    parts = []
    if readme:
        parts.append(f"## README\n\n{readme[:README_TRUNCATION]}")
    parts.append("\n## Repository Files\n")
    for path, content in sorted(files.items())[:TOP_FILES_LIMIT]:
        parts.append(f"### {path}\n```\n{content[:FILE_CONTENT_TRUNCATION]}\n```\n")
    if issues:
        parts.append("\n## Top Issues\n")
        for i in issues[:5]:
            parts.append(f"### {i['title']} ({i['state']})\n{i['body']}\n")
    return "\n".join(parts)


async def _run_planning_crew(repo_name, repo_description, chapter_count, snapshot) -> list[dict]:
    _ensure_crewai()
    planner = _make_agent(
        role="Book Planner",
        goal=f"Create a detailed outline for a {chapter_count}-chapter technical book about '{repo_name}'. "
             f"{_LANG_INSTRUCTION}",
        backstory="You are an experienced technical book editor who excels at structuring "
                  "complex software topics into logical, progressive chapters.",
    )
    task = Task(
        description=(
            f"Repository: {repo_name}\nDescription: {repo_description}\n"
            f"Target: {chapter_count} chapters, {settings.book_chapter_min_words}-"
            f"{settings.book_chapter_max_words} words each.\n\n"
            f"Repository content:\n{snapshot[:15000]}\n\n"
            f"Create a book outline. {_LANG_INSTRUCTION} "
            "Return ONLY a JSON array of chapter objects. "
            "Each object: number (int), title (str), focus (str), files_to_analyze (str[]). "
            "Return ONLY the JSON array, no other text."
        ),
        expected_output=f"A JSON array of {chapter_count} chapter objects.",
        agent=planner,
    )
    crew = Crew(agents=[planner], tasks=[task], process=Process.sequential, verbose=True)
    result = await _kickoff_with_retry(crew)
    try:
        json_match = re.search(r"\[.*\]", result, re.DOTALL)
        if json_match:
            import json
            return json.loads(json_match.group())
        return _fallback_outline(chapter_count, repo_name)
    except Exception:
        return _fallback_outline(chapter_count, repo_name)


def _fallback_outline(chapter_count, repo_name) -> list[dict]:
    sections = [
        "项目概览与架构", "核心概念与设计哲学",
        "代码漫游：关键模块", "数据模型与状态管理",
        "API 设计与通信", "测试与质量保障",
        "构建系统与 DevOps", "性能与优化",
        "安全性考量", "错误处理与韧性",
        "配置与可扩展性", "社区与贡献指南",
        "高级模式与内部原理", "真实场景案例",
        "经验教训与最佳实践", "未来路线图与演进",
    ]
    return [{"number": i, "title": f"Chapter {i}: {sections[(i-1)%16]}",
             "focus": sections[(i-1)%16].lower(), "files_to_analyze": []}
            for i in range(1, chapter_count + 1)]


async def _run_chapter_research_writer(repo_name, chapter, snapshot) -> dict:
    _ensure_crewai()
    researcher = _make_agent(
        role="Chapter Researcher",
        goal=f"Research Chapter {chapter['number']}: '{chapter['title']}' of the {repo_name} book. "
             f"{_LANG_INSTRUCTION}",
        backstory="Meticulous technical researcher who extracts the most valuable insights "
                  "from source code and documentation.",
    )
    writer = _make_agent(
        role="Chapter Writer",
        goal=f"Write Chapter {chapter['number']}: '{chapter['title']}' as a polished "
             f"educational chapter ({settings.book_chapter_min_words}-"
             f"{settings.book_chapter_max_words} words) in Markdown. {_LANG_INSTRUCTION}",
        backstory="Skilled technical book author who transforms raw research into "
                  "compelling, educational prose for intermediate developers.",
    )
    research_task = Task(
        description=(
            f"Chapter {chapter['number']}: {chapter['title']}\nFocus: {chapter['focus']}\n"
            f"Key files: {chapter.get('files_to_analyze', [])}\n\n"
            f"Repository content:\n{snapshot[:12000]}\n\n"
            f"Provide structured research notes in Chinese: key concepts, architecture decisions, "
            "code patterns with references, edge cases, educational value."
        ),
        expected_output="Structured research notes with code references.",
        agent=researcher,
    )
    writing_task = Task(
        description=(
            f"Write Chapter {chapter['number']}: '{chapter['title']}' "
            f"({settings.book_chapter_min_words}-{settings.book_chapter_max_words} words). "
            f"{_LANG_INSTRUCTION} "
            "Use clear section headers (##), include code snippets, explain WHY not just WHAT, "
            "add practical examples, end with summary and further reading."
        ),
        expected_output="A complete book chapter in Markdown.",
        agent=writer,
    )
    crew = Crew(agents=[researcher, writer], tasks=[research_task, writing_task],
                process=Process.sequential, verbose=True)
    result = await _kickoff_with_retry(crew)
    return {"number": chapter["number"], "title": chapter["title"],
            "content": result, "word_count": _count_words(result)}


async def _run_chapters_parallel(repo_name, outline, snapshot) -> list[dict]:
    sem = _get_chapter_sem()

    async def _chapter_with_limit(ch):
        async with sem:
            return await _run_chapter_research_writer(repo_name, ch, snapshot)

    tasks = [_chapter_with_limit(ch) for ch in outline]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    chapters = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            chapters.append({"number": outline[i]["number"], "title": outline[i]["title"],
                            "content": f"Chapter generation failed: {result}", "word_count": 0})
        else:
            chapters.append(result)
    chapters.sort(key=lambda c: c["number"])
    return chapters


async def _run_review_crew(chapters, repo_name) -> list[dict]:
    _ensure_crewai()
    reviewer = _make_agent(
        role="Technical Reviewer",
        goal=f"Review all book chapters for technical accuracy, clarity, completeness, and consistency. "
             f"{_LANG_INSTRUCTION}",
        backstory="Senior engineer and editor who ensures technical books are accurate, "
                  "well-structured, and valuable.",
    )
    chapters_text = "\n\n".join(
        f"### Chapter {ch['number']}: {ch['title']}\n\n{ch['content'][:FILE_CONTENT_TRUNCATION]}"
        for ch in chapters
    )
    task = Task(
        description=(
            f"Review the following chapters for '{repo_name}'.\n\n{chapters_text[:20000]}\n\n"
            f"For each chapter: PASS or NEEDS_FIX, list issues, list suggestions. "
            f"{_LANG_INSTRUCTION}"
        ),
        expected_output="Per-chapter review with PASS/NEEDS_FIX verdicts.",
        agent=reviewer,
    )
    crew = Crew(agents=[reviewer], tasks=[task], process=Process.sequential, verbose=True)
    await _kickoff_with_retry(crew)
    return chapters


async def _run_editor_crew(chapters, repo_name) -> str:
    _ensure_crewai()
    editor = _make_agent(
        role="Book Editor",
        goal=f"Merge all chapters into a polished, publication-ready HTML book for '{repo_name}'. "
             f"{_LANG_INSTRUCTION}",
        backstory="Professional book editor who takes raw chapters and turns them "
                  "into a cohesive, beautifully formatted book.",
    )
    chapters_text = "\n\n".join(
        f"CHAPTER_{ch['number']}_MARKER\n# Chapter {ch['number']}: {ch['title']}\n\n{ch['content']}"
        for ch in chapters
    )
    task = Task(
        description=(
            f"Convert the following chapters into a complete HTML book for '{repo_name}'.\n\n"
            f"{chapters_text[:CHAPTER_TEXT_TRUNCATION]}\n\n"
            f"Produce a single HTML document. {_LANG_INSTRUCTION} "
            "The document should have: title, table of contents, "
            "each chapter as <section id=\"chapter-N\"> (where N is the chapter number), "
            "code in <pre><code>, footer with date.\n\n"
            "Table of contents format: use a nested <ul class=\"toc\"> tree. "
            "Each chapter is a <li class=\"toc-item\"> with an <a href=\"#chapter-N\"> link. "
            "Sections within a chapter are nested <ul class=\"toc-sub\"> lists with "
            "<li><a> links to heading anchors. "
            "Sub-sections nest further inside their parent <li>. "
            "Example structure:\n"
            "<ul class=\"toc\">\n"
            "  <li class=\"toc-item\"><a href=\"#chapter-1\">Chapter 1: Title</a>\n"
            "    <ul class=\"toc-sub\">\n"
            "      <li><a href=\"#s1-1\">Section 1.1</a>\n"
            "        <ul class=\"toc-sub\"><li><a href=\"#s1-1-1\">Sub 1.1.1</a></li></ul>\n"
            "      </li>\n"
            "    </ul>\n"
            "  </li>\n"
            "</ul>\n\n"
            f"Use this CSS: {_BOOK_CSS}\n"
            "Return ONLY the complete HTML document."
        ),
        expected_output="A complete, self-contained HTML book document.",
        agent=editor,
    )
    crew = Crew(agents=[editor], tasks=[task], process=Process.sequential, verbose=True)
    result = await _kickoff_with_retry(crew)
    html_match = re.search(r"<!DOCTYPE html>.*?</html>", result, re.DOTALL | re.IGNORECASE)
    if html_match: return html_match.group()
    html_match = re.search(r"<html.*?</html>", result, re.DOTALL | re.IGNORECASE)
    if html_match: return "<!DOCTYPE html>\n" + html_match.group()
    return result


async def _run_cover_crew(repo_name: str, repo_description: str, outline: list[dict], repo_owner: str, review_feedback: str = "") -> str:
    _ensure_crewai()
    designer = _make_agent(
        role="Book Cover Designer",
        goal=f"Design a beautiful, professional book cover for '{repo_name}' that "
             f"captures the essence of the project and entices readers. {_LANG_INSTRUCTION}",
        backstory="You are an award-winning book cover designer specializing in technical "
                  "books. Your covers combine elegant typography, harmonious color palettes, "
                  "and subtle visual elements that hint at the book's content.",
    )
    chapters_list = "\n".join(
        f"Chapter {ch['number']}: {ch['title']}" for ch in outline[:6]
    )
    desc = (
        f"Design a cover page for the book '{repo_name}'.\n\n"
        f"Description: {repo_description}\n\n"
        f"Chapters:\n{chapters_list}\n\n"
        f"{_LANG_INSTRUCTION}\n\n"
    )
    if review_feedback:
        desc += f"Previous attempt had these issues:\n{review_feedback}\n\nFix them in this revision.\n\n"
    desc += (
        "Create an HTML cover page that looks like a real book cover. Requirements:\n"
        "- Full viewport height, centered content\n"
        "- Elegant typography using 'Playfair Display' for title, 'Source Serif 4' for subtitle\n"
        "- Title prominently displayed\n"
        "- A tagline derived from the project description\n"
        f"- Author: {repo_owner}\n"
        "- Subtle decorative elements (lines, geometric shapes, or dots)\n"
        "- Use this color palette: background #f5f0e8, text #2c1a0e, accent #c17f3a, dark #5c3d1e\n"
        "- The cover should feel like a premium technical book\n"
        "- Add a subtle background pattern or texture effect\n\n"
        "Wrap the cover HTML in `<!--COVER_START-->` and `<!--COVER_END-->` markers. "
        "Output: `<!--COVER_START-->\n<div>...cover HTML...</div>\n<!--COVER_END-->`"
    )
    task = Task(
        description=desc,
        expected_output="A beautiful HTML cover page for the book.",
        agent=designer,
    )
    crew = Crew(agents=[designer], tasks=[task], process=Process.sequential, verbose=True)
    result = await _kickoff_with_retry(crew)
    cover_match = re.search(r"<!--COVER_START-->\s*(.*?)\s*<!--COVER_END-->", result, re.DOTALL)
    if cover_match:
        extracted = cover_match.group(1).strip()
        has_viewport = "100vh" in extracted or "viewport" in extracted.lower()
        has_font = "Playfair Display" in extracted
        has_color = any(c in extracted for c in ("#f5f0e8", "#c17f3a", "#5c3d1e"))
        if has_viewport and has_font and has_color:
            return extracted
        logger.warning("Cover validation failed: viewport=%s font=%s color=%s", has_viewport, has_font, has_color)
        return ""
    div_match = re.search(r"<div[^>]*>.*?</div>", result, re.DOTALL | re.IGNORECASE)
    if div_match:
        return div_match.group()
    return result


def _prepend_cover(html: str, cover: str) -> str:
    body_match = re.search(r"<body[^>]*>", html, re.IGNORECASE)
    if body_match:
        insertion_point = body_match.end()
        return html[:insertion_point] + "\n" + cover + "\n" + html[insertion_point:]
    return cover + html


async def generate_book_plan(
    content_title: str,
    content_description: str,
    chapter_count: int,
    snapshot: str,
) -> list[dict]:
    """Generate a book outline from any text content (not just GitHub repos).

    This is a content-agnostic version of the planning step — it takes
    pre-built snapshot text and returns a chapter outline. Useful for
    YouTube transcripts, uploaded documents, or any text source.
    """
    _ensure_crewai()
    return await _run_planning_crew(
        content_title, content_description, chapter_count, snapshot
    )


async def _run_cover_review_crew(repo_name: str, cover_html: str) -> str:
    """Review cover HTML quality. Returns empty string on PASS, review feedback on FAIL."""
    _ensure_crewai()
    reviewer = _make_agent(
        role="Cover Reviewer",
        goal=f"Review the book cover HTML for '{repo_name}' for quality and completeness. {_LANG_INSTRUCTION}",
        backstory="You are a quality assurance specialist who reviews book covers "
                  "for design issues, missing elements, and layout problems.",
    )
    task = Task(
        description=(
            f"Review this cover HTML for quality issues:\n\n{cover_html}\n\n"
            "Check ALL of these requirements:\n"
            "1. Full viewport height (100vh or similar)\n"
            "2. Uses 'Playfair Display' font for title\n"
            "3. Uses color palette: #f5f0e8, #c17f3a, #5c3d1e\n"
            "4. Has visible title text\n"
            "5. Has decorative elements (lines, shapes, patterns)\n"
            "6. Feels like a premium technical book cover\n\n"
            "Return ONLY one word: PASS if all checks pass, or FAIL followed by a brief reason why."
        ),
        expected_output="PASS or FAIL with reason.",
        agent=reviewer,
    )
    crew = Crew(agents=[reviewer], tasks=[task], process=Process.sequential, verbose=True)
    result = await _kickoff_with_retry(crew)
    if "PASS" in result.upper():
        return ""
    return result


async def generate_book_cover(repo_id, repo_name, repo_description, readme_content, status_updater) -> dict:
    _ensure_crewai()

    await status_updater("fetching")
    owner = repo_name.split("/")[0] if "/" in repo_name else ""
    from app.services.github import fetch_key_files, fetch_top_issues
    files = await fetch_key_files(repo_name)
    issues = await fetch_top_issues(repo_name)
    repo_info = {"repo_name": repo_name, "file_count": len(files)}
    chapter_count = _determine_chapter_count(repo_info, files)
    snapshot = _build_textual_snapshot(readme_content, files, issues)

    await status_updater("planning", total_chapters=chapter_count, phase="planning")
    outline = await _run_planning_crew(repo_name, repo_description, chapter_count, snapshot)

    await status_updater("cover", phase="cover")
    cover_html = await _run_cover_crew(repo_name, repo_description, outline, owner)

    if cover_html:
        review_feedback = await _run_cover_review_crew(repo_name, cover_html)
        if review_feedback:
            logger.info("Cover review found issues: %s", review_feedback[:100])
            cover_html = await _run_cover_crew(repo_name, repo_description, outline, owner, review_feedback)

    cover_image_path = _render_png_cover(repo_name, repo_description, owner, repo_id)

    return {"outline": outline, "cover_html": cover_html, "snapshot": snapshot,
            "chapter_count": chapter_count, "repo_name": repo_name,
            "cover_image_path": cover_image_path}


def _render_png_cover(repo_name: str, repo_description: str, owner: str, repo_id: str) -> str | None:
    """Render a PNG cover from template, save to data/covers/{repo_id}.png."""
    from app.services.cover_renderer import render_cover
    from pathlib import Path
    from app.core.config import settings

    data_dir = settings.data_dir or str(Path(__file__).parent.parent.parent / "data")
    covers_dir = Path(data_dir) / "covers"
    covers_dir.mkdir(parents=True, exist_ok=True)
    out_path = str(covers_dir / f"{repo_id}.png")

    tagline = (repo_description or "")[:90].strip()
    if not tagline:
        tagline = "A technical book from GitHub"

    lang = ""
    stars = ""

    try:
        render_cover("github", {
            "title": repo_name.split("/")[-1] if "/" in repo_name else repo_name,
            "tagline": tagline,
            "author": owner,
            "language": "",
            "stars": "",
        }, out_path)
        return out_path
    except Exception as exc:
        logger.warning("Cover PNG rendering failed: %s", exc)
        return None


async def generate_book_content(repo_name: str, outline: list[dict], snapshot: str,
                                 status_updater) -> dict:
    _ensure_crewai()

    await status_updater("writing", outline=outline, phase="writing")
    chapters = await _run_chapters_parallel(repo_name, outline, snapshot)

    await status_updater("reviewing", completed_chapters=len(chapters), phase="reviewing")
    chapters = await _run_review_crew(chapters, repo_name)

    await status_updater("publishing", phase="publishing")
    html = await _run_editor_crew(chapters, repo_name)

    return {"chapters": chapters, "html": html}
