"""
LLM integration — section-based parallel analysis.

Each iteration is split into 4 independent sections run in parallel:
  1. Summary (title, change_type, summary, tags, changes list)
  2. Architecture (old/new diagram comparison)
  3. Sequence diagram
  4. Performance charts

This avoids token truncation and improves diagram quality.
"""

import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed


# ============================================================
# Mermaid sanitizer
# ============================================================

def _sanitize_mermaid(code: str | None) -> str | None:
    if not code:
        return None
    code = code.strip()
    code = code.replace("--&gt;", "-->")
    code = code.replace("&lt;br/&gt;", "<br/>")
    code = code.replace("&lt;br&gt;", "<br/>")
    code = code.replace("&lt;", "<")
    code = code.replace("&gt;", ">")
    code = code.replace("&amp;", "&")

    lines = [line for line in code.split("\n") if line.strip() and not line.strip().startswith("%%") and not line.strip().startswith("//")]
    code = "\n".join(lines)

    valid_starts = ("graph", "sequenceDiagram", "flowchart", "classDiagram", "stateDiagram", "erDiagram", "gantt", "pie")
    if not any(code.strip().startswith(kw) for kw in valid_starts):
        return None

    last_line = code.strip().split("\n")[-1].strip()
    if last_line.endswith("[") or last_line.endswith("(") or last_line.endswith("{") or \
       last_line.endswith("-->") or last_line.endswith("->") or last_line.endswith("|"):
        return None
    if code.count("[") != code.count("]") or code.count("(") != code.count(")"):
        return None

    return code


# ============================================================
# Section Prompts
# ============================================================

SUMMARY_PROMPT = """你是一位资深软件架构师。分析以下 Git 版本差异，输出 JSON。

输出格式：
{
  "title": "版本标题（中文，30字内）",
  "change_type": "架构重构 / 功能增强 / Bug修复 / 性能优化 / 依赖升级",
  "change_type_label": "Major / Minor / Patch",
  "summary": "2-3段中文技术总结，详细描述核心变更、影响范围、技术决策",
  "tags": [
    {"type": "architecture|performance|feature|breaking|dependency", "icon": "emoji", "label": "简短标签"}
  ],
  "changes": [
    {
      "category": "Breaking Changes / 功能变更 / Bug修复 / 依赖升级 / 性能优化",
      "entries": [
        {"description": "变更描述", "severity": "breaking|improve|null"}
      ]
    }
  ]
}

只输出 JSON，不要 markdown 代码块。"""

ARCH_PROMPT = """你是一位系统架构师。根据 Git 版本差异，推断旧架构和新架构的对比，绘制 Mermaid 图。

输出格式：
{
  "old_arch_label": "旧架构标签（中文，10字以内）",
  "old_arch_diagram": "Mermaid graph TD 旧架构图，节点数不超过12个，每个标签用方括号 A[标签] 格式",
  "new_arch_label": "新架构标签（中文，10字以内）",
  "new_arch_diagram": "Mermaid graph TD 新架构图，节点数不超过12个，突出架构变化"
}

Mermaid 规则：
- 使用 graph TD 开头
- 节点格式：A[名称]（矩形）、B(名称)（圆角）、C{名称}（菱形决策）
- 箭头用 --> 或 -->|标签|
- 不要用 HTML entities（&lt; &gt; &amp;）
- 每个节点必须有关闭括号
- 如果架构无变化，diagram 值设为 null

只输出 JSON，不要 markdown 代码块。"""

SEQ_PROMPT = """你是一位技术文档工程师。根据 Git 版本差异，生成关键业务流的 Mermaid 时序图。

输出格式：
{
  "sequence_diagram": "Mermaid sequenceDiagram 时序图，参与者不超过6个"
}

Mermaid 规则：
- 用 sequenceDiagram 开头
- 参与者格式：participant A as 名称
- 箭头：A->>B: 消息 或 A-->>B: 返回
- 支持 alt/else 分支和 loop 循环
- 不要用 HTML entities
- 如果无明显时序流程，设为 null

只输出 JSON，不要 markdown 代码块。"""

CHARTS_PROMPT = """你是一位数据可视化专家。根据 Git 版本差异，分析性能变化并生成 ECharts 图表数据。

输出格式：
{
  "charts": [
    {
      "title": "图表标题（中文）",
      "option_json": {
        "title": {"text": "图表标题"},
        "tooltip": {"trigger": "axis"},
        "xAxis": {"type": "category", "data": ["优化前", "优化后"]},
        "yAxis": {"type": "value"},
        "series": [{"type": "bar", "data": [100, 100], "name": "指标"}],
        "dataZoom": [{"type": "inside"}, {"type": "slider"}],
        "toolbox": {"feature": {"dataZoom": {}, "restore": {}}}
      }
    }
  ]
}

要求：
- 对比类数据用 bar，趋势类用 line
- series.data 用合理数值（如优化前 100，优化后 70 表示降低30%）
- option_json 必须是完整合法的 ECharts option 对象
- 如 diff 中没有性能数据，charts 设为空数组 []

只输出 JSON，不要 markdown 代码块。"""


