export const TAG_GENERATED = "AI 生成";
export const TAG_DOCUMENTS = "文档资料";
export const TAG_IMPORTED = "导入内容";
export const TAG_YOUTUBE = "视频";

export const SYSTEM_TAGS: readonly string[] = [
  TAG_GENERATED,
  TAG_DOCUMENTS,
  TAG_IMPORTED,
  TAG_YOUTUBE,
];

export function isSystemTag(tag: string): boolean {
  return SYSTEM_TAGS.includes(tag);
}

export function normalizeTags(tags: readonly string[] | null | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const cleaned = String(raw).split(/\s+/).filter(Boolean).join(" ");
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }
  return result;
}
