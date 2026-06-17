# 电子书架 · Cloud Shelf

将技术内容变成一本本可以翻阅的「电子书」——收藏、整理、阅读你的数字书架。

Import GitHub repos, upload files, or fetch web pages as "books" on a digital shelf — organize, track reading progress, and read AI-generated chapter summaries.

---

## 功能 · Features

- **📚 书架界面** — 网格/列表视图，分类筛选，搜索，收藏，最近阅读
- **📥 多类型导入** — GitHub 仓库 / 本地文件 (epub/pdf/txt/doc/ppt/xlsx/html) / 网页链接
- **🤖 AI 书籍生成** — CrewAI 多智能体将 GitHub 仓库编排为章节式电子书
- **📖 在线阅读** — 支持 HTML/Markdown 内容格式，PDF/图片内嵌 iframe 阅读
- **📊 实时状态** — SSE 推送书籍生成进度，轮询兜底
- **📊 阅读进度** — 自动记录每本书的阅读进度
- **🐳 Docker 部署** — 多服务编排，支持热重载开发模式，开箱即用
- **🚀 一键启动** — `./run.sh` 本地双服务并行启动

---

## 技术栈 · Tech Stack

| 层 | 技术 |
|---|---|
| **前端** | React 18 + TypeScript, Vite 6, Tailwind CSS v4, shadcn/ui (Radix) |
| **后端** | Python 3.11+, FastAPI, SQLAlchemy (async), SQLite |
| **AI** | CrewAI 多智能体 (Chapter Researcher + Chapter Writer) |
| **部署** | Docker Compose (multi-service) |

---

## 快速开始 · Quick Start

### 前置要求