# ============================================================
# Prompt builder
# ============================================================

def _build_section_prompt(diff_text: str, metadata: dict) -> str:
    version = metadata.get("version", "unknown")
    date = metadata.get("date", "unknown")
    commit_count = metadata.get("commit_count", 0)
    prev = metadata.get("prev_version", "initial")
    diff_stat = metadata.get("diff_stat", "")
    files = metadata.get("changed_files", [])[:30]

    max_chars = metadata.get("max_diff_chars", 16000)
    if len(diff_text) > max_chars:
        diff_text = diff_text[:max_chars] + f"\n... [截断 {len(diff_text) - max_chars} 字符]"

    return f"""版本: {version} ({date})
上一个版本: {prev}  提交数: {commit_count}

变更文件: {', '.join(files[:15])}

Diffstat:
{diff_stat}

代码差异:
{diff_text}"""


# ============================================================
# JSON repair + parse
# ============================================================

def _repair_json(text: str) -> str:
    text = text.strip()
    if not text.startswith("{"):
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            text = m.group(0)
    text = text.replace("'", '"')
    text = re.sub(r'//[^\n]*', '', text)

    lines = text.split("\n")
    repaired = []
    for i, line in enumerate(lines):
        s = line.strip()
        if not s or s in ("{", "}", "[", "]"):
            repaired.append(line)
            continue
        nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""
        if not s.endswith(",") and not s.endswith("{") and not s.endswith("[") \
           and nxt and not nxt.startswith("}") and not nxt.startswith("]"):
            line = line.rstrip() + ","
        repaired.append(line)

    text = "\n".join(repaired)
    text = re.sub(r',\s*}', '}', text)
    text = re.sub(r',\s*]', ']', text)
    text = re.sub(r'([{,])\s*(\w+)\s*:', r'\1"\2":', text)
    missing = text.count("{") - text.count("}")
    while missing > 0:
        text += "}"
        missing -= 1
    return text


def _strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:])
    if text.endswith("```"):
        text = text[:-3].strip()
    if text.startswith("json"):
        text = text[4:].strip()
    return text


def _extract_fields_regex(text: str) -> dict:
    data = {}
    for field in ("title", "change_type", "change_type_label", "summary"):
        m = re.search(rf'"{field}"\s*:\s*"([^"]*)"', text)
        data[field] = m.group(1) if m else ""
    for field in ("old_arch_label", "new_arch_label", "old_arch_diagram", "new_arch_diagram", "sequence_diagram"):
        m = re.search(rf'"{field}"\s*:\s*"([\s\S]*?)"(?=\s*[,}}])', text)
        data[field] = m.group(1).replace('\\n', '\n').replace('\\"', '"') if m else None
    tags_m = re.search(r'"tags"\s*:\s*(\[[\s\S]*?\])', text)
    if tags_m:
        try:
            data["tags"] = json.loads(_repair_json(tags_m.group(1)))
        except (json.JSONDecodeError, ValueError):
            data["tags"] = []
    return data


def _parse_json(text: str) -> dict:
    text = _strip_code_fences(text)
    errors = []

    for attempt in range(4):
        try:
            if attempt == 0:
                return json.loads(text)
            elif attempt == 1:
                return json.loads(_repair_json(text))
            elif attempt == 2:
                m = re.search(r"\{[\s\S]*\}", text)
                if m:
                    return json.loads(_repair_json(m.group(0)))
            else:
                return _extract_fields_regex(text)
        except (json.JSONDecodeError, ValueError) as e:
            errors.append(str(e))

    raise ValueError(f"JSON parse failed: {'; '.join(errors[:2])}")


# ============================================================
# LLM Parser
# ============================================================

