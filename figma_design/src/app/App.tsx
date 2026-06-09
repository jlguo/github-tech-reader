import { Github, Calendar, FileText, RefreshCw, Download } from 'lucide-react';
import { Timeline } from './components/Timeline';
import { IterationCard } from './components/IterationCard';
import { Button } from './components/ui/button';
import { Separator } from './components/ui/separator';

// 模拟数据
const mockIterations = [
  {
    id: 'iteration-1',
    version: 'v1.0.0',
    releaseDate: '2024-01-15',
    changeType: 'architecture' as const,
    summary:
      '项目初始版本发布，采用传统的 MVC 架构模式。前端使用 jQuery + Bootstrap 构建，后端基于 Express.js，数据库使用 MySQL。此版本建立了基本的用户管理、数据展示和简单的 CRUD 操作功能。',
    architectureChanges: {
      before: '无',
      after: 'MVC 架构 - jQuery + Express + MySQL',
    },
    majorChanges: [
      {
        title: '基础框架搭建',
        description: '建立项目基本目录结构，配置开发环境',
      },
      {
        title: '用户认证模块',
        description: '实现基于 Session 的用户登录认证系统',
      },
      {
        title: 'RESTful API 设计',
        description: '定义核心业务接口规范',
      },
    ],
  },
  {
    id: 'iteration-2',
    version: 'v2.0.0',
    releaseDate: '2024-06-20',
    changeType: 'architecture' as const,
    summary:
      '重大架构升级，从传统 MVC 迁移至现代化前后端分离架构。前端重构为 React + TypeScript + Vite，引入组件化开发模式。后端升级为 Node.js + NestJS 框架，采用模块化设计。数据库迁移至 PostgreSQL，引入 TypeORM 进行数据管理。此次升级显著提升了代码可维护性和开发效率。',
    architectureChanges: {
      before: 'MVC 架构 - jQuery + Express',
      after: 'React + NestJS + PostgreSQL 前后端分离',
    },
    performanceData: [
      {
        metric: '首屏加载时间',
        before: 3.2,
        after: 1.8,
        unit: 's',
      },
      {
        metric: 'API 响应时间',
        before: 450,
        after: 180,
        unit: 'ms',
      },
    ],
    majorChanges: [
      {
        title: '前端技术栈重构',
        description: 'jQuery → React 18 + TypeScript + Vite，引入现代化构建工具',
      },
      {
        title: '后端框架升级',
        description: 'Express → NestJS，支持依赖注入、装饰器等现代特性',
      },
      {
        title: '数据库迁移',
        description: 'MySQL → PostgreSQL + TypeORM，支持更复杂的查询和事务处理',
      },
      {
        title: '引入 ESLint + Prettier',
        description: '统一代码风格，提升代码质量',
      },
    ],
  },
  {
    id: 'iteration-3',
    version: 'v2.5.0',
    releaseDate: '2024-09-10',
    changeType: 'performance' as const,
    summary:
      '性能优化专项迭代。前端实施代码分割、懒加载、虚拟滚动等优化策略，引入 React Query 进行数据缓存管理。后端优化数据库查询，添加 Redis 缓存层，实现接口响应速度大幅提升。整体页面加载性能提升 60%，用户体验显著改善。',
    performanceData: [
      {
        metric: '首屏加载时间',
        before: 1.8,
        after: 0.7,
        unit: 's',
      },
      {
        metric: 'API 响应时间',
        before: 180,
        after: 45,
        unit: 'ms',
      },
      {
        metric: 'Bundle 体积',
        before: 850,
        after: 320,
        unit: 'KB',
      },
      {
        metric: '内存占用',
        before: 125,
        after: 68,
        unit: 'MB',
      },
    ],
    majorChanges: [
      {
        title: 'React Query 集成',
        description: '引入服务端状态管理，实现智能缓存和自动重新验证',
      },
      {
        title: 'Redis 缓存层',
        description: '热点数据缓存，减少数据库查询压力',
      },
      {
        title: '代码分割优化',
        description: '按路由进行代码分割，实现按需加载',
      },
      {
        title: '图片懒加载',
        description: '使用 Intersection Observer API 实现图片延迟加载',
      },
      {
        title: '数据库索引优化',
        description: '为高频查询字段添加复合索引',
      },
    ],
  },
  {
    id: 'iteration-4',
    version: 'v3.0.0',
    releaseDate: '2024-12-05',
    changeType: 'feature' as const,
    summary:
      '功能扩展版本，新增实时通讯、多语言支持、主题切换等核心功能。引入 Socket.io 实现 WebSocket 双向通信，支持即时消息推送。集成 i18next 实现国际化，支持中英文切换。添加深色模式支持，优化夜间使用体验。整体功能完整度提升 40%。',
    majorChanges: [
      {
        title: 'WebSocket 实时通讯',
        description: '基于 Socket.io 实现实时消息推送和在线状态同步',
      },
      {
        title: '国际化支持',
        description: '集成 i18next，支持中英文切换，可扩展更多语言',
      },
      {
        title: '深色模式',
        description: '添加主题切换功能，支持浅色/深色两种主题',
      },
      {
        title: '文件上传优化',
        description: '支持大文件分片上传、断点续传',
      },
      {
        title: '权限管理升级',
        description: '引入 RBAC 角色权限控制系统',
      },
    ],
  },
];

const timelineNodes = mockIterations.map((iteration) => ({
  version: iteration.version,
  releaseDate: iteration.releaseDate,
  id: iteration.id,
}));

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: '"Noto Sans SC", "Inter", sans-serif' }}>
      {/* 页面头部标题区 */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <Github className="w-8 h-8 text-gray-900" />
                <h1 className="text-2xl font-medium text-gray-900">
                  React Admin Dashboard
                </h1>
              </div>
              <div className="flex items-center gap-6 text-sm text-gray-600">
                <a
                  href="https://github.com/example/react-admin"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span className="font-mono">github.com/example/react-admin</span>
                </a>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>分析时间: 2026-06-07</span>
                </div>
              </div>
              <p className="mt-3 text-sm text-gray-600 max-w-3xl">
                本报告分析了该开源仓库从初始版本到当前版本的完整迭代历程，涵盖架构演进、性能优化和功能扩展等关键技术变更，帮助理解项目的技术决策和发展路径。
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-8 py-8 space-y-8">
        {/* 全局迭代时间轴区 */}
        <Timeline nodes={timelineNodes} />

        <Separator className="my-8" />

        {/* 迭代详情卡片列表 */}
        <div className="space-y-6">
          <h2 className="text-xl font-medium text-gray-900">迭代详情</h2>
          {mockIterations.map((iteration) => (
            <IterationCard key={iteration.id} {...iteration} />
          ))}
        </div>
      </main>

      {/* 页脚区域 */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <p className="mb-1">© 2026 GitHub 仓库迭代分析报告</p>
              <p className="text-xs text-gray-500">
                本报告由自动化分析工具生成，基于代码提交历史、发布记录和技术文档综合分析
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2 text-gray-700 hover:text-blue-600"
              >
                <RefreshCw className="w-4 h-4" />
                重新分析
              </Button>
              <Button
                variant="default"
                size="sm"
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Download className="w-4 h-4" />
                导出报告
              </Button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}