- Node.js 18+ & [pnpm](https://pnpm.io/installation) 10+
- Python 3.11+ & [uv](https://docs.astral.sh/uv/)
- LLM API Key（OpenAI 兼容接口，如 DeepSeek、OpenAI 等）
- GitHub Token（可选，提升 API 速率限制）

### 本地开发

```sh
# 一键启动（推荐）
./run.sh                    # 后端 :8000 + 前端 :5173

# 或手动分别启动
# 1. 后端
cd backend
cp .env.example .env       # 编辑 .env，填入 LLM_API_KEY
uv sync
uv run uvicorn app.main:app --reload --port 8000

# 2. 前端（新终端）
cd frontend
pnpm install
pnpm dev                    # http://localhost:5173
```

配置环境变量 `backend/.env` 后再运行。`./run.sh` 自动处理数据目录（本地默认 `backend/data/`，容器可通过 `DATA_DIR` 指定）。

### Docker 快速启动

```sh
# 1. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入 LLM_API_KEY 和 GITHUB_TOKEN

# 2. 启动（生产模式 — nginx + uvicorn）
docker compose up -d --build

# 3. 验证
curl http://localhost:8000/api/health   # 后端
curl http://localhost/                  # 前端 (nginx:80)
```

---

## Docker 部署 · Docker Deployment

### 架构

```
            Docker Network
   ┌──────────┐         ┌──────────┐
   │ frontend │ ──proxy─│ backend  │
   │ nginx:80 │  /api/  │ uvicorn  │
   │          │         │ :8000    │
   └──────────┘         └──────────┘
        ↑                    ↑
   http://localhost    http://localhost:8000
```

### 生产模式

```sh
docker compose up -d --build
```

Nginx 提供前端静态文件，`/api/` 请求反向代理到后端。数据持久化在 Docker volume `backend_data`。

### 开发模式（热重载）

```sh
docker compose -f docker-compose.dev.yml up --build
```

- **前端**: Vite dev server + HMR，`src/` 目录挂载为 volume，代码改动即时生效
- **后端**: uvicorn `--reload`，`app/` 目录挂载为 volume

### 端口映射

| 服务 | 容器端口 | 宿主机端口 | 说明 |
|------|---------|-----------|------|
| 前端 (nginx) | 80 | 80 | 静态文件 + API 代理 |
| 后端 (uvicorn) | 8000 | 8000 | REST API + Swagger 文档 |

修改 `docker-compose.yml` 中的端口映射即可自定义。

---

## 配置 · Configuration

`backend/.env`:

```ini
# 必需 — LLM 配置 (OpenAI 兼容接口)
LLM_API_KEY=sk-xxx                          # API 密钥
LLM_BASE_URL=https://api.deepseek.com       # API 地址
LLM_MODEL=deepseek-v4-flash                 # 模型名称

# 可选 — GitHub Token（提升速率限制 60→5000 req/hr）
GITHUB_TOKEN=ghp_xxx

# 可选 — 书籍生成参数
BOOK_LANGUAGE=zh                            # 生成语言
BOOK_MAX_CHAPTERS=16                        # 最大章节数
LLM_MAX_PARALLEL_CHAPTERS=3                 # 并行生成章节数

# 后端配置
DATA_DIR=                                    # 数据目录（留空 = 自动检测 backend/data/）
CORS_ORIGINS=["http://localhost:5173"]
PORT=8000
```

---

## API 端点 · API Endpoints

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/repos` | 仓库列表 (filter: category, favorite, search) |
| POST | `/api/repos/add` | 添加仓库 (`{ "full_name": "owner/repo" }`) |
| GET | `/api/repos/{id}` | 仓库详情 + 阅读进度 + 内容章节 |
| PATCH | `/api/repos/{id}` | 更新分类/标签/收藏 |
| DELETE | `/api/repos/{id}` | 删除仓库 |
| POST | `/api/repos/{id}/fetch-readme` | 拉取 GitHub README |
| GET | `/api/reading/progress/{repo_id}` | 获取阅读进度 |
| POST | `/api/reading/progress` | 更新阅读进度 |
| POST | `/api/agents/generate-book/{repo_id}` | 触发 AI 书籍生成 |
| GET | `/api/agents/book-status/{repo_id}` | 查询生成状态（轮询） |
| GET | `/api/agents/book-status/{repo_id}/stream` | SSE 实时状态推送 |
| GET | `/api/books` | 书籍列表（含生成状态 + 导入书籍） |
| GET | `/api/books/{book_id}` | 书籍内容（支持生成书 + 导入书） |
| GET | `/api/books/by-repo/{repo_id}` | 获取 GitHub 书籍 HTML 内容 |
| POST | `/api/imports/upload` | 上传文件（multipart） |
| POST | `/api/imports/import-url` | 导入网页链接 |
| GET | `/api/imports/{id}/file` | 获取上传文件（内嵌显示） |
| GET | `/api/imports/{id}/content` | 获取网页内容 |

### 导入流程

**GitHub 仓库：**
```
ImportDialog → POST /repos/add → POST /repos/{id}/fetch-readme → POST /agents/generate-book/{id}
```
导入后书籍立即出现在书架上（状态: `pending`），AI 生成过程中通过 SSE 实时推送状态（`fetching → planning → cover → writing → reviewing → publishing → done`）。

**文件上传：**
```
ImportDialog (拖拽) → POST /imports/upload → 书籍立即可读 → 阅读时 GET /imports/{id}/file (内嵌 iframe)
```

**网页链接：**
```
ImportDialog (URL) → POST /imports/import-url → 抓取网页内容 → 书籍立即可读（HtmlReader）
```

---

## 部署到远程服务器 · Remote Deployment

### 前提

1. 远程服务器已安装 Docker & Docker Compose
2. SSH 免密登录（或密码 + sshpass）
3. 服务器能访问外网（或配置 Docker 镜像加速器）

### 1. 推送代码

```sh
# 方式 A: Git
git push origin main
ssh remote-vps 'git clone <repo-url> /opt/cloudshelf'

# 方式 B: rsync
rsync -avz --exclude node_modules --exclude .venv . remote-vps:/opt/cloudshelf/
```

### 2. 配置环境变量

```sh
ssh remote-vps 'cat > /opt/cloudshelf/backend/.env << EOF
LLM_API_KEY=sk-xxx
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-flash
GITHUB_TOKEN=ghp_xxx
CORS_ORIGINS=["http://服务器IP"]
DATA_DIR=
PORT=8000
EOF'
```

### 3. 启动服务

```sh
ssh remote-vps 'cd /opt/cloudshelf && docker compose up -d --build'
```

如果服务器带宽有限，可以本地构建镜像后推送至镜像仓库，远程拉取：

```sh
# 本地
docker tag github-tech-reader-v2-backend ttl.sh/cloudshelf-backend:2h
docker push ttl.sh/cloudshelf-backend:2h

# 远程
docker pull ttl.sh/cloudshelf-backend:2h
docker compose up -d
```

### 4. 端口映射（可选）

如果服务器对外端口被防火墙限制，可使用反向代理或端口转发：

```sh
# SSH 隧道（本地访问）
ssh -N -L 8080:localhost:80 remote-vps
# 访问 http://localhost:8080

# 或修改 docker-compose.yml 映射到开放端口
# 例如: "19577:80"  映射 WAN 端口 19577 到容器 80
```

---

## 项目结构 · Project Structure

```
github-tech-reader-v2/
├── run.sh                         # 一键启动脚本（本地开发）
├── Dockerfile                     # 多阶段构建 (生产用，单容器)
├── docker-compose.yml             # 生产部署 (frontend + backend)
├── docker-compose.dev.yml         # 开发模式 (热重载)
├── frontend/                      # React SPA
│   ├── Dockerfile                 # Nginx 生产镜像
│   ├── Dockerfile.dev             # Vite dev server 镜像
│   ├── nginx.conf                 # Nginx 反向代理配置
│   └── src/
│       ├── app/                   # App 组件 & 页面
│       ├── components/            # BookCard, Sidebar, ImportDialog, ReaderModal
│       ├── components/readers/    # EpubReader, PdfReader, HtmlReader, FileReader
│       ├── components/ui/         # shadcn/ui 组件库
│       ├── hooks/                 # useBookStatus (SSE + 轮询)
│       ├── config/                # API 地址配置
│       └── styles/                # Tailwind, 主题, 字体
├── backend/                       # FastAPI
│   ├── Dockerfile                 # Python 生产镜像
│   ├── pyproject.toml             # Python 依赖 (uv)
│   └── app/
│       ├── main.py                # FastAPI 入口, CORS, 生命周期
│       ├── core/                  # 配置, 数据库引擎
│       ├── models/                # SQLAlchemy ORM (Repo, BookGeneration, ImportedBook, ContentSection)
│       ├── api/                   # REST 端点 (repos, reading, agents, books, imports)
│       ├── services/              # GitHub API 客户端 (httpx)
│       ├── events.py              # SSE 事件发布/订阅
│       └── agents/                # CrewAI 多智能体 (书籍生成)
└── docs/                          # Figma 设计原型
```

---

## 端口 · Ports

| 模式 | 端口 | 说明 |
|------|------|------|
| 本地开发 (前端) | `5173` | Vite dev server |
| 本地开发 (后端) | `8000` | uvicorn --reload |
| Docker 生产 (前端) | `80` | Nginx 静态 + API 代理 |
| Docker 生产 (后端) | `8000` | uvicorn |
| Docker 开发 (前端) | `5173` | Vite + HMR |
| Docker 开发 (后端) | `8000` | uvicorn --reload |

---

## License

MIT
