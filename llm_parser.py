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
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)


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

    code = re.sub(r'(graph\s+\w+)\s+(subgraph\s)', r'\1\n\2', code)
    code = re.sub(r'(flowchart\s+\w+)\s+(subgraph\s)', r'\1\n\2', code)
    code = re.sub(r'(graph\s+\w+)\s+(direction\s)', r'\1\n\2', code)
    code = re.sub(r'(flowchart\s+\w+)\s+(direction\s)', r'\1\n\2', code)
    code = re.sub(r'(end)\s+(subgraph\s)', r'\1\n\2', code)

    code = re.sub(r'([A-Za-z_]+)\[\]', r'\1［］', code)

    def sanitize_label(match: re.Match[str]) -> str:
        inner = match.group(1)
        inner = inner.replace("(", "（").replace(")", "）")
        inner = inner.replace("{", "｛").replace("}", "｝")
        inner = inner.replace("[", "［").replace("]", "］")
        return "[" + inner + "]"

    code = re.sub(r'\[([^\]]*)\]', sanitize_label, code)

    lines = [line for line in code.split("\n") if line.strip()
             and not line.strip().startswith("%%")
             and not line.strip().startswith("//")
             and line.strip().lower() not in
             ("diagram", "mermaid", "mermaid diagram", "mermaid diagram:")]
    code = "\n".join(lines)

    valid_starts = ("graph", "sequenceDiagram", "flowchart", "classDiagram", "stateDiagram", "erDiagram", "gantt", "pie")
    if not any(code.strip().startswith(kw) for kw in valid_starts):
        return None

    lines = code.strip().split("\n")

    if code.strip().startswith("sequenceDiagram") and len(lines) > 30:
        return None
    if code.strip().startswith("graph") and len(lines) > 30:
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
  "old_arch_diagram": "Mermaid graph TD 旧架构图，节点不超过10个，每个标签用方括号 A[标签] 格式",
  "new_arch_label": "新架构标签（中文，10字以内）",
  "new_arch_diagram": "Mermaid graph TD 新架构图，节点不超过10个，突出架构变化"
}

Mermaid 规则：
- 使用 graph TD 开头
- 节点不超过10个，聚焦核心架构变化，忽略细节
- 节点格式：A[名称]（矩形）、B(名称)（圆角）、C{名称}（菱形决策）
- 箭头用 --> 或 -->|标签|
- 不要用 HTML entities（&lt; &gt; &amp;）
- 每个节点必须有关闭括号
- 如果架构无变化，diagram 值设为 null

只输出 JSON，不要 markdown 代码块。"""

SEQ_PROMPT = """你是一位技术文档工程师。根据 Git 版本差异，生成关键业务流的 Mermaid 时序图。
选择原则：优先选择本次变更涉及的核心流程（如新增的 API 调用链、重构后的数据流、关键交互路径），而非无关流程。