class LLMParser:

    total_input_tokens = 0
    total_output_tokens = 0
    total_calls = 0

    def __init__(self, provider="openai", model=None, api_key=None, base_url=None):
        self.provider = provider
        configs = {
            "openai": ("gpt-4o", "OPENAI_API_KEY", "https://api.openai.com/v1"),
            "ollama": ("qwen2.5:7b", "OPENAI_API_KEY", "http://localhost:11434/v1"),
            "deepseek": ("deepseek-chat", "DEEPSEEK_API_KEY", "https://api.deepseek.com/v1"),
        }
        dm, dk, du = configs.get(provider, configs["openai"])
        self.model = model or os.environ.get(f"{provider.upper()}_MODEL", dm)
        self.api_key = api_key or os.environ.get(dk, "ollama")
        self.base_url = base_url or os.environ.get(f"{provider.upper()}_BASE_URL", du)

    def _call(self, system_prompt: str, user_prompt: str, max_tokens: int = 4096) -> str:
        import openai
        client = openai.OpenAI(api_key=self.api_key, base_url=self.base_url)
        last_error = ""

        for retry in range(3):
            try:
                resp = client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.3,
                    max_tokens=max_tokens,
                    timeout=180,
                )
                usage = resp.usage
                if usage:
                    LLMParser.total_input_tokens += usage.prompt_tokens or 0
                    LLMParser.total_output_tokens += usage.completion_tokens or 0
                LLMParser.total_calls += 1
                return resp.choices[0].message.content or ""
            except openai.RateLimitError as e:
                last_error = f"Rate limit: {e}"
                if retry < 2:
                    time.sleep((retry + 1) * 15)
            except openai.APIConnectionError as e:
                last_error = f"Connection: {e}"
                if retry < 2:
                    time.sleep(5)
            except openai.APIError as e:
                last_error = f"API: {e}"
                break
            except Exception as e:
                last_error = str(e) or type(e).__name__
                break

        raise RuntimeError(last_error or "API call failed after retries")

    def analyze_sections(self, diff_text: str, metadata: dict) -> dict:
        user = _build_section_prompt(diff_text, metadata)
        sections = {
            "summary":  (SUMMARY_PROMPT, 4096),
            "arch":     (ARCH_PROMPT, 16384),
            "sequence": (SEQ_PROMPT, 8192),
            "charts":   (CHARTS_PROMPT, 4096),
        }

        results = {}

        def _run_section(name, prompt, max_tok):
            try:
                raw = self._call(prompt, user, max_tok)
                return name, _parse_json(raw)
            except Exception:
                return name, None

        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(_run_section, n, p, t): n for n, (p, t) in sections.items()}
            for f in as_completed(futures):
                name, data = f.result()
                if data:
                    results[name] = data

        return self._merge_sections(results)

    def _merge_sections(self, sections: dict) -> dict:
        merged = {}

        if "summary" in sections:
            s = sections["summary"]
            merged.update({
                "title": s.get("title", ""),
                "change_type": s.get("change_type", "功能增强"),
                "change_type_label": s.get("change_type_label", "Minor"),
                "summary": s.get("summary", ""),
                "tags": s.get("tags", []),
                "changes": s.get("changes", []),
            })
        else:
            merged.update({"title": "", "change_type": "功能增强",
                           "change_type_label": "Minor", "summary": "",
                           "tags": [], "changes": []})

        if "arch" in sections:
            a = sections["arch"]
            merged.update({
                "old_arch_label": a.get("old_arch_label"),
                "old_arch_diagram": _sanitize_mermaid(a.get("old_arch_diagram")),
                "new_arch_label": a.get("new_arch_label"),
                "new_arch_diagram": _sanitize_mermaid(a.get("new_arch_diagram")),
            })
        else:
            merged.update({"old_arch_label": None, "old_arch_diagram": None,
                           "new_arch_label": None, "new_arch_diagram": None})

        if "sequence" in sections:
            merged["sequence_diagram"] = _sanitize_mermaid(
                sections["sequence"].get("sequence_diagram"))
        else:
            merged["sequence_diagram"] = None

        if "charts" in sections:
            merged["charts"] = sections["charts"].get("charts", [])
        else:
            merged["charts"] = []

        return merged

    def analyze(self, diff_text: str, metadata: dict) -> dict:
        return self.analyze_sections(diff_text, metadata)

    def analyze_with_fallback(self, diff_text: str, metadata: dict) -> dict:
        try:
            return self.analyze(diff_text, metadata)
        except Exception as e:
            error_msg = str(e) or repr(e)[:100] or type(e).__name__
            print(f"    ⚠ {metadata.get('version','?')} failed: {error_msg[:120]}")
            return _generate_mock_analysis(metadata, error_msg)


# ============================================================
# Mock fallback
# ============================================================

def _generate_mock_analysis(metadata: dict, error: str = "") -> dict:
    version = metadata.get("version", "unknown")
    return {
        "title": f"{version} 版本迭代",
        "change_type": "功能增强",
        "change_type_label": "Minor",
        "summary": f"此版本包含 {metadata.get('commit_count', 0)} 次提交。"
                   f"（LLM 分析未完成：{error[:80]}）",
        "tags": [{"type": "feature", "icon": "✨", "label": "功能变更"}],
        "old_arch_label": None, "old_arch_diagram": None,
        "new_arch_label": None, "new_arch_diagram": None,
        "sequence_diagram": None,
        "charts": [],
        "changes": [{"category": "变更列表", "entries": [
            {"description": f"LLM 分析不可用 ({error[:60]})", "severity": None}
        ]}],
    }
