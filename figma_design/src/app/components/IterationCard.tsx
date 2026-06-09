import { useState } from 'react';
import { ChevronDown, ChevronUp, GitBranch, TrendingUp, Zap } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';

interface ChangeItem {
  title: string;
  description: string;
}

interface IterationCardProps {
  version: string;
  releaseDate: string;
  summary: string;
  changeType: 'architecture' | 'performance' | 'feature';
  architectureChanges?: {
    before: string;
    after: string;
  };
  performanceData?: {
    metric: string;
    before: number;
    after: number;
    unit: string;
  }[];
  majorChanges?: ChangeItem[];
  id?: string;
}

const changeTypeConfig = {
  architecture: {
    label: '架构变更',
    color: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    icon: GitBranch,
  },
  performance: {
    label: '性能优化',
    color: 'bg-green-500/10 text-green-600 border-green-500/20',
    icon: TrendingUp,
  },
  feature: {
    label: '功能变更',
    color: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    icon: Zap,
  },
};

export function IterationCard({
  version,
  releaseDate,
  summary,
  changeType,
  architectureChanges,
  performanceData,
  majorChanges,
  id,
}: IterationCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const config = changeTypeConfig[changeType];
  const Icon = config.icon;

  return (
    <Card id={id} className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
      {/* 卡片头部 - 可折叠控制区 */}
      <div
        className="flex items-center justify-between p-6 cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-medium text-gray-900">{version}</h3>
          </div>
          <Badge className={`${config.color} border font-normal px-3 py-1`}>
            {config.label}
          </Badge>
          <span className="text-sm text-gray-500">{releaseDate}</span>
        </div>
        <button className="p-1 hover:bg-gray-100 rounded transition-colors">
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-600" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-600" />
          )}
        </button>
      </div>

      {/* 可折叠内容区 */}
      {isExpanded && (
        <div className="px-6 pb-6">
          <Separator className="mb-6" />

          {/* 第一块：迭代基础信息 + 核心技术变更 */}
          <div className="mb-8">
            <h4 className="text-sm font-medium text-gray-700 mb-3">核心变更说明</h4>
            <p className="text-sm text-gray-600 leading-relaxed">{summary}</p>
          </div>

          {/* 第二块：架构对比区域 */}
          {architectureChanges && (
            <div className="mb-8">
              <h4 className="text-sm font-medium text-gray-700 mb-4">架构对比</h4>
              <div className="grid grid-cols-2 gap-6">
                {/* 旧架构容器 */}
                <div className="border border-gray-200 rounded-lg p-6 bg-gray-50/30">
                  <div className="text-xs text-gray-500 mb-3">旧架构</div>
                  <div className="border-2 border-dashed border-gray-300 rounded-md p-8 bg-white min-h-[200px] flex items-center justify-center">
                    <div className="text-center text-gray-400">
                      <div className="text-sm font-mono mb-2">Mermaid 架构图容器</div>
                      <div className="text-xs">{architectureChanges.before}</div>
                    </div>
                  </div>
                </div>

                {/* 新架构容器 */}
                <div className="border border-blue-200 rounded-lg p-6 bg-blue-50/30">
                  <div className="text-xs text-blue-600 mb-3">新架构</div>
                  <div className="border-2 border-dashed border-blue-300 rounded-md p-8 bg-white min-h-[200px] flex items-center justify-center">
                    <div className="text-center text-blue-400">
                      <div className="text-sm font-mono mb-2">Mermaid 架构图容器</div>
                      <div className="text-xs">{architectureChanges.after}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 第三块：逻辑时序图区域 */}
          {architectureChanges && (
            <div className="mb-8">
              <h4 className="text-sm font-medium text-gray-700 mb-4">逻辑时序图</h4>
              <div className="border border-gray-200 rounded-lg p-6 bg-gray-50/30">
                <div className="border-2 border-dashed border-gray-300 rounded-md p-12 bg-white min-h-[240px] flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <div className="text-sm font-mono mb-2">Mermaid 时序图容器</div>
                    <div className="text-xs">流程时序图 - 完整宽度画布</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 第四块：性能数据可视化区域 */}
          {performanceData && performanceData.length > 0 && (
            <div className="mb-8">
              <h4 className="text-sm font-medium text-gray-700 mb-4">性能指标对比</h4>
              <div className="border border-gray-200 rounded-lg p-6 bg-gray-50/30">
                <div className="border-2 border-dashed border-green-300 rounded-md p-12 bg-white min-h-[280px] flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <div className="text-sm font-mono mb-3">ECharts 图表容器</div>
                    <div className="text-xs mb-4">柱状图/折线图 - 性能优化前后对比</div>
                    <div className="text-xs text-left max-w-md mx-auto space-y-1">
                      {performanceData.map((item, idx) => (
                        <div key={idx} className="font-mono text-gray-500">
                          {item.metric}: {item.before} → {item.after} {item.unit}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 第五块：重大变更清单 */}
          {majorChanges && majorChanges.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-4">重大变更清单</h4>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {majorChanges.map((change, idx) => (
                    <div key={idx} className="p-4 hover:bg-gray-50/50 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-2 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900 mb-1">
                            {change.title}
                          </div>
                          <div className="text-xs text-gray-600">{change.description}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