输出格式：
{
  "sequence_diagram": "Mermaid sequenceDiagram 时序图，参与者不超过10个"
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

重要：只有当 diff 中包含真实的性能数据（如基准测试、延迟指标、吞吐量、内存占用等具体数字）时才生成图表。不要编造不存在的数据。大多数 diff 不包含性能数据，此时 charts 应为空数组。

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
- series.data 必须基于 diff 中的真实数据，非估计值
- option_json 必须是完整合法的 ECharts option 对象
- 如 diff 中无真实性能数据，charts 必须设为空数组 []

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

    def _call(self, system_prompt: str, user_prompt: str, max_tokens: int = 4096,
              label: str = "") -> str:
        import openai
        client = openai.OpenAI(api_key=self.api_key, base_url=self.base_url)
        last_error = ""

        for retry in range(3):
            try:
                t0 = time.time()
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
                elapsed = time.time() - t0
                if elapsed > 5:
                    logger.debug("    %s done in %.0fs%s",
                                 label, elapsed,
                                 f" ({usage.completion_tokens} tokens)" if usage else "")
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
            except (json.JSONDecodeError, AttributeError, TypeError, IndexError) as e:
                last_error = str(e) or type(e).__name__
                break

        raise RuntimeError(last_error or "API call failed after retries")

    def analyze_sections(self, diff_text: str, metadata: dict) -> dict:
        user = _build_section_prompt(diff_text, metadata)
        sections = {
            "summary":  (SUMMARY_PROMPT, 4096),
            "arch":     (ARCH_PROMPT, 24576),
            "sequence": (SEQ_PROMPT, 24576),
            "charts":   (CHARTS_PROMPT, 8192),
        }

        results = {}

        def _run_section(name, prompt, max_tok):
            try:
                raw = self._call(prompt, user, max_tok, label=name)
                return name, _parse_json(raw)
            except (RuntimeError, ValueError):
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
        except (RuntimeError, ValueError) as e:
            error_msg = str(e) or repr(e)[:100] or type(e).__name__
            logger.warning("    ⚠ %s failed: %s",
                           metadata.get('version', '?'), error_msg[:120])
            return _generate_mock_analysis(metadata, error_msg)

    def analyze_module(self, module_info: dict, deep: bool = False) -> dict:
        if deep:
            prompt_text = _build_module_prompt(module_info)
            try:
                raw = self._call(MODULE_DEEP_PROMPT, prompt_text,
                                 max_tokens=8192, label=module_info["name"])
                data = _parse_json(raw)
                data["name"] = module_info["name"]
                return data
            except (RuntimeError, ValueError):
                return {
                    "name": module_info["name"],
                    "purpose": "",
                    "architecture": "分析失败",
                    "implementation": "",
                    "design_decisions": [],
                    "rules_and_constraints": [],
                    "dependencies": [],
                    "patterns": [],
                    "highlights": [],
                    "weaknesses": [],
                    "diagram": None,
                }
        else:
            prompt_text = _build_module_prompt(module_info)
            try:
                raw = self._call(MODULE_PROMPT, prompt_text,
                                 max_tokens=4096, label=module_info["name"])
                return _parse_json(raw)
            except (RuntimeError, ValueError):
                return {
                    "purpose": "",
                    "architecture": "分析失败",
                    "dependencies": [],
                    "patterns": [],
                    "diagram": None,
                }

    def analyze_codebase_overview(self, modules: list[dict],
                                  project_info: dict) -> dict:
        prompt = _build_codebase_overview_prompt(modules, project_info)
        try:
            raw = self._call(CODEBASE_OVERVIEW_PROMPT, prompt,
                             max_tokens=16384, label="overview")
            return _parse_json(raw)
        except (RuntimeError, ValueError) as e:
            return {"error": str(e), "project_overview": {},
                    "tech_stack_analysis": [], "core_execution_flow": {},
                    "module_architecture": {}}

    def synthesize_methodology(self, overview: dict,
                               module_analyses: list[dict]) -> dict:
        prompt = _build_methodology_synthesis_prompt(overview, module_analyses)
        try:
            raw = self._call(CODEBASE_SYNTHESIS_PROMPT, prompt,
                             max_tokens=12288, label="synthesis")
            return _parse_json(raw)
        except (RuntimeError, ValueError) as e:
            return {"error": str(e), "design_principles": [],
                    "decision_checklist": [], "best_practices": [],
                    "industry_problems": [], "replication_guide": {}}


MODULE_PROMPT = """你是一位资深软件架构师。分析以下代码模块，输出 JSON。

输出格式：
{
  "purpose": "模块用途（中文，50字内）",
  "architecture": "1-2段中文架构描述，说明设计模式、分层结构、核心抽象",
  "dependencies": ["依赖的外部模块或库名称"],
  "patterns": ["使用的设计模式或架构特征"],
  "diagram": "Mermaid graph TD 架构图，节点不超过8个（可选，格式如 A[组件名] --> B[组件名]）"
}

Mermaid 规则：
- 使用 graph TD 开头
- 节点不超过8个，聚焦核心架构
- 节点格式：A[名称]（矩形）、B(名称)（圆角）
- 箭头用 -->
- 不要用 HTML entities
- 如无法推断架构，diagram 设为 null

只输出 JSON，不要 markdown 代码块。"""


MODULE_DEEP_PROMPT = """你是一位资深软件架构师与代码考古学家，正在对开源项目进行源码级深度分析。请严格按照以下四步方法论，基于提供的**真实源码内容**进行分析。不要编造不存在的内容，不确定的地方标注"[不确定]"。

## 分析方法论

### 第一步：模块定位
分析该模块在整个项目中的角色、解决的核心问题、与上下游模块的关系。

### 第二步：代码实现细节
- 核心类/函数及其职责、入参出参
- 关键数据结构与接口定义
- 内部执行流程、分支逻辑、边界判断
- 异常处理、错误恢复、重试机制
- 关键配置常量、阈值限制、硬编码规则

### 第三步：设计决策溯源（最重要）
不止看"怎么写"，重点挖掘"为什么这么设计"：
- 为什么采用当前逻辑而非其他方案？分析被放弃的替代方案
- 设计权衡：性能 vs 可读性、安全 vs 便利、通用性 vs 专用性
- 针对的痛点：规避了哪些已知问题？弥补了底层技术/模型的哪些缺陷？
- 从代码中能看出什么工程文化：防御性编程、优雅降级、fail-fast？

### 第四步：规则与约束
- 使用限制、权限约束、数据读写规则
- 防错设计、降级方案、熔断机制
- 输入输出规范、格式校验、数据过滤

## 输出格式

{
  "purpose": "模块定位（中文，100字以内，必须基于源码）",
  "architecture": "架构描述（2-3段中文，说明分层结构、核心抽象、组件关系）",
  "implementation": "实现细节（2-3段中文，基于源码说明核心类/函数、关键流程、数据流转）",
  "design_decisions": [
    {
      "decision": "设计决策（一句话描述做了什么选择）",
      "why": "为什么这样设计（基于源码推断，不确定处标注）",
      "tradeoffs": "权衡考虑（性能/成本/安全/体验/维护性之间的取舍）",
      "alternatives": "被放弃的替代方案是什么"
    }
  ],
  "rules_and_constraints": [
    {"rule": "具体的规则或约束", "type": "权限控制|输入校验|降级策略|重试机制|数据过滤|其他"}
  ],
  "dependencies": [
    {"name": "依赖模块/库名", "relationship": "调用关系说明", "direction": "inbound|outbound"}
  ],
  "patterns": [
    {"pattern": "设计模式名", "where": "在哪些类/函数中体现"}
  ],
  "highlights": [
    {"item": "工程亮点说明", "rationale": "为什么是亮点（技术价值、工程意义）"}
  ],
  "weaknesses": [
    {"item": "潜在问题说明", "rationale": "为什么是问题（风险、影响范围）"}
  ],
  "diagram": "Mermaid graph TD 架构图（节点不超过10个）或 null"
}

Mermaid 规则：graph TD 开头，节点≤10个，A[名称] 格式，箭头用 -->，不用 HTML entities。
只输出 JSON，不要 markdown 代码块。"""


CODEBASE_OVERVIEW_PROMPT = """你是一位资深技术作家与软件架构师。基于以下项目信息，撰写一份代码库全景分析报告的前半部分（第一阶段：前期准备与架构概览）。

## 分析内容

### 一、项目定位与背景
- 产品定位：这是什么产品？解决什么问题？目标用户是谁？
- 技术背景：为什么选择这些技术栈？每个选型的原因分析
- 规模概览：文件数、代码行数、模块数、核心依赖
- 历史背景：项目来源与获取渠道（如为常规开源项目则简述即可）、版本状态

### 二、技术栈选型分析
对每个关键技术组件，回答三个问题：
1. 选了什么技术？
2. 替代方案有哪些？
3. 为什么选它？（性能、体验、运维、生态、团队背景等）

### 三、核心执行流程
- 项目的主循环/主流程是什么？（如 TAOR 循环：思考→执行→观察→循环）
- 一次完整请求从触发到结束的全流程
- 关键节点、数据流向、API调用逻辑

### 四、整体模块划分
- 顶层子系统拆分（核心业务 vs 通用辅助 vs 内部实验 vs 对外适配）
- 各模块职责边界与依赖关系
- 模块间通信方式与数据流转

## 输出格式

{
  "project_overview": {
    "name": "项目名称",
    "product_type": "产品类型（CLI工具/Web应用/库/SDK等）",
    "target_users": "目标用户群体",
    "core_value": "核心价值主张（50字内）",
    "scale": {
      "files": 0,
      "lines": 0,
      "modules": 0,
      "languages": ["语言1"],
      "runtime": "运行时环境"
    },
    "background": "项目背景与来源（100字内）"
  },
  "tech_stack_analysis": [
    {
      "category": "技术类别（运行时/UI框架/CLI解析/校验库/协议/API等）",
      "chosen": "选择的技术",
      "alternatives": ["替代方案1", "替代方案2"],
      "rationale": "选型原因分析（为什么选它而非替代方案）"
    }
  ],
  "core_execution_flow": {
    "name": "主循环名称（如 TAOR 循环）",
    "description": "主流程描述（2-3段中文）",
    "key_stages": [
      {"stage": "阶段名", "description": "阶段描述", "triggers": "触发条件", "outputs": "输出"}
    ],
    "diagram": "Mermaid sequenceDiagram 主流程时序图（或 graph TD 流程图）"
  },
  "module_architecture": {
    "overview": "整体模块架构概览（2-3段中文）",
    "subsystems": [
      {
        "name": "子系统名称",
        "category": "核心业务|通用辅助|内部实验|对外适配",
        "modules": ["模块1", "模块2"],
        "description": "子系统职责描述",
        "key_interfaces": ["接口/入口1"]
      }
    ],
    "communication_patterns": ["通信模式1（如事件驱动、RPC、共享状态）"],
    "diagram": "Mermaid graph TD 模块依赖关系图（节点≤15个）"
  }
}

Mermaid 规则：graph TD 或 sequenceDiagram 开头，节点/参与者≤15个，A[名称] 格式，不要 HTML entities。
只输出 JSON，不要 markdown 代码块。"""


CODEBASE_SYNTHESIS_PROMPT = """你是一位资深软件架构师与技术方法论专家。基于前面已完成的项目概览分析和各模块深度分析，进行最后的提炼与总结。不要编造不存在的内容，不确定的地方标注"[不确定]"。

## 分析内容

### 一、顶层设计原则
贯穿全项目的通用设计思想（如"简单组件 + 强模型""只记稳态数据""防御性编程"等），归纳为可复用的设计原则。

### 二、设计决策检查清单
针对架构选型、存储、安全、检索、多协作、成本控制等场景，整理设计决策自问清单。

### 三、场景化最佳实践
不同场景下的技术选型建议（代码检索、长对话、多任务协作等）。
工程优化经验：成本控制、运维优化等。

### 四、行业共性问题与解法
该领域通用痛点，以及项目给出的解决方案。
现有方案的局限性、待解决的开放问题。

### 五、落地复刻思路
结合自身业务，哪些设计可以直接复用？哪些需要改造？哪些需要避坑？

## 输出格式

{
  "design_principles": [
    {
      "principle": "设计原则名称",
      "description": "原则说明（50字内）",
      "evidence": ["在哪些模块/代码中体现"],
      "reusability": "可复用性评估（高/中/低）"
    }
  ],
  "decision_checklist": [
    {
      "scenario": "决策场景（如'选择代码检索引擎'）",
      "questions": ["应该问自己的问题1", "应该问自己的问题2"],
      "guidance": "基于本项目的经验指导"
    }
  ],
  "best_practices": [
    {
      "scenario": "适用场景",
      "approach": "推荐做法",
      "why": "为什么这是最佳实践",
      "pitfalls": ["实施此做法时容易遇到的陷阱"]
    }
  ],
  "industry_problems": [
    {
      "problem": "行业通用痛点",
      "solution_in_project": "本项目给出的方案",
      "limitations": "现有方案的局限性",
      "open_questions": ["待解决的开放问题"]
    }
  ],
  "replication_guide": {
    "can_reuse": ["可直接复用的设计/模式"],
    "need_adaptation": [{"item": "需要改造的设计", "adaptation": "如何改造"}],
    "avoid": ["需要避坑的设计/模式"]
  }
}

只输出 JSON，不要 markdown 代码块。"""


def _build_module_prompt(module: dict) -> str:
    name = module["name"]
    file_count = module.get("file_count", 0)
    total_lines = module.get("total_lines", 0)
    key_files = module.get("key_files", [])[:8]

    parts = [f"模块: {name}  ({file_count} 文件, ~{total_lines} 行)"]
    parts.append("")

    for f in key_files:
        parts.append(f"## {f['path']} ({f.get('lines', 0)} 行)")
        content = f.get("content") or f.get("imports", "")
        if content:
            parts.append(f"```\n{content[:3000]}\n```")
        parts.append("")

    return "\n".join(parts)


def _build_codebase_overview_prompt(modules: list[dict], project_info: dict) -> str:
    total_files = project_info.get("total_files", 0)
    total_lines = project_info.get("total_lines", 0)
    tech_stack = project_info.get("tech_stack", {})
    entry_points = project_info.get("entry_points", [])

    parts = ["# 项目信息"]
    parts.append(f"- 文件总数: {total_files}")
    parts.append(f"- 代码行数: {total_lines}")
    parts.append(f"- 模块数量: {len(modules)}")
    if tech_stack:
        parts.append(f"- 技术栈: {json.dumps(tech_stack, ensure_ascii=False)}")
    if entry_points:
        parts.append(f"- 入口文件: {', '.join(entry_points)}")
    parts.append("")

    parts.append("# 模块清单")
    for m in modules[:40]:
        parts.append(f"- {m['name']}: {m.get('file_count', 0)} 文件, ~{m.get('total_lines', 0)} 行")
        for kf in m.get("key_files", [])[:3]:
            parts.append(f"  - {kf['path']} ({kf.get('lines', 0)} 行)")

    return "\n".join(parts)


def _build_methodology_synthesis_prompt(
    overview: dict,
    module_analyses: list[dict],
) -> str:
    parts = ["# 项目概览分析结论"]
    parts.append(json.dumps(overview, ensure_ascii=False, indent=2)[:8000])
    parts.append("")

    parts.append("# 模块深度分析摘要")
    for ma in module_analyses[:20]:
        summary = {
            "module": ma.get("name", ""),
            "purpose": ma.get("purpose", ""),
            "design_decisions": ma.get("design_decisions", [])[:3],
            "highlights": ma.get("highlights", [])[:3],
            "weaknesses": ma.get("weaknesses", [])[:2],
        }
        parts.append(json.dumps(summary, ensure_ascii=False, indent=2))
        parts.append("")

    return "\n".join(parts)


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
