import { useState } from 'react';
import { GitCommit } from 'lucide-react';

interface TimelineNode {
  version: string;
  releaseDate: string;
  id: string;
}

interface TimelineProps {
  nodes: TimelineNode[];
}

export function Timeline({ nodes }: TimelineProps) {
  const [activeNode, setActiveNode] = useState<string | null>(null);

  const scrollToIteration = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
      setActiveNode(id);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-8 shadow-sm">
      <h3 className="text-sm font-medium text-gray-700 mb-6">迭代时间轴</h3>
      <div className="relative">
        {/* 时间轴横线 */}
        <div className="absolute top-6 left-0 right-0 h-0.5 bg-gray-200" />

        {/* 时间轴节点 */}
        <div className="flex justify-between items-start relative">
          {nodes.map((node, idx) => (
            <div key={node.id} className="flex flex-col items-center" style={{ flex: 1 }}>
              {/* 节点圆点 */}
              <button
                onClick={() => scrollToIteration(node.id)}
                onMouseEnter={() => setActiveNode(node.id)}
                onMouseLeave={() => setActiveNode(null)}
                className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-200 relative z-10 ${
                  activeNode === node.id
                    ? 'bg-blue-600 border-blue-600 shadow-lg scale-110'
                    : 'bg-white border-gray-300 hover:border-blue-400 hover:scale-105'
                }`}
              >
                <GitCommit
                  className={`w-5 h-5 ${
                    activeNode === node.id ? 'text-white' : 'text-gray-600'
                  }`}
                />
              </button>

              {/* 节点信息 */}
              <div className="mt-4 text-center">
                <div
                  className={`text-sm font-medium mb-1 transition-colors ${
                    activeNode === node.id ? 'text-blue-600' : 'text-gray-900'
                  }`}
                >
                  {node.version}
                </div>
                <div className="text-xs text-gray-500">{node.releaseDate}</div>
              </div>

              {/* 连接线（除了最后一个节点） */}
              {idx < nodes.length - 1 && (
                <div className="absolute top-6 h-0.5 bg-gray-200" style={{ left: '50%', right: '-50%' }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
