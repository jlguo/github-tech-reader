from __future__ import annotations

import os
import re
import math
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
_planning_llm = f"openai/{settings.llm_planning_model}" if settings.llm_planning_model else llm
_review_llm = f"openai/{settings.llm_review_model}" if settings.llm_review_model else llm

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


def _make_agent(role: str, goal: str, backstory: str, llm_override: str | None = None) -> Agent:
    _ensure_crewai()
    return Agent(
        role=role, goal=goal, backstory=backstory,
        verbose=True, allow_delegation=False, llm=llm_override or llm,
    )


def _count_words(text: str) -> int:
    return len(re.findall(r"\w+", text))


def _clamp(value: int, lo: int, hi: int) -> int:
    return max(lo, min(value, hi))


def _plan_book_dimensions(scope: dict) -> dict:
    est_loc = scope.get("est_loc", 0)
    code_files = scope.get("code_files", 0)
    dir_count = scope.get("dir_count", 0)
    # Tuned sizing curve: LOC dominates (small repos stay near the floor, no
    # padding), file/dir counts add modular breadth. Avoids a log term that over-inflated tiny repos.
    raw_chapters = 2 + est_loc / 4000 + dir_count * 0.25 + code_files * 0.04
    chapter_count = _clamp(round(raw_chapters), settings.book_min_chapters, settings.book_max_chapters)
    approx_loc_per_chapter = est_loc / max(chapter_count, 1)
    target = _clamp(int(approx_loc_per_chapter * 6),
                    settings.book_chapter_min_words, settings.book_chapter_max_words)
    max_files = _clamp(int(code_files * 0.8), 30, 200)
    return {"chapter_count": chapter_count,
            "target_words_per_chapter": target,
            "max_files": max_files}


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


