import { LlmClient } from "./llmClient";
import { GitHubApi, type Issue } from "./githubApi";

type StatusUpdater = (
  status: string,
  meta?: { phase?: string; totalChapters?: number; completedChapters?: number; outline?: ChapterOutline[] },
) => Promise<void>;

export interface ChapterOutline {
  number: number;
  title: string;
  focus: string;
  files_to_analyze: string[];
}

export interface ChapterResult {
  number: number;
  title: string;
  content: string;
  wordCount: number;
}

export interface CoverResult {
  outline: ChapterOutline[];
  coverHtml: string;
  snapshot: string;
  chapterCount: number;
}

export interface ContentResult {
  chapters: ChapterResult[];
  html: string;
}

const LANG_INSTRUCTION =
  "IMPORTANT: All output MUST be in Simplified Chinese (zh-CN). " +
  "Chapter titles, descriptions, content — everything in Chinese. " +
  "Only keep code identifiers, class names, and function names in their original language.";

function countWords(text: string): number {
  const matches = text.match(/\w+/g);
  return matches ? matches.length : 0;
}

function determineChapterCount(
  _repoInfo: { repo_name: string; file_count: number },
  files: Record<string, string>,
): number {
  const fileCount = Object.keys(files).length;
  if (fileCount < 30) return 4;
  if (fileCount < 80) return 8;
  if (fileCount < 200) return 12;
  return 16;
}

function buildTextualSnapshot(
  readme: string | null,
  files: Record<string, string>,
  issues: Issue[],
): string {
  const parts: string[] = [];
  if (readme) {
    parts.push("## README\n\n" + readme.slice(0, 6000));
  }
  parts.push("\n## Repository Files\n");
  const sorted = Object.entries(files).sort(([, a], [, b]) => b.length - a.length);
  for (const [path, content] of sorted.slice(0, 60)) {
    parts.push(`### ${path}\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\`\n`);
  }
  if (issues.length > 0) {
    parts.push("\n## Top Issues\n");
    for (const issue of issues.slice(0, 5)) {
      parts.push(`### ${issue.title} (${issue.state})\n${issue.body}\n`);
    }
  }
  return parts.join("\n");
}

async function runPlanningCrew(
  llm: LlmClient,
  repoName: string,
  repoDescription: string,
  chapterCount: number,
  snapshot: string,
): Promise<ChapterOutline[]> {
  const prompt = `Repository: ${repoName}\nDescription: ${repoDescription}\n` +
    `Target: ${chapterCount} chapters, 2000-5000 words each.\n\n` +
    `Repository content:\n${snapshot.slice(0, 15000)}\n\n` +
    `Create a book outline. ${LANG_INSTRUCTION} ` +
    `Return ONLY a JSON array of chapter objects. ` +
    `Each object: number (int), title (str), focus (str), files_to_analyze (str[]). ` +
    `Return ONLY the JSON array, no other text.`;

  const result = await llm.chat([{ role: "user", content: prompt }]);
  const jsonMatch = result.match(/\[.*\]/s);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return fallbackOutline(chapterCount);
    }
  }
  return fallbackOutline(chapterCount);
}

function fallbackOutline(chapterCount: number): ChapterOutline[] {
  const sections = [
    "项目概览与架构", "核心概念与设计哲学",
    "代码漫游：关键模块", "数据模型与状态管理",
    "API 设计与通信", "测试与质量保障",
    "构建系统与 DevOps", "性能与优化",
    "安全性考量", "错误处理与韧性",
    "配置与可扩展性", "社区与贡献指南",
    "高级模式与内部原理", "真实场景案例",
    "经验教训与最佳实践", "未来路线图与演进",
  ];
  return Array.from({ length: chapterCount }, (_, i) => ({
    number: i + 1,
    title: `Chapter ${i + 1}: ${sections[i % 16]}`,
    focus: sections[i % 16].toLowerCase(),
    files_to_analyze: [] as string[],
  }));
}

