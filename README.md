# 电子书架 · Cloud Shelf

将 GitHub 技术仓库变成一本本可以翻阅的「电子书」——收藏、整理、阅读你的技术书架。

Import GitHub repos as "books" on a digital shelf — organize, track reading progress, and read AI-generated chapter summaries.

## 功能 · Features

- **📚 书架界面** — 网格/列表视图，分类筛选，搜索，收藏，最近阅读
- **📥 导入 GitHub 仓库** — 通过 `owner/repo` 一键添加到书架
- **🤖 AI 生成书籍** — CrewAI 多智能体将 README 内容自动编排为章节式「电子书」
- **📖 阅读进度追踪** — 记录每本书的阅读进度
- **🎨 多种阅读器** — 支持 Markdown / HTML 等内容格式的在线阅读

## 技术栈 · Tech Stack

| 层 | 技术 |
|---|---|
| **前端** | React 18 + TypeScript, Vite 6, Tailwind CSS v4, shadcn/ui (Radix) |
| **后端** | Python 3.11+, FastAPI, SQLAlchemy (async), SQLite |
| **AI** | CrewAI 多智能体框架 |
| **部署** | Docker Compose / Render |

## 快速开始 · Quick Start

### 前置要求

- Node.js 18+ & [pnpm](https://pnpm.io/installation)
- Python 3.11+ & [uv](https://docs.astral.sh/uv/)
- (可选) GitHub Token — 提升 API 速率限制
- (必需) LLM API Key — 用于 CrewAI 书籍生成

### 1. 后端 · Backend

```sh
cd backend

# 安装依赖
uv sync

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入 LLM_API_KEY 和可选的 GITHUB_TOKEN

# 启动 API 服务 (端口 8000)
uv run uvicorn app.main:app --reload --port 8000
```

API 文档：打开 http://localhost:8000/docs

### 2. 前端 · Frontend

```sh
cd frontend

# 安装依赖
pnpm install

# 启动开发服务器 (端口 5173)
pnpm dev
```

打开 http://localhost:5173

## 配置 · Configuration

后端 `.env` 配置项：

```ini
LLM_API_KEY=sk-xxx              # 必需：LLM API 密钥
LLM_BASE_URL=https://api.openai.com/v1   # OpenAI 兼容 API 地址
LLM_MODEL=gpt-4o-mini           # 模型名称
GITHUB_TOKEN=ghp_xxx            # 可选：提升 GitHub API 速率限制
DATABASE_URL=sqlite+aiosqlite:///data/reader.db
CORS_ORIGINS=["http://localhost:5173"]
```

## 项目结构 · Project Structure

```
github-tech-reader-v2/
├── Dockerfile               # 多阶段构建: 前端编译 → Python 全栈镜像
├── docker-compose.yml       # 单服务编排
├── frontend/                # React SPA (pnpm + Vite)
│   └── src/
│       ├── app/             # 页面组件 & 布局
│       ├── components/      # shadcn/ui, BookCard, Sidebar, ReaderModal
│       └── styles/          # Tailwind, 主题, 字体
├── backend/                 # FastAPI (uv)
│   └── app/
│       ├── main.py          # FastAPI 入口, CORS, 生命周期, 静态文件挂载
│       ├── core/            # 配置, 数据库引擎
│       ├── models/          # SQLAlchemy ORM 模型
│       ├── api/             # REST 端点
│       ├── services/        # GitHub API 客户端
│       └── agents/          # CrewAI 多智能体团队
└── docs/                    # Figma 设计原型
```

## API 端点 · API Endpoints

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/repos` | 获取仓库列表 |
| POST | `/api/repos/add` | 添加 GitHub 仓库 |
| GET | `/api/repos/{id}` | 获取仓库详情与阅读进度 |
| PATCH | `/api/repos/{id}` | 更新分类/标签/收藏 |
| DELETE | `/api/repos/{id}` | 删除仓库 |
| POST | `/api/repos/{id}/fetch-readme` | 拉取 README |
| GET | `/api/reading/progress/{repo_id}` | 获取阅读进度 |
| POST | `/api/reading/progress` | 更新阅读进度 |
| POST | `/api/agents/generate-book/{repo_id}` | 触发 AI 书籍生成 |
| GET | `/api/books` | 获取生成的书籍列表 |
| GET | `/api/books/by-repo/{repo_id}` | 获取书籍 HTML 内容 |

## 导入流程 · Import Flow

```
ImportDialog → POST /repos/add → POST /repos/{id}/fetch-readme → POST /agents/generate-book/{id}
```

导入后书籍立即出现在书架上（状态：`writing`），AI 生成完成后内容变为可读（状态：`done`）。

## 部署 · Deployment

### Docker Compose（推荐）

单镜像，一条命令上线。

```sh
# 1. 配置后端环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入 LLM_API_KEY 和可选的 GITHUB_TOKEN

# 2. 构建并启动
docker compose up -d --build

# 3. 验证
curl http://localhost:8000/api/health
```

**架构说明：** 多阶段 Docker 构建——先 `pnpm build` 编译前端，再将产物复制到 Python 镜像。FastAPI 同时提供 API 和前端静态文件，浏览器访问同源。

自定义端口：

```sh
PORT=8080 docker compose up -d --build
```

### Render（免费套餐）

1. 在 Render Dashboard 中创建新的 Web Service
2. 连接到 GitHub 仓库
3. 配置环境变量：`LLM_API_KEY`, `GITHUB_TOKEN`, `CORS_ORIGINS`

免费套餐：512 MB RAM，750 小时/月。

## 端口 · Ports

| 模式 | 端口 | 说明 |
|------|------|------|
| 本地开发 (前端) | `5173` | Vite dev server |
| 本地开发 (后端) | `8000` | uvicorn --reload |
| Docker 部署 | `8000` 或 `$PORT` | 单容器，FastAPI 全栈服务 |

## License

MIT