async def _run_planning_crew(repo_name, repo_description, chapter_count, snapshot,
                             target_words_per_chapter: int = 2000) -> list[dict]:
    _ensure_crewai()
    planner = _make_agent(
        role="Book Planner",
        goal=f"Create a detailed outline for a {chapter_count}-chapter technical book about '{repo_name}'. "
             f"{_LANG_INSTRUCTION}",
        backstory="You are an experienced technical book editor who excels at structuring "
                  "complex software topics into logical, progressive chapters.",
        llm_override=_planning_llm,
    )
    task = Task(
        description=(
            f"Repository: {repo_name}\nDescription: {repo_description}\n"
            f"Target: {chapter_count} chapters, each chapter targets ~{target_words_per_chapter} words.\n\n"
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


def _build_chapter_context(chapter: dict, files: dict[str, str] | None, per_file_cap: int = 12000) -> str:
    """Build a focused code-context string for a single chapter.

    Matches the chapter's files_to_analyze against the available files dict.
    Falls back to a generic sampling of the first files when nothing matches.
    Returns '' when there are no files at all (transcript books).
    """
    if not files:
        return ""
    paths = chapter.get("files_to_analyze", [])
    matched: dict[str, str] = {}
    if paths:
        for requested in paths:
            matched_path = None
            # exact match
            if requested in files:
                matched_path = requested
            else:
                # fuzzy: files key ends with requested path, or basename equality
                for key in files:
                    if key.endswith(requested) or key.split("/")[-1] == requested.split("/")[-1]:
                        matched_path = key
                        break
            if matched_path:
                matched[matched_path] = files[matched_path][:per_file_cap]
        logger.info("_build_chapter_context: matched %d/%d requested files for chapter %s",
                     len(matched), len(paths), chapter.get("number", "?"))
    if not matched:
        # fall back to first ~8 files
        for key in list(files.keys())[:8]:
            matched[key] = files[key][:per_file_cap]
    parts = []
    for key, content in matched.items():
        parts.append(f"### {key}\n```\n{content}\n```\n")
    return "\n".join(parts)


_FAITH_INSTRUCTION = (
    "Ground EVERY technical claim in the provided source files below. "
    "The code is the source of truth. If the code does not support a statement, do NOT make it. "
    "Reference real file paths, class names, and function names that appear in the provided code. "
    "Do not invent APIs, parameters, or behavior."
)


async def _run_chapter_research_writer(repo_name, chapter, snapshot, files: dict[str, str] | None = None,
                                        target_words_per_chapter: int | None = None) -> dict:
    _ensure_crewai()
    target_wc = target_words_per_chapter or settings.book_chapter_min_words
    chapter_code = _build_chapter_context(chapter, files)
    chapter_code_section = chapter_code if chapter_code else snapshot[:12000]

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
             f"educational chapter targeting ~{target_wc} words in Markdown. {_LANG_INSTRUCTION}",
        backstory="Skilled technical book author who transforms raw research into "
                  "compelling, educational prose for intermediate developers.",
    )
    research_task = Task(
        description=(
            f"Chapter {chapter['number']}: {chapter['title']}\nFocus: {chapter['focus']}\n"
            f"Key files: {chapter.get('files_to_analyze', [])}\n\n"
            f"## Project Overview\n{snapshot[:3000]}\n\n"
            f"## Source Code Context\n{chapter_code_section}\n\n"
            f"{_FAITH_INSTRUCTION}\n\n"
            "Provide structured research notes in Chinese: key concepts, architecture decisions, "
            "code patterns with references, edge cases, educational value."
        ),
        expected_output="Structured research notes with code references.",
        agent=researcher,
    )
    writing_task = Task(
        description=(
            f"Write Chapter {chapter['number']}: '{chapter['title']}' "
            f"targeting ~{target_wc} words. "
            f"{_LANG_INSTRUCTION} "
            f"{_FAITH_INSTRUCTION}\n\n"
            f"## Source Code Context\n{chapter_code_section}\n\n"
            "Use clear section headers (##), include code snippets, explain WHY not just WHAT, "
            "add practical examples, end with summary and further reading. "
            "Do NOT include the chapter title or a top-level (#) heading — start directly "
            "with the body; the chapter title is added separately."
        ),
        expected_output="A complete book chapter in Markdown.",
        agent=writer,
    )
    crew = Crew(agents=[researcher, writer], tasks=[research_task, writing_task],
                process=Process.sequential, verbose=True)
    result = await _kickoff_with_retry(crew)
    return {"number": chapter["number"], "title": chapter["title"],
            "content": result, "word_count": _count_words(result)}


async def _run_chapters_parallel(repo_name, outline, snapshot,
                                 files: dict[str, str] | None = None,
                                 target_words_per_chapter: int | None = None) -> list[dict]:
    sem = _get_chapter_sem()

    async def _chapter_with_limit(ch):
        async with sem:
            result = await _run_chapter_research_writer(repo_name, ch, snapshot, files, target_words_per_chapter)
            result["files_to_analyze"] = ch.get("files_to_analyze", [])
            result["_target_wc"] = target_words_per_chapter or settings.book_chapter_min_words
            return result

    tasks = [_chapter_with_limit(ch) for ch in outline]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    chapters = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            chapters.append({"number": outline[i]["number"], "title": outline[i]["title"],
                            "content": f"Chapter generation failed: {result}", "word_count": 0,
                            "files_to_analyze": outline[i].get("files_to_analyze", [])})
        else:
            chapters.append(result)
    chapters.sort(key=lambda c: c["number"])
    return chapters


async def _run_review_crew(chapters, repo_name, files: dict[str, str] | None = None) -> list[dict]:
    _ensure_crewai()
    reviewer = _make_agent(
        role="Technical Reviewer",
        goal=f"Review each chapter for technical accuracy, grounding, and correctness. "
             f"{_LANG_INSTRUCTION}",
        backstory="Senior engineer and editor who ensures technical books are accurate, "
                  "well-structured, and valuable.",
        llm_override=_review_llm,
    )
    writer = _make_agent(
        role="Chapter Writer",
        goal="Rewrite a chapter to fix identified issues while preserving structure and length.",
        backstory="Skilled technical book author who can surgically fix issues in existing chapters.",
    )
    sem = _get_chapter_sem()

    async def _review_one(chapter: dict) -> dict:
        chapter_code = _build_chapter_context(chapter, files or {})
        ch_content = chapter.get("content", "")[:15000]
        async with sem:
            verdict_text = await _kickoff_with_retry(Crew(
                agents=[reviewer],
                tasks=[Task(
                    description=(
                        f"Review Chapter {chapter['number']}: '{chapter['title']}' of '{repo_name}'.\n\n"
                        f"Chapter content:\n{ch_content}\n\n"
                        f"Reference source code:\n{chapter_code[:15000] if chapter_code else '(none)'}\n\n"
                        f"{_FAITH_INSTRUCTION}\n\n"
                        "Return STRICT JSON with no extra text:\n"
                        '{"verdict":"PASS|NEEDS_FIX","issues":["..."],"unsupported_claims":["..."]}\n'
                        "Verdict PASS if chapter is factually accurate and grounded. NEEDS_FIX if it contains "
                        "unsupported claims, hallucinated APIs, or factual errors."
                    ),
                    expected_output="JSON verdict object.",
                    agent=reviewer,
                )],
                process=Process.sequential, verbose=True,
            ))
        # Parse JSON verdict robustly
        try:
            obj_match = re.search(r"\{.*\}", verdict_text, re.DOTALL)
            if obj_match:
                import json as _json
                verdict = _json.loads(obj_match.group())
            else:
                verdict = {"verdict": "PASS", "issues": [], "unsupported_claims": []}
        except Exception:
            verdict = {"verdict": "PASS", "issues": [], "unsupported_claims": []}

        if verdict.get("verdict") == "NEEDS_FIX":
            issues_text = "\n".join(verdict.get("issues", []))
            claims_text = "\n".join(verdict.get("unsupported_claims", []))
            fix_prompt = (
                f"Rewrite Chapter {chapter['number']}: '{chapter['title']}' to fix these issues.\n\n"
                f"## Issues\n{issues_text}\n\n"
                f"## Unsupported claims to remove\n{claims_text}\n\n"
                f"## Original chapter\n{ch_content}\n\n"
                f"## Reference source code\n{chapter_code[:15000] if chapter_code else '(none)'}\n\n"
                f"{_FAITH_INSTRUCTION}\n\n"
                f"Preserve the chapter structure, section headers, and target length (~{chapter.get('_target_wc', settings.book_chapter_min_words)} words). "
                "Remove unsupported claims and correct inaccuracies against the provided source code."
            )
            async with sem:
                fixed = await _kickoff_with_retry(Crew(
                    agents=[writer],
                    tasks=[Task(
                        description=fix_prompt,
                        expected_output="Corrected chapter in Markdown.",
                        agent=writer,
                    )],
                    process=Process.sequential, verbose=True,
                ))
            chapter["content"] = fixed
            chapter["word_count"] = _count_words(fixed)
        return chapter

    tasks = [_review_one(ch) for ch in chapters]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    out = []
    for original, result in zip(chapters, results):
        if isinstance(result, Exception):
            logger.warning("Review failed for chapter %s: %s — keeping original",
                           original.get("number", "?"), result)
            out.append(original)
        else:
            out.append(result)
    return out


def _html_escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _strip_outer_code_fence(md: str) -> str:
    text = (md or "").strip()
    m = re.match(r"^```[a-zA-Z]*\n(.*)\n```$", text, re.DOTALL)
    return m.group(1) if m else md


def _markdown_to_html(md: str) -> str:
    import markdown
    return markdown.markdown(
        _strip_outer_code_fence(md),
        extensions=["fenced_code", "tables", "sane_lists", "nl2br", "toc"],
        output_format="html5",
    )


def _strip_leading_title(md: str) -> str:
    text = (md or "").lstrip("\n")
    # Writers often repeat the chapter title as the first heading; the editor
    # already emits the canonical <h1>, so drop a single leading ATX heading.
    m = re.match(r"^#{1,3}[ \t]+[^\n]*\n+", text)
    return text[m.end():] if m else text


async def _run_editor_crew(chapters, repo_name) -> str:
    from datetime import date
    chapter_sections: list[str] = []
    toc_items: list[str] = []
    for ch in chapters:
        n = ch["number"]
        title = ch.get("title", f"Chapter {n}")
        body_md = _strip_leading_title(_strip_outer_code_fence(ch.get("content", "")))
        body_html = _markdown_to_html(body_md)
        chapter_sections.append(
            f'<section id="chapter-{n}">\n'
            f'<h1>Chapter {n}: {_html_escape(title)}</h1>\n'
            f'{body_html}\n'
            f"</section>\n"
        )
        toc_items.append(
            f'<li class="toc-item"><a href="#chapter-{n}">Chapter {n}: {_html_escape(title)}</a></li>\n'
        )
    toc_html = '<ul class="toc">\n' + "".join(toc_items) + "</ul>\n"
    chapters_html = "".join(chapter_sections)
    today = date.today().isoformat()
    full_html = (
        "<!DOCTYPE html>\n"
        f'<html lang="zh-CN">\n'
        "<head>\n"
        '<meta charset="UTF-8">\n'
        f"<title>{_html_escape(repo_name)}</title>\n"
        f"<style>{_BOOK_CSS}</style>\n"
        "</head>\n"
        "<body>\n"
        f"<h1>{_html_escape(repo_name)}</h1>\n"
        f"{toc_html}\n"
        f"{chapters_html}\n"
        f'<div class="footer">Generated on {today}</div>\n'
        "</body>\n"
        "</html>"
    )
    return full_html


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
        content_title, content_description, chapter_count, snapshot,
        target_words_per_chapter=settings.book_chapter_min_words,
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
    from app.services.github import fetch_key_files, fetch_top_issues, measure_repo_scope
    scope = await measure_repo_scope(repo_name)
    dims = _plan_book_dimensions(scope)
    files = await fetch_key_files(repo_name, max_files=dims["max_files"])
    issues = await fetch_top_issues(repo_name)
    chapter_count = dims["chapter_count"]
    target_words_per_chapter = dims["target_words_per_chapter"]
    snapshot = _build_textual_snapshot(readme_content, files, issues)

    await status_updater("planning", total_chapters=chapter_count, phase="planning")
    outline = await _run_planning_crew(repo_name, repo_description, chapter_count, snapshot,
                                       target_words_per_chapter)

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
            "cover_image_path": cover_image_path, "files": files,
            "target_words_per_chapter": target_words_per_chapter}


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
                                 files: dict[str, str] | None = None,
                                 target_words_per_chapter: int | None = None,
                                 status_updater=None) -> dict:
    _ensure_crewai()
    if status_updater is None:
        async def _noop(*args, **kwargs): pass
        status_updater = _noop

    tgt = target_words_per_chapter or settings.book_chapter_min_words

    await status_updater("writing", outline=outline, phase="writing")
    chapters = await _run_chapters_parallel(repo_name, outline, snapshot, files, tgt)

    await status_updater("reviewing", completed_chapters=len(chapters), phase="reviewing")
    chapters = await _run_review_crew(chapters, repo_name, files)

    await status_updater("publishing", phase="publishing")
    html = await _run_editor_crew(chapters, repo_name)

    return {"chapters": chapters, "html": html}