async function runCoverCrew(
  llm: LlmClient,
  repoName: string,
  repoDescription: string,
  outline: ChapterOutline[],
): Promise<string> {
  const chaptersList = outline.slice(0, 6)
    .map((ch) => `Chapter ${ch.number}: ${ch.title}`)
    .join("\n");

  const prompt = `Design a cover page for the book '${repoName}'.\n\n` +
    `Description: ${repoDescription}\n\n` +
    `Chapters:\n${chaptersList}\n\n` +
    `${LANG_INSTRUCTION}\n\n` +
    `Create an HTML cover page that looks like a real book cover. Requirements:\n` +
    `- Full viewport height, centered content\n` +
    `- Elegant typography using 'Playfair Display' for title, 'Source Serif 4' for subtitle\n` +
    `- Title prominently displayed\n` +
    `- A tagline derived from the project description\n` +
    `- Author attribution (the repo owner)\n` +
    `- Subtle decorative elements (lines, geometric shapes, or dots)\n` +
    `- Use this color palette: background #f5f0e8, text #2c1a0e, accent #c17f3a, dark #5c3d1e\n` +
    `- The cover should feel like a premium technical book\n` +
    `- Add a subtle background pattern or texture effect\n\n` +
    `Return ONLY the HTML for the cover page (a complete <div> element), no other text.`;

  const result = await llm.chat([{ role: "user", content: prompt }]);
  const divMatch = result.match(/<div[^>]*>[\s\S]*?<\/div>/i);
  return divMatch ? divMatch[0] : result;
}

async function runChapterResearchWriter(
  llm: LlmClient,
  repoName: string,
  chapter: ChapterOutline,
  snapshot: string,
): Promise<ChapterResult> {
  const researchPrompt =
    `Chapter ${chapter.number}: ${chapter.title}\nFocus: ${chapter.focus}\n` +
    `Key files: ${chapter.files_to_analyze.join(", ")}\n\n` +
    `Repository content:\n${snapshot.slice(0, 12000)}\n\n` +
    `Provide structured research notes in Chinese: key concepts, architecture decisions, ` +
    `code patterns with references, edge cases, educational value.`;

  const researchNotes = await llm.chat([{ role: "user", content: researchPrompt }]);

  const writingPrompt =
    `Write Chapter ${chapter.number}: '${chapter.title}' (2000-5000 words). ` +
    `${LANG_INSTRUCTION} ` +
    `Use clear section headers (##), include code snippets, explain WHY not just WHAT, ` +
    `add practical examples, end with summary and further reading.\n\n` +
    `Research notes:\n${researchNotes}`;

  const content = await llm.chat([{ role: "user", content: writingPrompt }]);

  return {
    number: chapter.number,
    title: chapter.title,
    content,
    wordCount: countWords(content),
  };
}

async function runChaptersParallel(
  llm: LlmClient,
  repoName: string,
  outline: ChapterOutline[],
  snapshot: string,
  maxParallel: number = 3,
): Promise<ChapterResult[]> {
  const semaphore = new Array(maxParallel).fill(null) as Promise<void>[];
  let active = 0;
  const results: (ChapterResult | Error)[] = [];

  const tasks = outline.map(async (chapter, index) => {
    while (active >= maxParallel) {
      await Promise.race(semaphore);
    }
    active++;
    try {
      const result = await runChapterResearchWriter(llm, repoName, chapter, snapshot);
      results[index] = result;
    } catch (e) {
      results[index] = e instanceof Error ? e : new Error(String(e));
    } finally {
      active--;
    }
  });

  await Promise.all(tasks);

  return results.map((r, i) => {
    if (r instanceof Error) {
      return {
        number: outline[i].number,
        title: outline[i].title,
        content: `Chapter generation failed: ${r.message}`,
        wordCount: 0,
      };
    }
    return r;
  }).sort((a, b) => a.number - b.number);
}

async function runReviewCrew(
  llm: LlmClient,
  chapters: ChapterResult[],
  repoName: string,
): Promise<void> {
  const chaptersText = chapters
    .map((ch) => `### Chapter ${ch.number}: ${ch.title}\n\n${ch.content.slice(0, 3000)}`)
    .join("\n\n");

  const prompt =
    `Review the following chapters for '${repoName}'.\n\n${chaptersText.slice(0, 20000)}\n\n` +
    `For each chapter: PASS or NEEDS_FIX, list issues, list suggestions. ${LANG_INSTRUCTION}`;

  await llm.chat([{ role: "user", content: prompt }]);
}

async function runEditorCrew(
  llm: LlmClient,
  chapters: ChapterResult[],
  repoName: string,
): Promise<string> {
  const chaptersText = chapters
    .map((ch) =>
      `CHAPTER_${ch.number}_MARKER\n# Chapter ${ch.number}: ${ch.title}\n\n${ch.content}`,
    )
    .join("\n\n");

  const prompt =
    `Convert the following chapters into a complete HTML book for '${repoName}'.\n\n` +
    `${chaptersText.slice(0, 30000)}\n\n` +
    `Produce a single HTML document. ${LANG_INSTRUCTION} ` +
    `The document should have: title, table of contents, ` +
    `each chapter as <section>, code in <pre><code>, footer with date. ` +
    `Use this CSS: body{background:#f5f0e8;color:#2c1a0e;` +
    `font-family:'Source Serif 4',Georgia,serif;max-width:800px;margin:0 auto;` +
    `padding:2rem;line-height:1.8}h1,h2{font-family:'Playfair Display',serif;` +
    `color:#5c3d1e}pre{background:#ede5d4;padding:1rem;border-radius:8px}` +
    `code{font-family:monospace} a{color:#c17f3a}.toc{background:#fffdf7;` +
    `padding:1.5rem;border-radius:12px;margin:2rem 0}.toc a{display:block;` +
    `padding:.25rem 0;text-decoration:none}.footer{text-align:center;` +
    `color:#7a6248;margin-top:3rem;font-size:.85em}\n` +
    `Return ONLY the complete HTML document.`;

  let result = await llm.chat([{ role: "user", content: prompt }]);
  const htmlMatch = result.match(/<!DOCTYPE html>[\s\S]*?<\/html>/i);
  if (htmlMatch) return htmlMatch[0];
  const bodyMatch = result.match(/<html[\s\S]*?<\/html>/i);
  if (bodyMatch) return "<!DOCTYPE html>\n" + bodyMatch[0];
  return result;
}

function prependCover(html: string, cover: string): string {
  const bodyMatch = html.match(/<body[^>]*>/i);
  if (bodyMatch) {
    const insertionPoint = bodyMatch.index! + bodyMatch[0].length;
    return html.slice(0, insertionPoint) + "\n" + cover + "\n" + html.slice(insertionPoint);
  }
  return cover + html;
}

export async function generateBookCover(
  llm: LlmClient,
  github: GitHubApi,
  repoName: string,
  repoDescription: string,
  readmeContent: string,
  updateStatus: StatusUpdater,
): Promise<CoverResult> {
  await updateStatus("fetching");

  const files = await github.fetchKeyFiles(repoName);
  const issues = await github.fetchTopIssues(repoName);
  const repoInfo = { repo_name: repoName, file_count: Object.keys(files).length };
  const chapterCount = determineChapterCount(repoInfo, files);
  const snapshot = buildTextualSnapshot(readmeContent, files, issues);

  await updateStatus("planning", { totalChapters: chapterCount, phase: "planning" });
  const outline = await runPlanningCrew(llm, repoName, repoDescription, chapterCount, snapshot);

  await updateStatus("cover", { phase: "cover" });
  const coverHtml = await runCoverCrew(llm, repoName, repoDescription, outline);

  return { outline, coverHtml, snapshot, chapterCount };
}

export async function generateBookContent(
  llm: LlmClient,
  repoName: string,
  outline: ChapterOutline[],
  snapshot: string,
  updateStatus: StatusUpdater,
): Promise<ContentResult> {
  await updateStatus("writing", { phase: "writing", outline });

  const chapters = await runChaptersParallel(llm, repoName, outline, snapshot);

  await updateStatus("reviewing", { completedChapters: chapters.length, phase: "reviewing" });
  await runReviewCrew(llm, chapters, repoName);

  await updateStatus("publishing", { phase: "publishing" });
  const html = await runEditorCrew(llm, chapters, repoName);

  return { chapters, html };
}

export { prependCover };
